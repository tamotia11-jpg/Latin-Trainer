import { openDB, type DBSchema } from "idb";
import { z } from "zod";
import data from "./data/vocabulary.json";
import {
  applyAnswer,
  makeSession,
  skillsFor,
  validateSettings,
} from "./domain/session";
import { expected } from "./domain/grading";
import type { PracticeSession, Settings, Snapshot, Word } from "./domain/types";

const words = data as Word[];
export const emptySnapshot: Snapshot = {
  states: [],
  confusions: [],
  attempts: [],
  activeSession: null,
};
export const datasetVersion =
  "484db37c1cc6d00d873dcdd85f3298728d53ebfff934e3e11aa94682e6be8001";
const skill = z.enum([
  "le",
  "el",
  "parts",
  "gender",
  "declension",
  "conjugation",
  "case",
  "status",
]);
const outcome = z.enum([
  "Exact",
  "Minor typo",
  "Wrong",
  "Skipped",
  "Hinted",
  "Introduced",
]);
const id = z.number().int().min(0).max(449);
const count = z.number().int().min(0).max(1000000);
const timestamp = z.iso.datetime({ offset: true }).max(40);
const question = z
  .object({
    wordId: id,
    skill,
    repeat: z.number().int().min(0).max(2),
    options: z.array(id).length(4).optional(),
    contrastId: id.optional(),
  })
  .strict();
const attempt = z
  .object({
    word_id: id,
    skill,
    raw: z.string().max(500),
    outcome,
    at: timestamp,
    response_ms: z.number().min(0).max(3600000),
    format: z.enum(["type", "mcq", "flash"]),
    repeat: z.number().int().min(0).max(2),
    confusionId: id.optional(),
  })
  .strict();
const settings = z
  .object({
    mode: z.enum(["daily", "learn", "custom", "exam"]),
    format: z.enum(["type", "mcq", "flash"]),
    direction: z.enum(["le", "el", "mixed", "parts", "grammar"]),
    sections: z.array(z.number().int().min(1).max(15)).min(1).max(15),
    count: z.number().int().min(0).max(900),
    pos: z.string().max(30),
    filter: z.enum(["all", "weak", "new", "due", "mastered", "confused"]),
    ids: z.array(id).max(450).optional(),
  })
  .strict();
const snapshotSchema = z
  .object({
    states: z
      .array(
        z
          .object({
            word_id: id,
            skill,
            card: z
              .object({
                due: timestamp,
                stability: z.number().min(0).max(1000000),
                difficulty: z.number().min(0).max(10),
                elapsed_days: count,
                scheduled_days: count,
                learning_steps: count,
                reps: count,
                lapses: count,
                state: z.number().int().min(0).max(3),
                last_review: timestamp.optional(),
              })
              .strict(),
            successes: count,
            failures: count,
            exact_count: count,
            independent_days: z.array(z.iso.date()).max(100000),
            last_outcome: outcome,
            revision: count,
          })
          .strict(),
      )
      .max(3600),
    confusions: z
      .array(
        z
          .object({
            target_id: id,
            substitute_id: id,
            count: count.min(1),
            last_seen: timestamp,
          })
          .strict(),
      )
      .max(20000),
    attempts: z.array(attempt).max(100000),
    activeSession: z
      .object({
        id: z.string().uuid(),
        settings,
        queue: z.array(question).min(1).max(2700),
        cursor: z.number().int().min(0).max(2700),
        revision: count,
        hinted: z.boolean(),
        questionStarted: timestamp,
        attempts: z.array(attempt).max(2700),
        initialCount: z.number().int().min(1).max(900),
        finished: z.boolean(),
        lastGrade: z
          .object({
            outcome,
            correct: z.string().max(1000),
            confusionId: id.optional(),
            explanation: z.string().max(2000).optional(),
            distance: z.number().min(0).max(500).optional(),
          })
          .strict()
          .optional(),
        lastQuestion: question.optional(),
      })
      .strict()
      .nullable(),
  })
  .strict();
const backupSchema = z
  .object({
    app: z.literal("gcse-latin-mastery"),
    version: z.literal(1),
    dataset: z.literal(datasetVersion),
    exportedAt: timestamp,
    snapshot: snapshotSchema,
  })
  .strict();

