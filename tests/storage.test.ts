import "fake-indexeddb/auto";
import { deleteDB, openDB } from "idb";
import { beforeEach, describe, it, expect } from "vitest";
import {
  answerSession,
  backupRevision,
  continueSession,
  datasetVersion,
  emptySnapshot,
  encodeBackup,
  exportProgress,
  hintSession,
  importProgress,
  loadSnapshot,
  parseBackup,
  startSession,
  validateSnapshot,
} from "../src/storage";
import { defaults } from "../src/domain/session";
import data from "../src/data/vocabulary.json";
const gladius = data.find((w) => w.latin === "gladius")!;
const targeted = {
  ...defaults,
  mode: "custom" as const,
  direction: "le" as const,
  ids: [gladius.id],
  count: 1,
};
beforeEach(async () => {
  await deleteDB("gcse-latin-mastery");
});
describe("browser persistence and atomic review updates", () => {
  it("starts empty and saves an exact review across reopened database connections", async () => {
    expect(await loadSnapshot()).toEqual(emptySnapshot);
    const { session } = await startSession(targeted);
    await answerSession(session, "sword", false);
    const saved = await loadSnapshot();
    expect(saved.attempts).toHaveLength(1);
    expect(saved.states[0].skill).toBe("le");
    expect(saved.activeSession?.finished).toBe(true);
  });
  it("keeps directions independent across sessions", async () => {
    const le = await startSession(targeted);
    await answerSession(le.session, "sword", false);
    const el = await startSession({ ...targeted, direction: "el" });
    await answerSession(el.session, "wrong", false);
    const saved = await loadSnapshot();
    expect(saved.states.find((s) => s.skill === "le")?.successes).toBe(1);
    expect(saved.states.find((s) => s.skill === "el")?.failures).toBe(1);
  });
  it("serializes concurrent duplicate submissions exactly once", async () => {
    const { session } = await startSession(targeted);
    await Promise.all([
      answerSession(session, "sword", false),
      answerSession(session, "wrong", false),
    ]);
    const saved = await loadSnapshot();
    expect(saved.attempts).toHaveLength(1);
    expect(saved.states[0].successes + saved.states[0].failures).toBe(1);
  });
  it("rejects a replaced session from another tab", async () => {
    const old = await startSession(targeted);
    await startSession({ ...targeted, direction: "el" });
    await expect(answerSession(old.session, "sword", false)).rejects.toThrow(
      "Another tab",
    );
    expect((await loadSnapshot()).attempts).toHaveLength(0);
  });
  it("persists hints and rejects stale revisions without writing", async () => {
    const { session } = await startSession(targeted);
    const hinted = await hintSession(session);
    expect((await loadSnapshot()).activeSession?.hinted).toBe(true);
    await expect(answerSession(session, "sword", false)).rejects.toThrow(
      "Another tab",
    );
    await answerSession(hinted.session, "sword", false);
    expect((await loadSnapshot()).attempts[0].outcome).toBe("Hinted");
  });
  it("saves next-question state without replaying previous feedback", async () => {
    const { session } = await startSession({
      ...targeted,
      count: 0,
      direction: "mixed",
    });
    const r = await answerSession(session, "wrong", false);
    expect(r.session.lastGrade).toBeDefined();
    const next = await continueSession(r.session);
    expect((await loadSnapshot()).activeSession?.lastGrade).toBeUndefined();
    expect(next.session.cursor).toBe(1);
  });
  it("records repeated confusions in persistent storage", async () => {
    const q = data.find((w) => w.latin === "quaero")!;
    const { session } = await startSession({
      ...targeted,
      direction: "el",
      ids: [q.id],
    });
    const r = await answerSession(session, "rogo", false);
    await answerSession(r.session, "rogo", false);
    expect((await loadSnapshot()).confusions[0].count).toBe(2);
  });
  it("does not silently overwrite corrupt browser data", async () => {
    const db = await openDB("gcse-latin-mastery", 1, {
      upgrade(db) {
        db.createObjectStore("progress");
      },
    });
    await db.put(
      "progress",
      { revision: 1, snapshot: { broken: true } },
      "current",
    );
    db.close();
    await expect(loadSnapshot()).rejects.toThrow("Invalid progress");
  });
});
describe("validated manual backups", () => {
  it("exports and imports the complete history, directions and session", async () => {
    const { session } = await startSession(targeted);
    await answerSession(session, "sword", false);
    const before = await loadSnapshot();
    const text = await exportProgress();
    expect(parseBackup(text)).toEqual(before);
    await startSession({ ...targeted, direction: "el" });
    await importProgress(text, await backupRevision());
    expect(await loadSnapshot()).toEqual(before);
  });
  it("refuses malformed JSON and unknown backup versions/datasets", () => {
    expect(() => parseBackup("{broken")).toThrow("valid JSON");
    const b = JSON.parse(encodeBackup(emptySnapshot));
    for (const patch of [
      { version: 2 },
      { dataset: "other" },
      { app: "other" },
    ])
      expect(() => parseBackup(JSON.stringify({ ...b, ...patch }))).toThrow(
        "supported",
      );
  });
  it("rejects nonfinite metrics, unknown IDs, duplicate cards and impossible session positions", async () => {
    const { session } = await startSession(targeted);
    await answerSession(session, "sword", false);
    const s = await loadSnapshot();
    expect(() =>
      validateSnapshot({ ...s, states: [...s.states, ...s.states] }),
    ).toThrow("duplicate");
    const bad = structuredClone(s);
    bad.states[0].card.stability = Infinity;
    expect(() => validateSnapshot(bad)).toThrow();
    bad.states[0].card.stability = 1;
    bad.states[0].word_id = 999;
    expect(() => validateSnapshot(bad)).toThrow();
    expect(() =>
      validateSnapshot({
        ...s,
        activeSession: { ...s.activeSession, cursor: 50 },
      }),
    ).toThrow();
  });
  it("rejects prototype fields and oversized payloads", () => {
    const b = JSON.parse(encodeBackup(emptySnapshot));
    b.snapshot.__proto__ = { polluted: true };
    expect(() =>
      parseBackup(
        JSON.stringify({
          ...b,
          snapshot: {
            ...b.snapshot,
            constructor: { prototype: { polluted: true } },
          },
        }),
      ),
    ).toThrow();
    expect(() => parseBackup(" ".repeat(25000001))).toThrow("25 MB");
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
  it("does not replace data after another tab changes progress during import", async () => {
    const backup = encodeBackup(emptySnapshot);
    const revision = await backupRevision();
    await startSession(targeted);
    await expect(importProgress(backup, revision)).rejects.toThrow(
      "Progress changed",
    );
    expect((await loadSnapshot()).activeSession).not.toBeNull();
  });
  it("invalid imports leave existing progress intact", async () => {
    await startSession(targeted);
    const before = await loadSnapshot();
    await expect(
      importProgress(
        JSON.stringify({ dataset: datasetVersion }),
        await backupRevision(),
      ),
    ).rejects.toThrow();
    expect(await loadSnapshot()).toEqual(before);
  });
});
