export type Skill =
  | "le"
  | "el"
  | "parts"
  | "gender"
  | "declension"
  | "conjugation"
  | "case"
  | "status";
export type Outcome =
  "Exact" | "Minor typo" | "Wrong" | "Skipped" | "Hinted" | "Introduced";
export type Mastery =
  "New" | "Learning" | "Due" | "Weak" | "Strong" | "Mastered";
export interface Word {
  id: number;
  latin: string;
  principalForms: string;
  meanings: string[];
  meaningText: string;
  partOfSpeech: string;
  type: string;
  declension: string | null;
  conjugation: string | null;
  gender: string | null;
  governingCase: string | null;
  grammaticalNotes: string;
  section: number;
  tags: string[];
  source: { i: number; s: number; l: string; p: string; t: string; e: string };
}
export interface MemoryCard {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}
export interface ReviewState {
  word_id: number;
  skill: Skill;
  card: MemoryCard;
  successes: number;
  failures: number;
  exact_count: number;
  independent_days: string[];
  last_outcome: Outcome;
  revision: number;
}
export interface Confusion {
  target_id: number;
  substitute_id: number;
  count: number;
  last_seen: string;
}
export interface Grade {
  outcome: Outcome;
  correct: string;
  confusionId?: number;
  explanation?: string;
  distance?: number;
}
export type Mode = "daily" | "learn" | "custom" | "exam";
export type Format = "type" | "mcq" | "flash";
export interface Settings {
  mode: Mode;
  format: Format;
  direction: "le" | "el" | "mixed" | "parts" | "grammar";
  sections: number[];
  count: number;
  pos: string;
  filter: "all" | "weak" | "new" | "due" | "mastered" | "confused";
  ids?: number[];
}
export interface Question {
  wordId: number;
  skill: Skill;
  repeat: number;
  options?: number[];
  contrastId?: number;
}
export interface Attempt {
  word_id: number;
  skill: Skill;
  raw: string;
  outcome: Outcome;
  at: string;
  response_ms: number;
  format: Format;
  repeat: number;
  confusionId?: number;
}
export interface PracticeSession {
  id: string;
  settings: Settings;
  queue: Question[];
  cursor: number;
  revision: number;
  hinted: boolean;
  questionStarted: string;
  attempts: Attempt[];
  initialCount: number;
  finished: boolean;
  lastGrade?: Grade;
  lastQuestion?: Question;
}
export interface Snapshot {
  states: ReviewState[];
  confusions: Confusion[];
  attempts: Attempt[];
  activeSession: PracticeSession | null;
}
export const stateKey = (id: number, skill: Skill) => `${id}:${skill}`;