export function validateSnapshot(input: unknown): Snapshot {
  const result = snapshotSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      "Invalid progress data. Check the backup format and supported version.",
    );
  const s = result.data as Snapshot;
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (
    !unique(s.states.map((x) => `${x.word_id}:${x.skill}`)) ||
    !unique(s.confusions.map((x) => `${x.target_id}:${x.substitute_id}`))
  )
    throw new Error("Backup contains duplicate learning records.");
  for (const state of s.states) {
    if (
      !skillsFor(
        words[state.word_id],
        state.skill === "le" || state.skill === "el"
          ? state.skill
          : state.skill === "parts"
            ? "parts"
            : "grammar",
      ).includes(state.skill)
    )
      throw new Error("Unsupported vocabulary skill in backup.");
    if (
      new Set(state.independent_days).size !== state.independent_days.length ||
      state.independent_days.some((d) => !Number.isFinite(Date.parse(d)))
    )
      throw new Error("Invalid retrieval dates.");
    if (
      state.card.last_review &&
      Date.parse(state.card.last_review) > Date.now() + 300000
    )
      throw new Error("Backup contains future review times.");
  }
  if (s.confusions.some((c) => c.target_id === c.substitute_id))
    throw new Error("A word cannot be confused with itself.");
  const session = s.activeSession;
  if (session) {
    validateSettings(session.settings);
    if (
      session.cursor > session.queue.length ||
      session.attempts.length !== session.cursor ||
      session.finished !== (session.cursor === session.queue.length) ||
      session.initialCount > session.queue.length
    )
      throw new Error("Invalid saved session position.");
    for (const q of session.queue) {
      if (
        !skillsFor(words[q.wordId], session.settings.direction).includes(
          q.skill,
        ) ||
        (q.options &&
          (new Set(q.options).size !== 4 || !q.options.includes(q.wordId))) ||
        (session.settings.format === "mcq" && !q.options)
      )
        throw new Error("Invalid saved question.");
    }
    if (
      (session.lastGrade && (!session.lastQuestion || session.cursor === 0)) ||
      (session.lastQuestion && !session.lastGrade)
    )
      throw new Error("Invalid saved feedback.");
    if (
      session.lastQuestion &&
      JSON.stringify(session.lastQuestion) !==
        JSON.stringify(session.queue[session.cursor - 1])
    )
      throw new Error("Saved feedback does not match its question.");
  }
  return s;
}
export function parseBackup(text: string): Snapshot {
  if (text.length > 25000000)
    throw new Error("Backup exceeds the 25 MB limit.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const b = backupSchema.safeParse(raw);
  if (!b.success)
    throw new Error(
      "Not a supported Latin Mastery backup, or vocabulary version does not match.",
    );
  return validateSnapshot(b.data.snapshot);
}
export function encodeBackup(snapshot: Snapshot) {
  const text = JSON.stringify({
    app: "gcse-latin-mastery",
    version: 1,
    dataset: datasetVersion,
    exportedAt: new Date().toISOString(),
    snapshot: validateSnapshot(snapshot),
  });
  if (new TextEncoder().encode(text).byteLength > 25000000)
    throw new Error(
      "Progress exceeds the 25 MB backup limit. Export your saved progress before clearing space.",
    );
  return text;
}

interface RecordData {
  revision: number;
  snapshot: Snapshot;
}
interface ProgressDB extends DBSchema {
  progress: { key: string; value: RecordData };
}
const database = () =>
  openDB<ProgressDB>("gcse-latin-mastery", 1, {
    upgrade(db) {
      db.createObjectStore("progress");
    },
  });
function notify() {
  try {
    const c = new BroadcastChannel("latin-mastery-progress");
    c.postMessage("changed");
    c.close();
  } catch {
    /* Other tabs still reload on focus. */
  }
}
export function subscribeProgress(callback: () => void) {
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel("latin-mastery-progress");
    channel.onmessage = callback;
  } catch {
    /* Focus fallback. */
  }
  window.addEventListener("focus", callback);
  return () => {
    channel?.close();
    window.removeEventListener("focus", callback);
  };
}
export async function loadSnapshot() {
  try {
    const db = await database();
    try {
      const r = await db.get("progress", "current");
      return r ? validateSnapshot(r.snapshot) : structuredClone(emptySnapshot);
    } finally {
      db.close();
    }
  } catch (e) {
    throw storageError(e);
  }
}
function storageError(e: unknown) {
  return e instanceof Error
    ? new Error(
        e.name === "QuotaExceededError"
          ? "Browser storage is full. Export your progress before clearing space."
          : e.message,
      )
    : new Error(
        "Browser storage is unavailable. Enable site storage to save progress.",
      );
}
async function mutate<T>(
  change: (record: RecordData) => { snapshot: Snapshot; result: T },
) {
  let db;
  try {
    db = await database();
    const tx = db.transaction("progress", "readwrite");
    try {
      const record = (await tx.store.get("current")) || {
        revision: 0,
        snapshot: structuredClone(emptySnapshot),
      };
      const next = change(record);
      encodeBackup(next.snapshot); // Validate before commit and keep every saved profile exportable.
      await tx.store.put(
        { revision: record.revision + 1, snapshot: next.snapshot },
        "current",
      );
      await tx.done;
      notify();
      return next.result;
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* A failed write may have already aborted the transaction. */
      }
      await tx.done.catch(() => {});
      throw e;
    }
  } catch (e) {
    throw storageError(e);
  } finally {
    db?.close();
  }
}
function current(record: RecordData, provided: PracticeSession) {
  const s = record.snapshot.activeSession;
  if (!s || s.id !== provided.id)
    throw new Error(
      "Another tab started a different session. Reload saved progress.",
    );
  if (s.cursor > provided.cursor) return { s, duplicate: true };
  if (s.revision !== provided.revision || s.cursor !== provided.cursor)
    throw new Error("Another tab changed this session. Reload saved progress.");
  return { s, duplicate: false };
}
export async function startSession(settings: Settings) {
  return mutate((r) => {
    const s = makeSession(
      words,
      r.snapshot.states,
      r.snapshot.confusions,
      settings,
      new Date(),
      crypto.randomUUID(),
    );
    return {
      snapshot: { ...r.snapshot, activeSession: s },
      result: { session: s },
    };
  });
}
export async function answerSession(
  provided: PracticeSession,
  raw: string,
  skip: boolean,
) {
  if (typeof raw !== "string" || raw.length > 500)
    throw new Error("Answers must be under 500 characters.");
  return mutate((r) => {
    const { s, duplicate } = current(r, provided);
    if (duplicate) return { snapshot: r.snapshot, result: { session: s } };
    const out = applyAnswer(s, r.snapshot, words, raw, skip, new Date());
    return {
      snapshot: {
        states: out.states,
        confusions: out.confusions,
        attempts: [out.attempt, ...r.snapshot.attempts],
        activeSession: out.session,
      },
      result: { session: out.session },
    };
  });
}
export async function hintSession(provided: PracticeSession) {
  return mutate((r) => {
    const { s, duplicate } = current(r, provided);
    if (duplicate || s.finished)
      throw new Error("Question changed. Reload saved progress.");
    const next = { ...s, hinted: true, revision: s.revision + 1 };
    const q = next.queue[next.cursor];
    const value = expected(words[q.wordId], q.skill)[0];
    return {
      snapshot: { ...r.snapshot, activeSession: next },
      result: {
        session: next,
        hint: `Starts with “${value[0]}” (${value.replace(/[^a-z]/gi, "").length} letters)`,
      },
    };
  });
}
export async function continueSession(provided: PracticeSession) {
  return mutate((r) => {
    const { s, duplicate } = current(r, provided);
    if (duplicate) throw new Error("Question changed. Reload saved progress.");
    const next = {
      ...s,
      revision: s.revision + 1,
      questionStarted: new Date().toISOString(),
    };
    delete next.lastGrade;
    delete next.lastQuestion;
    return {
      snapshot: { ...r.snapshot, activeSession: next },
      result: { session: next },
    };
  });
}
export async function exportProgress() {
  return encodeBackup(await loadSnapshot());
}
export async function importProgress(text: string, expectedRevision: number) {
  const s = parseBackup(text);
  return mutate((r) => {
    if (r.revision !== expectedRevision)
      throw new Error(
        "Progress changed while choosing a backup. Export the current progress and try again.",
      );
    return { snapshot: s, result: s };
  });
}
export async function backupRevision() {
  const db = await database();
  try {
    return (await db.get("progress", "current"))?.revision || 0;
  } finally {
    db.close();
  }
}
