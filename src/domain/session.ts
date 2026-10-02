import { distance, englishTargets, grade, latinTargets } from "./grading.ts";
import { mastery, schedule } from "./scheduler.ts";
import type {
  Confusion,
  PracticeSession,
  Question,
  ReviewState,
  Settings,
  Skill,
  Snapshot,
  Word,
} from "./types.ts";
import { stateKey } from "./types.ts";
export const defaults: Settings = {
  mode: "daily",
  format: "type",
  direction: "mixed",
  sections: Array.from({ length: 15 }, (_, i) => i + 1),
  count: 20,
  pos: "all",
  filter: "all",
};
export function validateSettings(x: Settings) {
  if (
    !x ||
    !["daily", "learn", "custom", "exam"].includes(x.mode) ||
    !["type", "mcq", "flash"].includes(x.format) ||
    !["le", "el", "mixed", "parts", "grammar"].includes(x.direction) ||
    !["all", "weak", "new", "due", "mastered", "confused"].includes(x.filter) ||
    ![
      "all",
      "verb",
      "noun",
      "adjective",
      "adverb",
      "preposition",
      "conjunction",
      "pronoun",
      "pronoun/adjective",
      "particle",
      "phrase",
      "unknown",
      "prefix",
    ].includes(x.pos) ||
    !Array.isArray(x.sections) ||
    !x.sections.length ||
    x.sections.some((n) => !Number.isInteger(n) || n < 1 || n > 15) ||
    !Number.isInteger(x.count) ||
    x.count < 0 ||
    x.count > 900 ||
    (x.ids &&
      (!Array.isArray(x.ids) ||
        x.ids.some((n) => !Number.isInteger(n) || n < 0 || n > 449)))
  )
    throw new Error("Invalid practice settings");
  if (x.format === "mcq" && !["le", "el", "mixed"].includes(x.direction))
    throw new Error("Grammar and principal parts use typed recall");
  if (x.mode === "exam" && x.format === "flash")
    throw new Error("Exams require retrieval");
}
export function shuffle<T>(list: T[], rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function skillsFor(w: Word, direction: Settings["direction"]): Skill[] {
  if (direction === "mixed") return ["le", "el"];
  if (direction === "grammar") {
    const s: Skill[] = [];
    if (w.gender) s.push("gender");
    if (w.declension) s.push("declension");
    if (w.conjugation) s.push("conjugation");
    if (w.governingCase) s.push("case");
    if (w.tags.some((x) => ["irregular", "deponent"].includes(x)))
      s.push("status");
    return s;
  }
  if (direction === "parts")
    return w.partOfSpeech === "verb" && w.principalForms ? ["parts"] : [];
  return [direction];
}
export function wordState(w: Word, states: ReviewState[], now: Date) {
  const pair = ["le", "el"].map((s) =>
    mastery(
      states.find((x) => x.word_id === w.id && x.skill === s),
      now,
    ),
  );
  return (
    ["Weak", "Due", "New", "Learning", "Strong", "Mastered"] as const
  ).find((s) => pair.includes(s))!;
}
export function filteredWords(
  words: Word[],
  states: ReviewState[],
  confusions: Confusion[],
  s: Settings,
  now: Date,
) {
  return words.filter(
    (w) =>
      s.sections.includes(w.section) &&
      (s.pos === "all" || w.partOfSpeech === s.pos) &&
      (!s.ids || s.ids.includes(w.id)) &&
      skillsFor(w, s.direction).length &&
      (s.filter === "all" ||
        (s.filter === "confused" &&
          confusions.some(
            (c) =>
              (c.target_id === w.id || c.substitute_id === w.id) &&
              c.count >= 2,
          )) ||
        (s.filter === "new" &&
          skillsFor(w, s.direction).some(
            (k) => !states.some((x) => x.word_id === w.id && x.skill === k),
          )) ||
        (s.filter !== "confused" &&
          s.filter !== "new" &&
          skillsFor(w, s.direction).some(
            (k) =>
              mastery(
                states.find((x) => x.word_id === w.id && x.skill === k),
                now,
              ).toLowerCase() === s.filter,
          ))),
  );
}
export function distractors(
  w: Word,
  skill: Skill,
  words: Word[],
  confusions: Confusion[],
  rng = Math.random,
) {
  const targets = skill === "le" ? englishTargets(w) : latinTargets(w);
  const candidates = shuffle(
    words.filter(
      (o) =>
        o.id !== w.id &&
        !(skill === "le" ? englishTargets(o) : latinTargets(o)).some((t) =>
          targets.includes(t),
        ),
    ),
    rng,
  );
  const rank = (o: Word) =>
    (o.partOfSpeech === w.partOfSpeech ? 10 : 0) +
    (confusions.find((c) => c.target_id === w.id && c.substitute_id === o.id)
      ?.count || 0) *
      20 +
    (o.conjugation && o.conjugation === w.conjugation ? 3 : 0) +
    (o.declension && o.declension === w.declension ? 3 : 0) +
    Math.max(0, 8 - distance(w.latin, o.latin));
  candidates.sort((a, b) => rank(b) - rank(a));
  const distinct: Word[] = [];
  const labels = new Set<string>([skill === "le" ? w.meaningText : w.latin]);
  for (const o of candidates) {
    const label = skill === "le" ? o.meaningText : o.latin;
    if (!labels.has(label)) {
      labels.add(label);
      distinct.push(o);
    }
    if (distinct.length === 3) break;
  }
  return shuffle([w.id, ...distinct.map((o) => o.id)], rng);
}
export function makeSession(
  words: Word[],
  states: ReviewState[],
  confusions: Confusion[],
  settings: Settings,
  now: Date,
  id: string,
  rng = Math.random,
): PracticeSession {
  validateSettings(settings);
  let pool = filteredWords(words, states, confusions, settings, now);
  const map = new Map(states.map((s) => [stateKey(s.word_id, s.skill), s]));
  if (settings.mode === "learn")
    pool = pool.filter((w) =>
      skillsFor(w, settings.direction).some((k) => !map.has(stateKey(w.id, k))),
    );
  let q: Question[] = [];
  if (settings.mode === "exam") {
    const groups = settings.sections.map((n) =>
      shuffle(
        pool.filter((w) => w.section === n),
        rng,
      ),
    );
    const balanced: Word[] = [];
    while (groups.some((g) => g.length))
      for (const g of groups) if (g.length) balanced.push(g.shift()!);
    q = balanced.map((w, i) => {
      const skills = skillsFor(w, settings.direction);
      return { wordId: w.id, skill: skills[i % skills.length], repeat: 0 };
    });
  } else {
    q = shuffle(pool, rng).flatMap((w) =>
      skillsFor(w, settings.direction).map((skill) => ({
        wordId: w.id,
        skill,
        repeat: 0,
      })),
    );
    if (settings.mode === "daily") {
      const due = q
        .filter((x) => {
          const s = map.get(stateKey(x.wordId, x.skill));
          return s && new Date(s.card.due) <= now;
        })
        .sort(
          (a, b) =>
            new Date(map.get(stateKey(a.wordId, a.skill))!.card.due).getTime() -
            new Date(map.get(stateKey(b.wordId, b.skill))!.card.due).getTime(),
        );
      const fresh = q
        .filter((x) => !map.has(stateKey(x.wordId, x.skill)))
        .slice(0, 10);
      q = [...due, ...fresh];
    } else if (settings.filter === "weak" || settings.mode === "custom") {
      q.sort((a, b) => {
        const score = (x: Question) => {
          const s = map.get(stateKey(x.wordId, x.skill));
          return (
            (s?.failures || 0) +
            confusions
              .filter((c) => c.target_id === x.wordId)
              .reduce((n, c) => n + c.count, 0) +
            (s && new Date(s.card.due) <= now ? 3 : 0)
          );
        };
        return score(b) - score(a);
      });
    }
  }
  if (settings.count) q = q.slice(0, settings.count);
  q = q.map((x) => ({
    ...x,
    ...(settings.format === "mcq"
      ? {
          options: distractors(
            words.find((w) => w.id === x.wordId)!,
            x.skill,
            words,
            confusions,
            rng,
          ),
        }
      : {}),
    contrastId: confusions
      .filter((c) => c.target_id === x.wordId && c.count >= 2)
      .sort((a, b) => b.count - a.count)[0]?.substitute_id,
  }));
  if (!q.length)
    throw new Error(
      "No words match these settings. Choose another filter or learn new words.",
    );
  return {
    id,
    settings,
    queue: q,
    cursor: 0,
    revision: 0,
    hinted: settings.mode === "learn",
    questionStarted: now.toISOString(),
    attempts: [],
    initialCount: q.length,
    finished: false,
  };
}
export function applyAnswer(
  session: PracticeSession,
  snapshot: Snapshot,
  words: Word[],
  raw: string,
  skip: boolean,
  now: Date,
) {
  if (session.finished || session.cursor >= session.queue.length)
    throw new Error("Session finished");
  const s: PracticeSession = structuredClone(session);
  const q = s.queue[s.cursor];
  const w = words.find((x) => x.id === q.wordId);
  if (!w) throw new Error("Unknown vocabulary");
  const ms = Math.max(
    0,
    Math.min(3600000, now.getTime() - new Date(s.questionStarted).getTime()),
  );
  let g =
    s.settings.format === "flash"
      ? { outcome: "Introduced" as const, correct: w.meaningText }
      : grade(w, q.skill, raw, words, s.hinted, skip);
  if (s.settings.format === "mcq") {
    const choices = (q.options || [])
      .map((id) => words.find((x) => x.id === id)!)
      .filter(Boolean);
    if (
      !skip &&
      !choices.some((o) => (q.skill === "le" ? o.meaningText : o.latin) === raw)
    )
      throw new Error("Invalid choice");
    const ok = raw === (q.skill === "le" ? w.meaningText : w.latin);
    g = {
      ...g,
      outcome: skip ? "Skipped" : s.hinted ? "Hinted" : ok ? "Exact" : "Wrong",
      correct: q.skill === "le" ? w.meaningText : w.latin,
    };
  }
  const old = snapshot.states.find(
    (x) => x.word_id === w.id && x.skill === q.skill,
  );
  const updated = schedule(old, w.id, q.skill, g, s.settings.format, now, ms);
  const states = updated
    ? [
        ...snapshot.states.filter(
          (x) => stateKey(x.word_id, x.skill) !== stateKey(w.id, q.skill),
        ),
        updated,
      ]
    : snapshot.states;
  const confusions = [...snapshot.confusions];
  if (g.confusionId !== undefined) {
    const i = confusions.findIndex(
      (c) => c.target_id === w.id && c.substitute_id === g.confusionId,
    );
    const next = {
      target_id: w.id,
      substitute_id: g.confusionId,
      count: (i >= 0 ? confusions[i].count : 0) + 1,
      last_seen: now.toISOString(),
    };
    if (i >= 0) confusions[i] = next;
    else confusions.push(next);
  }
  if (
    s.settings.mode !== "exam" &&
    (s.settings.format === "flash" ? skip : g.outcome !== "Exact") &&
    q.repeat < 2
  )
    s.queue.splice(Math.min(s.cursor + 4, s.queue.length), 0, {
      ...q,
      repeat: q.repeat + 1,
    });
  const attempt = {
    word_id: w.id,
    skill: q.skill,
    raw: raw.slice(0, 500),
    outcome: g.outcome,
    at: now.toISOString(),
    response_ms: ms,
    format: s.settings.format,
    repeat: q.repeat,
    confusionId: g.confusionId,
  };
  s.attempts.push(attempt);
  s.cursor++;
  s.revision++;
  s.hinted = s.settings.mode === "learn" && s.queue[s.cursor]?.repeat === 0;
  s.questionStarted = now.toISOString();
  s.finished = s.cursor >= s.queue.length;
  s.lastGrade = g;
  s.lastQuestion = q;
  return { session: s, states, confusions, attempt, grade: g, state: updated };
}
export function sessionScore(s: PracticeSession) {
  return (
    [
      "le",
      "el",
      "parts",
      "gender",
      "declension",
      "conjugation",
      "case",
      "status",
    ] as Skill[]
  )
    .map((skill) => {
      const a = s.attempts.filter(
        (a) =>
          a.skill === skill && a.repeat === 0 && a.outcome !== "Introduced",
      );
      return {
        skill,
        total: a.length,
        exact: a.filter((x) => x.outcome === "Exact").length,
        typos: a.filter((x) => x.outcome === "Minor typo").length,
        hinted: a.filter((x) => x.outcome === "Hinted").length,
      };
    })
    .filter((x) => x.total);
}
