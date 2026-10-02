import { describe, it, expect } from "vitest";
import data from "../src/data/vocabulary.json";
import type { Word, ReviewState } from "../src/domain/types";
import {
  grade,
  normEnglish,
  normLatin,
  englishTargets,
  spellingDiff,
} from "../src/domain/grading";
import { schedule, mastery, recall } from "../src/domain/scheduler";
import {
  applyAnswer,
  defaults,
  distractors,
  makeSession,
  sessionScore,
  validateSettings,
} from "../src/domain/session";
const words = data as Word[];
const word = (latin: string) => words.find((w) => w.latin === latin)!;
const time = new Date("2026-01-01T12:00:00Z");
describe("source preservation", () => {
  it("imports 450 unique IDs and 15 actual sections", () => {
    expect(words).toHaveLength(450);
    expect(new Set(words.map((w) => w.id)).size).toBe(450);
    expect(new Set(words.map((w) => w.section)).size).toBe(15);
    expect(words[163].principalForms).toBe("illa, illud");
    expect(words[60].section).toBe(2);
  });
  it("preserves every meaning and form in raw source", () => {
    for (const w of words) {
      expect(w.meaningText).toBe(w.source.e);
      expect(w.principalForms).toBe(w.source.p);
      expect(w.latin).toBe(w.source.l);
      expect(w.meanings.join(", ")).toBe(w.meaningText);
    }
  });
});
describe("normalization and grading", () => {
  it.each([
    ["To the sword!", "sword"],
    ["A slave-girl", "slave girl"],
    [" be away ", "be away"],
    ["on one’s own", "on one's own"],
  ])("normalizes English %s", (input, out) =>
    expect(normEnglish(input)).toBe(out),
  );
  it("normalizes macrons without joining tokens or deleting numbers", () => {
    expect(normLatin(" GLĀDIUS! ")).toBe("gladius");
    expect(normLatin("gla dius")).toBe("gla dius");
    expect(normLatin("gladius123")).toContain("123");
  });
  it.each(["sword", "the sword", "A sword!", "to sword"])(
    "accepts English exact %s",
    (a) => expect(grade(word("gladius"), "le", a, words).outcome).toBe("Exact"),
  );
  it("supports slash alternatives and parentheses appropriately", () => {
    expect(englishTargets(word("peto"))).toContain("ask for");
    expect(englishTargets(word("peto"))).toContain("beg for");
    expect(grade(word("capio"), "le", "make a plan", words).outcome).toBe(
      "Exact",
    );
    expect(grade(word("sum"), "le", "be", words).outcome).toBe("Exact");
  });
  it("accepts only one exact English meaning, not lists concealing wrong alternatives", () => {
    expect(grade(word("gladius"), "le", "sword, cat", words).outcome).toBe(
      "Wrong",
    );
    expect(grade(word("gladius"), "le", "not sword", words).outcome).toBe(
      "Wrong",
    );
  });
  it("accepts dataset alternate Latin headwords", () => {
    expect(grade(word("ac, atque"), "el", "atque", words).outcome).toBe(
      "Exact",
    );
    expect(grade(word("a, ab"), "el", "ab", words).outcome).toBe("Exact");
  });
  it("marks Latin typo separately and identifies extra letter", () => {
    expect(grade(word("consilium"), "el", "consillium", words).outcome).toBe(
      "Minor typo",
    );
    expect(
      spellingDiff("consillium", "consilium").filter((x) => x.kind === "extra"),
    ).toEqual([{ text: "l", kind: "extra" }]);
  });
  it("does not accept another valid Latin word as a typo or identical-meaning substitute", () => {
    const g = grade(word("quaero"), "el", "rogo", words);
    expect(g.outcome).toBe("Wrong");
    expect(g.confusionId).toBe(word("rogo").id);
    expect(g.explanation).toContain("rogo");
    expect(grade(word("hostis"), "el", "inimicus", words).outcome).toBe(
      "Wrong",
    );
    expect(grade(word("porta"), "el", "porto", words).outcome).toBe("Wrong");
  });
  it.each([
    "",
    "   ",
    "<script>alert(1)</script>",
    "1234",
    "gla dius",
    "gladius123",
  ])("rejects malformed Latin %s", (input) =>
    expect(["Wrong", "Skipped"]).toContain(
      grade(word("gladius"), "el", input, words).outcome,
    ),
  );
  it("rejects excessively long answers", () =>
    expect(
      grade(word("gladius"), "el", "sword".repeat(1000), words).outcome,
    ).toBe("Wrong"));
  it("bounds short-word typo tolerance and semantically valid wrong English", () => {
    expect(grade(word("et"), "el", "at", words).outcome).toBe("Wrong");
    expect(grade(word("rex"), "le", "ring", words).outcome).toBe("Wrong");
    expect(grade(word("malo"), "le", "prepare", words).outcome).toBe("Wrong");
  });
  it("hints cannot become independent exact recall", () => {
    expect(grade(word("gladius"), "el", "gladius", words, true).outcome).toBe(
      "Hinted",
    );
    expect(grade(word("gladius"), "el", "", words, true, true).outcome).toBe(
      "Skipped",
    );
  });
  it("tests all supplied verb forms and supported grammar", () => {
    expect(
      grade(word("amo"), "parts", "amare, amavi, amatus", words).outcome,
    ).toBe("Exact");
    expect(grade(word("amo"), "parts", "amare", words).outcome).toBe("Wrong");
    expect(grade(word("ager"), "gender", "masculine", words).outcome).toBe(
      "Exact",
    );
    expect(grade(word("ad"), "case", "accusative", words).outcome).toBe(
      "Exact",
    );
  });
});
describe("FSRS evidence safeguards", () => {
  const exact = { outcome: "Exact" as const, correct: "sword" };
  it("deterministically schedules successful retrieval", () => {
    expect(schedule(undefined, 144, "le", exact, "type", time, 10000)).toEqual(
      schedule(undefined, 144, "le", exact, "type", time, 10000),
    );
  });
  it("keeps directions independent", () => {
    const le = schedule(undefined, 144, "le", exact, "type", time, 10000)!;
    expect(le.skill).toBe("le");
    expect(mastery(undefined, time)).toBe("New");
    expect(le.independent_days).toHaveLength(1);
  });
  it("two same-day successes never establish durable mastery", () => {
    let s = schedule(undefined, 144, "le", exact, "type", time, 10000)!;
    s = schedule(s, 144, "le", exact, "type", new Date(+time + 600000), 10000)!;
    expect(s.independent_days).toHaveLength(1);
    expect(mastery(s, new Date(+time + 600000))).toBe("Learning");
  });
  it("caps typo, MCQ and same-day interval growth", () => {
    const old = schedule(undefined, 144, "el", exact, "type", time, 10000)!;
    const t = new Date(+time + 86400000);
    const typo = schedule(
      old,
      144,
      "el",
      { outcome: "Minor typo", correct: "gladius" },
      "type",
      t,
      10000,
    )!;
    expect(typo.card.stability).toBeLessThanOrEqual(old.card.stability);
    const mcq = schedule(old, 144, "el", exact, "mcq", t, 10000)!;
    expect(mcq.independent_days).toEqual(old.independent_days);
    expect(mcq.card.stability).toBeLessThanOrEqual(old.card.stability);
  });
  it("flashcard exposure creates no card", () => {
    expect(
      schedule(
        undefined,
        144,
        "le",
        { outcome: "Introduced", correct: "sword" },
        "flash",
        time,
        3000,
      ),
    ).toBeUndefined();
  });
  it("failed recall becomes weak and due sooner", () => {
    const s = schedule(
      undefined,
      144,
      "le",
      { outcome: "Wrong", correct: "sword" },
      "type",
      time,
      10000,
    )!;
    expect(mastery(s, time)).toBe("Weak");
    expect(s.card.due).toBeTruthy();
    expect(s.failures).toBe(1);
  });
  it("previously strong words become due and recall decays", () => {
    const s = schedule(undefined, 144, "le", exact, "type", time, 10000)!;
    const strong: ReviewState = {
      ...s,
      card: {
        ...s.card,
        state: 2,
        stability: 80,
        due: new Date(+time + 30 * 86400000).toISOString(),
        last_review: time.toISOString(),
      },
      independent_days: ["1", "2", "3", "4", "5"],
    };
    expect(mastery(strong, time)).toBe("Mastered");
    expect(mastery(strong, new Date(+time + 31 * 86400000))).toBe("Due");
    expect(recall(strong, new Date(+time + 180 * 86400000))).toBeLessThan(
      recall(strong, time),
    );
  });
  it("rejects backwards scheduler timestamps", () => {
    const s = schedule(undefined, 144, "le", exact, "type", time, 10000)!;
    expect(() =>
      schedule(s, 144, "le", exact, "type", new Date(+time - 1), 10000),
    ).toThrow();
  });
});
describe("sessions and confusions", () => {
  const snap = {
    states: [],
    confusions: [],
    attempts: [],
    activeSession: null,
  };
  it("exam samples each selected section without duplicates", () => {
    const s = makeSession(
      words,
      [],
      [],
      { ...defaults, mode: "exam", count: 20 },
      time,
      "id",
      () => 0.5,
    );
    expect(new Set(s.queue.map((q) => q.wordId)).size).toBe(20);
    expect(new Set(s.queue.map((q) => words[q.wordId].section)).size).toBe(15);
  });
  it("repeats learning mistakes at a gap, at most twice; exam never repeats", () => {
    const s = makeSession(
      words,
      [],
      [],
      { ...defaults, mode: "custom", direction: "el", count: 5 },
      time,
      "id",
      () => 0.5,
    );
    const r = applyAnswer(
      s,
      snap,
      words,
      "wrong",
      false,
      new Date(+time + 10000),
    );
    expect(r.session.queue).toHaveLength(6);
    expect(r.session.queue[4].wordId).toBe(s.queue[0].wordId);
    const ex = makeSession(
      words,
      [],
      [],
      { ...defaults, mode: "exam", count: 5 },
      time,
      "ex",
    );
    expect(
      applyAnswer(ex, snap, words, "wrong", false, new Date(+time + 10000))
        .session.queue,
    ).toHaveLength(5);
  });
  it("records confusion counts and substitutes sensible distractors", () => {
    const s = makeSession(
      words,
      [],
      [],
      { ...defaults, mode: "custom", direction: "el", ids: [320], count: 1 },
      time,
      "id",
    );
    const first = applyAnswer(
      s,
      snap,
      words,
      "rogo",
      false,
      new Date(+time + 10000),
    );
    expect(first.confusions[0].count).toBe(1);
    const second = applyAnswer(
      first.session,
      { ...snap, states: first.states, confusions: first.confusions },
      words,
      "rogo",
      false,
      new Date(+time + 20000),
    );
    expect(second.confusions[0].count).toBe(2);
    const opts = distractors(
      word("quaero"),
      "el",
      words,
      second.confusions,
      () => 0.5,
    );
    expect(opts).toContain(word("rogo").id);
    expect(opts).toHaveLength(4);
  });
  it("MCQ excludes semantic alternatives and duplicate labels", () => {
    for (const w of words) {
      const opts = distractors(w, "le", words, [], () => 0.5);
      const targets = englishTargets(w);
      expect(new Set(opts).size).toBe(4);
      for (const id of opts.filter((id) => id !== w.id))
        expect(englishTargets(words[id]).some((x) => targets.includes(x))).toBe(
          false,
        );
    }
  });
  it("grades complete MCQ labels and rejects forged choices", () => {
    const s = makeSession(
      words,
      [],
      [],
      {
        ...defaults,
        mode: "custom",
        format: "mcq",
        direction: "le",
        ids: [word("peto").id],
        count: 1,
      },
      time,
      "id",
    );
    expect(
      applyAnswer(s, snap, words, word("peto").meaningText, false, time).grade
        .outcome,
    ).toBe("Exact");
    expect(() =>
      applyAnswer(s, snap, words, "forged choice", false, time),
    ).toThrow("Invalid choice");
  });
  it("flashcards and retries do not inflate first-try exam score", () => {
    const s = makeSession(
      words,
      [],
      [],
      { ...defaults, mode: "custom", count: 1 },
      time,
      "id",
    );
    const r = applyAnswer(s, snap, words, "wrong", false, time);
    expect(sessionScore(r.session)[0].exact).toBe(0);
  });
  it("learn introduction is assisted and followed by retrieval", () => {
    const s = makeSession(
      words,
      [],
      [],
      { ...defaults, mode: "learn", direction: "el", count: 1 },
      time,
      "id",
    );
    expect(s.hinted).toBe(true);
    const r = applyAnswer(
      s,
      snap,
      words,
      words[s.queue[0].wordId].latin,
      false,
      new Date(+time + 10000),
    );
    expect(r.grade.outcome).toBe("Hinted");
    expect(r.session.queue).toHaveLength(2);
    expect(r.session.hinted).toBe(false);
  });
  it("daily prefers overdue skill over new words", () => {
    const state = schedule(
      undefined,
      144,
      "el",
      { outcome: "Wrong", correct: "gladius" },
      "type",
      time,
      1000,
    )!;
    const s = makeSession(
      words,
      [state],
      [],
      defaults,
      new Date(+time + 86400000),
      "id",
    );
    expect(s.queue[0]).toMatchObject({ wordId: 144, skill: "el" });
    expect(s.queue.length).toBeLessThanOrEqual(20);
  });
  it("flashcard not-yet revisits without adding mastery evidence", () => {
    const s = makeSession(
      words,
      [],
      [],
      { ...defaults, mode: "custom", format: "flash", count: 1 },
      time,
      "flash",
    );
    const r = applyAnswer(s, snap, words, "", true, time);
    expect(r.session.queue).toHaveLength(2);
    expect(r.grade.outcome).toBe("Introduced");
    expect(r.states).toHaveLength(0);
  });
  it("validates unsupported modes, impossible filters and invalid counts", () => {
    expect(() => validateSettings({ ...defaults, count: -1 })).toThrow();
    expect(() =>
      makeSession(
        words,
        [],
        [],
        { ...defaults, filter: "mastered" },
        time,
        "id",
      ),
    ).toThrow(/No words/);
    expect(() =>
      validateSettings({ ...defaults, direction: "parts", format: "mcq" }),
    ).toThrow();
  });
});
