import { createEmptyCard, fsrs, Rating, State, type Card } from "ts-fsrs";
import type {
  Format,
  Grade,
  Mastery,
  MemoryCard,
  ReviewState,
  Skill,
} from "./types.ts";
const engine = fsrs({
  request_retention: 0.9,
  enable_fuzz: false,
  maximum_interval: 365,
  enable_short_term: true,
});
export function hydrate(card: MemoryCard): Card {
  return {
    ...card,
    state: card.state as State,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  };
}
export function serialize(card: Card): MemoryCard {
  return {
    ...card,
    due: card.due.toISOString(),
    last_review: card.last_review?.toISOString(),
  };
}
export function recall(s: ReviewState | undefined, now: Date) {
  return !s || s.card.state === State.New
    ? 0
    : engine.get_retrievability(hydrate(s.card), now, false);
}
export function mastery(s: ReviewState | undefined, now: Date): Mastery {
  if (!s || s.card.reps === 0) return "New";
  if (
    s.last_outcome === "Wrong" ||
    s.last_outcome === "Skipped" ||
    (s.failures >= 3 && s.failures > s.successes)
  )
    return "Weak";
  if (new Date(s.card.due) <= now) return "Due";
  if (s.card.state !== State.Review || s.independent_days.length < 3)
    return "Learning";
  if (
    s.card.stability >= 60 &&
    s.independent_days.length >= 5 &&
    recall(s, now) >= 0.9
  )
    return "Mastered";
  if (s.card.stability >= 14 && recall(s, now) >= 0.9) return "Strong";
  return "Learning";
}
export function schedule(
  previous: ReviewState | undefined,
  wordId: number,
  skill: Skill,
  g: Grade,
  format: Format,
  now: Date,
  responseMs: number,
): ReviewState | undefined {
  if (format === "flash" || g.outcome === "Introduced") return previous;
  const old = previous ? hydrate(previous.card) : createEmptyCard(now);
  if (old.last_review && now < old.last_review)
    throw new Error("Review time cannot move backwards");
  let rating =
    g.outcome === "Exact"
      ? Rating.Good
      : g.outcome === "Minor typo"
        ? Rating.Hard
        : Rating.Again;
  if (format === "mcq" && rating === Rating.Good) rating = Rating.Hard;
  const card = engine.next(old, now, rating).card;
  const independent = g.outcome === "Exact" && format === "type";
  const early =
    old.last_review && now.getTime() - old.last_review.getTime() < 86400000;
  // Evidence safeguards around FSRS: assisted, typo, MCQ and short repeats cannot manufacture interval growth.
  if (
    g.outcome === "Minor typo" ||
    format === "mcq" ||
    (independent && early) ||
    responseMs > 120000
  ) {
    card.stability = Math.min(card.stability, old.stability || card.stability);
    card.due = new Date(
      Math.min(
        card.due.getTime(),
        now.getTime() +
          Math.max(600000, old.scheduled_days * 86400000 || 86400000),
      ),
    );
    card.scheduled_days = Math.floor(
      (card.due.getTime() - now.getTime()) / 86400000,
    );
  }
  if (
    !independent &&
    g.outcome !== "Wrong" &&
    g.outcome !== "Skipped" &&
    g.outcome !== "Hinted" &&
    !previous
  ) {
    card.due = new Date(now.getTime() + 600000);
    card.scheduled_days = 0;
    card.state = State.Learning;
  }
  const day = now.toISOString().slice(0, 10);
  const days = previous?.independent_days || [];
  return {
    word_id: wordId,
    skill,
    card: serialize(card),
    successes: (previous?.successes || 0) + (independent ? 1 : 0),
    failures:
      (previous?.failures || 0) +
      (["Wrong", "Skipped", "Hinted"].includes(g.outcome) ? 1 : 0),
    exact_count: (previous?.exact_count || 0) + (independent ? 1 : 0),
    independent_days:
      independent && !days.includes(day) ? [...days, day] : days,
    last_outcome: g.outcome,
    revision: (previous?.revision || 0) + 1,
  };
}
