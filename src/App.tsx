import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  Download,
  Command,
  Contrast,
  Search,
  X,
} from "lucide-react";
import data from "./data/vocabulary.json";
import type {
  PracticeSession,
  Settings,
  Skill,
  Snapshot,
  Word,
} from "./domain/types";
import {
  defaults,
  filteredWords,
  sessionScore,
  wordState,
} from "./domain/session";
import { forms, spellingDiff } from "./domain/grading";
import { mastery, recall } from "./domain/scheduler";
import {
  answerSession,
  emptySnapshot,
  hintSession,
  loadSnapshot,
  startSession,
  continueSession,
  subscribeProgress,
  exportProgress,
  importProgress,
  parseBackup,
  backupRevision,
} from "./storage";
const words = data as Word[];
const byId = new Map(words.map((w) => [w.id, w]));
const labels: Record<Skill, string> = {
  le: "Latin → English",
  el: "English → Latin",
  parts: "Principal parts",
  gender: "Noun gender",
  declension: "Declension",
  conjugation: "Conjugation",
  case: "Governing case",
  status: "Verb status",
};
type Page = "today" | "practice" | "vocabulary" | "confusions" | "account";
const date = (s: string) =>
  new Date(s).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
export default function App() {
  const [page, setPage] = useState<Page>("today"),
    [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot),
    [session, setSession] = useState<PracticeSession | null>(null),
    [feedback, setFeedback] = useState(false),
    [raw, setRaw] = useState(""),
    [hint, setHint] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [detail, setDetail] = useState<Word | null>(null),
    [settings, setSettings] = useState<Settings>({
      ...defaults,
      mode: "custom",
    }),
    [search, setSearch] = useState(""),
    [hideMeanings, setHideMeanings] = useState(false),
    [intro, setIntro] = useState(false),
    [theme, setTheme] = useState(() => {
      try {
        return localStorage.getItem("latin-theme") || "system";
      } catch {
        return "system";
      }
    });
  const input = useRef<HTMLInputElement>(null),
    next = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const now = new Date();
  const due = snapshot.states.filter((s) => new Date(s.card.due) <= now);
  const outcomes = [
    "Mastered",
    "Strong",
    "Learning",
    "Weak",
    "New",
    "Due",
  ] as const;
  const counts = Object.fromEntries(
    outcomes.map((s) => [
      s,
      words.filter((w) => wordState(w, snapshot.states, now) === s).length,
    ]),
  );
  const recent = snapshot.attempts
    .filter((a) => a.outcome !== "Introduced")
    .slice(0, 100);
  const accuracy = recent.length
    ? Math.round(
        (recent.filter((a) => a.outcome === "Exact").length / recent.length) *
          100,
      )
    : null;
  async function refresh(resume = false) {
    try {
      const loaded = await loadSnapshot();
      setSnapshot(loaded);
      if (resume) {
        setSession(loaded.activeSession);
        setFeedback(Boolean(loaded.activeSession?.lastGrade));
        setIntro(
          loaded.activeSession?.settings.mode === "learn" ||
            loaded.activeSession?.settings.format === "flash",
        );
        setError("");
      }
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    void refresh();
    return subscribeProgress(() => void refresh());
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("latin-theme", theme);
    } catch {
      /* Theme still works for this visit. */
    }
  }, [theme]);
  useEffect(() => {
    if (detail && !dialog.current?.open) dialog.current?.showModal();
    else if (!detail && dialog.current?.open) dialog.current?.close();
  }, [detail]);
  useLayoutEffect(() => {
    if (session) {
      if (feedback) next.current?.focus();
      else if (!session.finished) {
        if (
          session.settings.format === "mcq" ||
          session.settings.format === "flash"
        )
          next.current?.focus();
        else if (!intro) input.current?.focus();
      }
    }
  }, [
    session?.id,
    session?.revision,
    session?.cursor,
    feedback,
    intro,
    session?.finished,
  ]);
  const current = session?.queue[session.cursor];
  const w = current ? byId.get(current.wordId) : null;
  const last = session?.lastQuestion
    ? byId.get(session.lastQuestion.wordId)
    : null;
  async function start(s: Settings) {
    setBusy(true);
    setError("");
    setNotice("");
    setDetail(null);
    try {
      const nextSession = (await startSession(s)).session;
      setSnapshot(await loadSnapshot());
      setSession(nextSession);
      setFeedback(false);
      setRaw("");
      setHint("");
      setIntro(s.mode === "learn" || s.format === "flash");
      window.scrollTo(0, 0);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function answer(skip = false) {
    if (!session || busy || feedback) return;
    setBusy(true);
    setError("");
    try {
      const s = (await answerSession(session, raw, skip)).session;
      setSnapshot(await loadSnapshot());
      setSession(s);
      setFeedback(true);
      setHint("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function advance() {
    if (!session || busy) return;
    setBusy(true);
    try {
      const r = await continueSession(session);
      setSession(r.session);
      setFeedback(false);
      setRaw("");
      setHint("");
      setIntro(
        r.session.settings.format === "flash" ||
          (r.session.settings.mode === "learn" &&
            r.session.queue[r.session.cursor]?.repeat === 0),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function showHint() {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await hintSession(session);
      const loaded = await loadSnapshot();
      setSession(r.session);
      setHint(r.hint);
      setSnapshot(loaded);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }
  function choose(id: number) {
    if (!session || feedback || busy) return;
    const word = byId.get(id)!;
    const value = current?.skill === "le" ? word.meaningText : word.latin;
    void submitChoice(value);
  }
  async function submitChoice(value: string) {
    if (!session) return;
    setRaw(value);
    setBusy(true);
    setError("");
    try {
      const r = await answerSession(session, value, false);
      const loaded = await loadSnapshot();
      setSession(r.session);
      setSnapshot(loaded);
      setFeedback(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        !session ||
        (session.finished && !feedback) ||
        detail ||
        busy ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey
      )
        return;
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;
      if (feedback && e.key === "Enter" && !typing) {
        e.preventDefault();
        void advance();
      } else if (
        !typing &&
        session.settings.format === "mcq" &&
        !feedback &&
        /^[1-4]$/.test(e.key)
      ) {
        e.preventDefault();
        const id = current?.options?.[Number(e.key) - 1];
        if (id !== undefined) choose(id);
      } else if (
        !typing &&
        session.settings.format === "flash" &&
        !(e.target instanceof HTMLButtonElement) &&
        e.code === "Space"
      ) {
        e.preventDefault();
        setIntro((x) => !x);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  function navigate(p: Page) {
    setPage(p);
    setSession(null);
    setError("");
    setDetail(null);
    window.scrollTo(0, 0);
  }
  function setup(mode: Settings["mode"]) {
    setSettings({
      ...defaults,
      mode,
      format: "type",
      count: mode === "learn" ? 10 : mode === "exam" ? 20 : 20,
    });
    setPage("practice");
    setSession(null);
  }
  const tabs: [Page, string][] = [
    ["today", "Today"],
    ["practice", "Practice"],
    ["vocabulary", "Vocabulary"],
    ["confusions", "Confusions"],
  ];
  const strength = (skill: Skill) =>
    Math.round(
      (words.reduce((sum, w) => {
        const s = snapshot.states.find(
          (s) => s.word_id === w.id && s.skill === skill,
        );
        return sum + (s ? recall(s, now) : 0);
      }, 0) /
        words.length) *
        100,
    );
  const browse = filteredWords(
    words,
    snapshot.states,
    snapshot.confusions,
    { ...settings, direction: "mixed", mode: "custom" },
    now,
  ).filter((w) =>
    `${w.latin} ${w.meaningText} ${w.type}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="header">
        <button
          className="brand"
          onClick={() => navigate("today")}
          aria-label="Latin Mastery home"
        >
          <span className="brand-mark">L</span>
          <span>
            Latin <i>Mastery</i>
            <small>GCSE vocabulary · 450 words</small>
          </span>
        </button>
        <div className="header-actions">
          <button
            className="icon-button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle dark mode"
          >
            <Contrast size={20} />
          </button>
          <button
            className="account-button"
            onClick={() => navigate("account")}
          >
            <Download size={16} /> Backup & data
          </button>
        </div>
      </header>
      <nav className="nav" aria-label="Main navigation">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={page === id && !session ? "active" : ""}
            onClick={() => navigate(id)}
            aria-current={page === id && !session ? "page" : undefined}
          >
            {label}
            {id === "confusions" && snapshot.confusions.length > 0 && (
              <span className="nav-count">{snapshot.confusions.length}</span>
            )}
          </button>
        ))}
      </nav>
      <main id="main" className="shell">
        <div className="storage-note">
          <Download size={18} />
          <span>
            Progress is saved in this browser. Export a backup to transfer it to
            another device. No automatic sync.
          </span>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}{" "}
            <button onClick={() => void refresh(true)}>
              Reload saved progress
            </button>
          </div>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {session ? (
          <section className="session-wrap">
            <button
              className="text-button"
              onClick={() => {
                setSession(null);
                setPage("today");
              }}
            >
              <ChevronLeft size={16} />
              Save & return
            </button>
            {session.finished && !feedback ? (
              <>
                <p className="eyebrow">Session complete</p>
                <h1>Recall, measured.</h1>
                <p className="muted">
                  First attempts are reported below. Retries help you learn and
                  don’t inflate your score.
                </p>
                <div className="score-grid">
                  {sessionScore(session).map((s) => (
                    <article className="panel" key={s.skill}>
                      <p>{labels[s.skill]}</p>
                      <h2>
                        {s.exact}
                        <span className="muted"> / {s.total}</span>
                      </h2>
                      <p className="muted">
                        exact · {s.typos} typos · {s.hinted} hinted
                      </p>
                    </article>
                  ))}
                </div>
                <h2>Words to revisit</h2>
                <div className="word-list">
                  {Array.from(
                    new Set(
                      session.attempts
                        .filter(
                          (a) =>
                            a.outcome !== "Exact" && a.outcome !== "Introduced",
                        )
                        .map((a) => a.word_id),
                    ),
                  ).map((id) => (
                    <button
                      className="word-row"
                      key={id}
                      onClick={() => setDetail(byId.get(id)!)}
                    >
                      <b className="latin">{byId.get(id)!.latin}</b>
                      <span>{byId.get(id)!.meaningText}</span>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
                <div className="button-row">
                  <button className="primary" onClick={() => navigate("today")}>
                    See my progress <ArrowRight size={17} />
                  </button>
                  {session.attempts.some(
                    (a) => a.outcome !== "Exact" && a.outcome !== "Introduced",
                  ) && (
                    <button
                      onClick={() =>
                        void start({
                          ...session.settings,
                          mode: "custom",
                          format: "type",
                          filter: "all",
                          ids: Array.from(
                            new Set(
                              session.attempts
                                .filter((a) => a.outcome !== "Exact")
                                .map((a) => a.word_id),
                            ),
                          ),
                          count: 0,
                        })
                      }
                    >
                      Retest missed words
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="session-meta">
                  <span>
                    {session.settings.mode === "exam"
                      ? "Exam diagnosis"
                      : session.settings.mode === "learn"
                        ? "Learn & retrieve"
                        : "Active recall"}
                  </span>
                  <span>
                    {Math.min(
                      session.cursor + (feedback ? 0 : 1),
                      session.queue.length,
                    )}{" "}
                    / {session.queue.length}
                  </span>
                </div>
                <div className="progress-track">
                  <span
                    style={{
                      width: `${(session.cursor / session.queue.length) * 100}%`,
                    }}
                  />
                </div>
                {feedback && session.lastGrade && last ? (
                  <article
                    className={
                      "recall-card feedback " +
                      (session.settings.mode === "exam"
                        ? ""
                        : session.lastGrade.outcome === "Exact"
                          ? "correct"
                          : "needs-review")
                    }
                  >
                    <p className="eyebrow">
                      {session.settings.mode === "exam"
                        ? "Answer recorded"
                        : session.lastGrade.outcome}
                    </p>
                    {session.settings.mode === "exam" ? (
                      <>
                        <h1>Keep going.</h1>
                        <p className="muted">
                          Your results and answers will appear at the end.
                        </p>
                      </>
                    ) : (
                      <>
                        <h1 className="latin">{last.latin}</h1>
                        <p className="forms">{last.principalForms}</p>
                        <p className="meaning">{last.meaningText}</p>
                        <p className="muted">
                          {last.type || "type unspecified"} · Section{" "}
                          {last.section}
                        </p>
                      </>
                    )}
                    {session.settings.mode !== "exam" && (
                      <>
                        <p>
                          {session.lastGrade.explanation ||
                            {
                              Exact:
                                "Successful retrieval. This direction’s next review has been updated.",
                              "Minor typo":
                                "Close spelling. This does not earn the same interval growth as an exact answer.",
                              Wrong:
                                "This word will return later in the session.",
                              Skipped:
                                "No recall yet. We’ll practise this again.",
                              Hinted:
                                "Completed with support. Retrieve it independently next time.",
                              Introduced:
                                "An introduction, not mastery evidence.",
                            }[session.lastGrade.outcome]}
                        </p>
                        {session.lastGrade.outcome === "Minor typo" && (
                          <div className="spelling">
                            <span>Your spelling, with edits:</span>
                            <p>
                              {spellingDiff(raw, session.lastGrade.correct).map(
                                (x, i) => (
                                  <span key={i} className={"diff-" + x.kind}>
                                    {x.text}
                                  </span>
                                ),
                              )}
                            </p>
                            <small>
                              Struck through = extra · underlined = missing
                            </small>
                          </div>
                        )}
                        {raw && session.lastGrade.outcome !== "Exact" && (
                          <p className="muted">You wrote: {raw}</p>
                        )}
                      </>
                    )}
                    <button
                      ref={next}
                      className="primary"
                      onClick={() => void advance()}
                    >
                      {session.finished ? "See results" : "Next question"}{" "}
                      <ArrowRight size={18} />
                      <kbd>Enter</kbd>
                    </button>
                  </article>
                ) : (
                  w &&
                  current && (
                    <article className="recall-card">
                      <div className="card-topline">
                        <span>{labels[current.skill]}</span>
                        <span>
                          Section {w.section}
                          {current.repeat > 0 ? " · Returning word" : ""}
                        </span>
                      </div>
                      <p className="eyebrow">
                        {intro && session.settings.mode === "learn"
                          ? "Meet this word"
                          : current.skill === "le"
                            ? "Give one English meaning"
                            : current.skill === "el"
                              ? "Retrieve the Latin headword"
                              : labels[current.skill]}
                      </p>
                      <h1
                        className={
                          current.skill === "el" ? "english-prompt" : "latin"
                        }
                      >
                        {current.skill === "el" ? w.meaningText : w.latin}
                      </h1>
                      <p className="forms">
                        {current.skill === "le" || intro
                          ? w.principalForms
                          : w.type || "type unspecified"}
                      </p>
                      {intro && session.settings.mode === "learn" ? (
                        <>
                          <p className="meaning">{w.meaningText}</p>
                          <p>
                            {w.type}{" "}
                            {w.governingCase && ` · governs ${w.governingCase}`}
                          </p>
                          <button
                            className="primary"
                            onClick={() => setIntro(false)}
                          >
                            Try active recall <ArrowRight size={18} />
                          </button>
                          <p className="small muted">
                            This first recall follows an introduction and counts
                            as assisted.
                          </p>
                        </>
                      ) : session.settings.format === "flash" ? (
                        <>
                          <button
                            className="flash-flip"
                            ref={next}
                            onClick={() => setIntro(!intro)}
                            aria-label="Flip flashcard"
                          >
                            {intro ? "Reveal answer" : "Hide answer"}{" "}
                            <kbd>Space</kbd>
                          </button>
                          {!intro && (
                            <>
                              <p className="meaning">
                                {current.skill === "el"
                                  ? w.latin
                                  : w.meaningText}
                              </p>
                              <p className="forms">{w.principalForms}</p>
                            </>
                          )}
                          <div className="button-row">
                            <button
                              disabled={busy || intro}
                              className="primary"
                              onClick={() => void answer()}
                            >
                              Continue
                            </button>
                            <button
                              disabled={busy || intro}
                              onClick={() => void answer(true)}
                            >
                              Not yet — revisit
                            </button>
                          </div>
                          <p className="small muted">
                            Viewing a flashcard does not update mastery. Use
                            typed recall afterwards.
                          </p>
                        </>
                      ) : session.settings.format === "mcq" ? (
                        <div className="options">
                          {current.options?.map((id, i) => (
                            <button
                              key={id}
                              ref={i === 0 ? next : undefined}
                              disabled={busy}
                              onClick={() => choose(id)}
                            >
                              <kbd>{i + 1}</kbd>
                              <span
                                className={
                                  current.skill === "el" ? "latin" : ""
                                }
                              >
                                {current.skill === "le"
                                  ? byId.get(id)!.meaningText
                                  : byId.get(id)!.latin}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void answer();
                          }}
                        >
                          <label className="sr-only" htmlFor="answer">
                            Your answer
                          </label>
                          <input
                            ref={input}
                            id="answer"
                            className="answer-input"
                            value={raw}
                            onChange={(e) => setRaw(e.target.value)}
                            maxLength={500}
                            placeholder={
                              current.skill === "parts"
                                ? "All supplied forms, separated by commas"
                                : "Type your answer…"
                            }
                            autoComplete="off"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                            disabled={busy}
                          />
                          <div className="button-row">
                            <button
                              className="primary"
                              disabled={busy || !raw.trim()}
                              type="submit"
                            >
                              {busy ? "Saving…" : "Check answer"}{" "}
                              <kbd>Enter</kbd>
                            </button>
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => void answer(true)}
                              disabled={busy}
                            >
                              I don’t know
                            </button>
                          </div>
                          {session.settings.mode === "exam" ? (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => void showHint()}
                              disabled={busy || session.hinted}
                            >
                              Request a hint (recorded)
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => void showHint()}
                              disabled={busy || session.hinted}
                            >
                              First-letter hint
                            </button>
                          )}
                          <p role="status" className="hint">
                            {hint || (session.hinted ? "Assisted recall" : "")}
                          </p>
                        </form>
                      )}
                      {current.contrastId !== undefined &&
                        session.settings.mode !== "exam" && (
                          <p className="contrast-note">
                            Distinguish this word from{" "}
                            <b className="latin">
                              {byId.get(current.contrastId)?.latin}
                            </b>
                            . Their meanings overlap in your previous answers.
                          </p>
                        )}
                    </article>
                  )
                )}
              </>
            )}
          </section>
        ) : page === "today" ? (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">Your daily practice</p>
                <h1>A little Latin, remembered.</h1>
                <p className="muted">Retrieve today. Remember tomorrow.</p>
              </div>
              <span className="date-chip">
                <CalendarDays size={16} />
                {now.toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </div>
            <section className="daily-panel">
              <div>
                <p className="eyebrow">Ready when you are</p>
                <h2>
                  {due.length
                    ? `${due.length} reviews due`
                    : "Begin your daily review"}
                </h2>
                <p>
                  {due.length
                    ? `About ${Math.max(1, Math.ceil((Math.min(due.length + 10, 20) * 18) / 60))} minutes · overdue recall first`
                    : "Start with 10 new recall cards. Your next reviews will adapt to your answers."}
                </p>
              </div>
              <button
                className="primary"
                onClick={() => void start(defaults)}
                disabled={busy}
              >
                Start today’s review <ArrowRight size={18} />
              </button>
            </section>
            {snapshot.activeSession && !snapshot.activeSession.finished && (
              <button
                className="resume"
                onClick={() => {
                  setSession(snapshot.activeSession);
                  setFeedback(Boolean(snapshot.activeSession?.lastGrade));
                  setIntro(
                    snapshot.activeSession?.settings.mode === "learn" ||
                      snapshot.activeSession?.settings.format === "flash",
                  );
                }}
              >
                Resume saved session · {snapshot.activeSession.cursor} of{" "}
                {snapshot.activeSession.queue.length} answered{" "}
                <ArrowRight size={16} />
              </button>
            )}
            <div className="workflow-grid">
              {[
                [
                  "Learn new words",
                  "Meet the forms, then practise recall.",
                  "learn",
                ],
                [
                  "Custom practice",
                  "Choose sections, skills and difficulty.",
                  "custom",
                ],
                ["Exam test", "A clean diagnosis across the syllabus.", "exam"],
              ].map(([title, desc, mode]) => (
                <button
                  className="workflow"
                  key={mode}
                  onClick={() => setup(mode as Settings["mode"])}
                >
                  <BookOpen size={20} />
                  <h3>{title}</h3>
                  <p>{desc}</p>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
            <section>
              <div className="section-heading">
                <h2>Your vocabulary, at a glance</h2>
                <button
                  className="text-button"
                  onClick={() => navigate("vocabulary")}
                >
                  Browse 450 words <ArrowRight size={15} />
                </button>
              </div>
              <div className="stat-grid">
                {outcomes.map((x) => (
                  <div className={"stat stat-" + x.toLowerCase()} key={x}>
                    <strong>{counts[x]}</strong>
                    <span>{x === "Due" ? "Due words" : x}</span>
                  </div>
                ))}
              </div>
              <p className="small muted">
                A word’s state reflects its weaker direction. Due reviews count
                each skill separately.
              </p>
            </section>
            <div className="two-col">
              <section className="panel">
                <p className="eyebrow">Two distinct skills</p>
                <h2>Recognition & production</h2>
                {(["le", "el"] as const).map((s) => (
                  <div className="skill-meter" key={s}>
                    <div>
                      <b>{labels[s]}</b>
                      <span>{strength(s)}%</span>
                    </div>
                    <div className="progress-track">
                      <span style={{ width: `${strength(s)}%` }} />
                    </div>
                  </div>
                ))}
                <p className="small muted">
                  Average predicted recall across all 450 words, with unseen
                  words at zero.
                </p>
              </section>
              <section className="panel">
                <p className="eyebrow">Retrieval history</p>
                <h2>
                  {accuracy === null
                    ? "Your first chapter"
                    : `${accuracy}% exact recall`}
                </h2>
                <p className="muted">
                  {recent.length
                    ? "Recent independent and assisted attempts, with hints and typos excluded from the numerator."
                    : "Typed answers will build a history here. Self-reported flashcards never count as successful retrieval."}
                </p>
                <div className="inline-stats">
                  <span>
                    <b>{snapshot.attempts.length}</b> recent reviews
                  </span>
                  <span>
                    <b>
                      {snapshot.confusions.filter((c) => c.count >= 2).length}
                    </b>{" "}
                    recurring confusions
                  </span>
                </div>
              </section>
            </div>
            <section>
              <div className="section-heading">
                <h2>Progress by section</h2>
                <span className="small muted">
                  Strong or mastered in both directions
                </span>
              </div>
              <div className="section-progress">
                {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => {
                  const p = words.filter((w) => w.section === n);
                  const known = p.filter((w) =>
                    ["Strong", "Mastered"].includes(
                      wordState(w, snapshot.states, now),
                    ),
                  ).length;
                  return (
                    <button
                      key={n}
                      onClick={() => {
                        setSettings({
                          ...defaults,
                          sections: [n],
                          mode: "custom",
                        });
                        navigate("practice");
                      }}
                    >
                      <div>
                        <b>Section {n}</b>
                        <span>
                          {known}/{p.length}
                        </span>
                      </div>
                      <div className="progress-track">
                        <span
                          style={{ width: `${(known / p.length) * 100}%` }}
                        />
                      </div>
                      <small>
                        {p[0].latin} – {p[p.length - 1].latin}
                      </small>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        ) : page === "practice" ? (
          <>
            <p className="eyebrow">Make your next session</p>
            <h1>
              {settings.mode === "exam"
                ? "Exam diagnosis"
                : settings.mode === "learn"
                  ? "Learn new vocabulary"
                  : "Custom practice"}
            </h1>
            <p className="muted">
              {settings.mode === "exam"
                ? "No immediate repeats. Your first answers are reported by direction."
                : "A focused session, with room to revisit mistakes."}
            </p>
            <div className="practice-layout">
              <section className="panel">
                <div className="section-heading">
                  <h2>Vocabulary sections</h2>
                  <div>
                    <button
                      className="text-button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          sections: defaults.sections,
                        })
                      }
                    >
                      All
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setSettings({ ...settings, sections: [] })}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="section-picker">
                  {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => {
                    const p = words.filter((w) => w.section === n);
                    return (
                      <button
                        aria-pressed={settings.sections.includes(n)}
                        className={
                          settings.sections.includes(n) ? "selected" : ""
                        }
                        key={n}
                        onClick={() =>
                          setSettings({
                            ...settings,
                            sections: settings.sections.includes(n)
                              ? settings.sections.filter((x) => x !== n)
                              : [...settings.sections, n],
                          })
                        }
                      >
                        <b>{n.toString().padStart(2, "0")}</b>
                        <small>{p[0].latin}</small>
                      </button>
                    );
                  })}
                </div>
              </section>
              <section className="panel settings-panel">
                <h2>Session settings</h2>
                <Select
                  label="Purpose"
                  value={settings.mode}
                  values={["custom", "daily", "learn", "exam"]}
                  onChange={(v) =>
                    setSettings({ ...settings, mode: v as Settings["mode"] })
                  }
                />
                <Select
                  label="Skill"
                  value={settings.direction}
                  values={["le", "el", "mixed", "parts", "grammar"]}
                  texts={[
                    "Latin → English",
                    "English → Latin",
                    "Mixed directions",
                    "Principal parts",
                    "Supported grammar",
                  ]}
                  onChange={(v) =>
                    setSettings({
                      ...settings,
                      direction: v as Settings["direction"],
                      format: ["parts", "grammar"].includes(v)
                        ? "type"
                        : settings.format,
                    })
                  }
                />
                <Select
                  label="Answer format"
                  value={settings.format}
                  values={["type", "mcq", "flash"]}
                  texts={["Typed recall", "Multiple choice", "Flashcards"]}
                  onChange={(v) =>
                    setSettings({
                      ...settings,
                      format: v as Settings["format"],
                    })
                  }
                />
                <Select
                  label="Part of speech"
                  value={settings.pos}
                  values={[
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
                    "prefix",
                    "phrase",
                    "unknown",
                  ]}
                  onChange={(v) => setSettings({ ...settings, pos: v })}
                />
                <Select
                  label="Learning state"
                  value={settings.filter}
                  values={["all", "weak", "new", "due", "mastered", "confused"]}
                  onChange={(v) =>
                    setSettings({
                      ...settings,
                      filter: v as Settings["filter"],
                    })
                  }
                />
                <label className="field">
                  Questions{" "}
                  <input
                    type="number"
                    min="0"
                    max="900"
                    value={settings.count}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        count: Number(e.target.value),
                      })
                    }
                  />
                  <small>0 = all matching vocabulary</small>
                </label>
                {settings.mode === "exam" && (
                  <div className="button-row">
                    {[20, 50, 100, 0].map((n) => (
                      <button
                        key={n}
                        onClick={() => setSettings({ ...settings, count: n })}
                      >
                        {n || "All"}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  className="primary"
                  disabled={busy || !settings.sections.length}
                  onClick={() => void start(settings)}
                >
                  Start session <ArrowRight size={18} />
                </button>
              </section>
            </div>
          </>
        ) : page === "vocabulary" ? (
          <>
            <p className="eyebrow">The defined vocabulary list</p>
            <h1>450 words. Every form matters.</h1>
            <div className="browse-tools">
              <label className="search">
                <Search size={18} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search Latin, meaning or type"
                  aria-label="Search vocabulary"
                />
              </label>
              <button
                onClick={() => setHideMeanings(!hideMeanings)}
                aria-pressed={hideMeanings}
              >
                {hideMeanings ? "Show meanings" : "Hide meanings"}
              </button>
              <Select
                label="State"
                value={settings.filter}
                values={["all", "weak", "new", "due", "mastered", "confused"]}
                onChange={(v) =>
                  setSettings({
                    ...settings,
                    sections: defaults.sections,
                    filter: v as Settings["filter"],
                  })
                }
              />
              <Select
                label="Section"
                value={
                  settings.sections.length === 1
                    ? String(settings.sections[0])
                    : "all"
                }
                values={[
                  "all",
                  ...Array.from({ length: 15 }, (_, i) => String(i + 1)),
                ]}
                onChange={(v) =>
                  setSettings({
                    ...settings,
                    sections: v === "all" ? defaults.sections : [Number(v)],
                  })
                }
              />
            </div>
            <p className="muted small">
              {browse.length} entries · Select a word for history, grammar and
              targeted practice.
            </p>
            <div className="word-list">
              {browse.map((w) => (
                <button
                  className="word-row"
                  key={w.id}
                  onClick={() => setDetail(w)}
                >
                  <div>
                    <b className="latin">{w.latin}</b>
                    <small>{w.principalForms || w.type}</small>
                  </div>
                  <span>{hideMeanings ? "Meaning hidden" : w.meaningText}</span>
                  <span
                    className={
                      "badge badge-" +
                      wordState(w, snapshot.states, now).toLowerCase()
                    }
                  >
                    {wordState(w, snapshot.states, now)}
                  </span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
            {!browse.length && (
              <p className="panel">
                No entries match. Change the filters or search.
              </p>
            )}
          </>
        ) : page === "confusions" ? (
          <>
            <p className="eyebrow">Words that cross wires</p>
            <h1>Common confusions</h1>
            <p className="muted">
              Substitutions are recorded separately. Related meanings still
              deserve precise Latin.
            </p>
            {!snapshot.confusions.length ? (
              <div className="panel empty">
                <BookOpen size={32} />
                <h2>No confusion pairs yet</h2>
                <p>
                  Typed Latin substitutions will appear here, with the teacher’s
                  meanings side by side.
                </p>
                <button onClick={() => setup("custom")}>
                  Practise production
                </button>
              </div>
            ) : (
              <div className="confusion-grid">
                {[...snapshot.confusions]
                  .sort((a, b) => b.count - a.count)
                  .map((c) => (
                    <article
                      className="panel"
                      key={`${c.target_id}:${c.substitute_id}`}
                    >
                      <div className="confusion-pair">
                        <div>
                          <h2 className="latin">
                            {byId.get(c.target_id)?.latin}
                          </h2>
                          <p>{byId.get(c.target_id)?.meaningText}</p>
                          <small>{byId.get(c.target_id)?.principalForms}</small>
                        </div>
                        <span>↔</span>
                        <div>
                          <h2 className="latin">
                            {byId.get(c.substitute_id)?.latin}
                          </h2>
                          <p>{byId.get(c.substitute_id)?.meaningText}</p>
                          <small>
                            {byId.get(c.substitute_id)?.principalForms}
                          </small>
                        </div>
                      </div>
                      <p className="small muted">
                        {c.count} substitution{c.count !== 1 ? "s" : ""} ·{" "}
                        {date(c.last_seen)}
                      </p>
                      <button
                        onClick={() =>
                          void start({
                            ...defaults,
                            mode: "custom",
                            direction: "el",
                            ids: [c.target_id, c.substitute_id],
                            count: 0,
                          })
                        }
                      >
                        Contrast these words <ArrowRight size={16} />
                      </button>
                    </article>
                  ))}
              </div>
            )}
          </>
        ) : (
          <Backup
            onNotice={setNotice}
            onError={setError}
            onRefresh={() => refresh(true)}
          />
        )}
      </main>
      <footer>
        <span>
          Vocabulary and reference trainer created by your Latin teacher.
        </span>
        <span>
          <Command size={14} /> Keyboard-first · Thoughtful daily practice.
        </span>
      </footer>
      <dialog
        ref={dialog}
        onCancel={() => setDetail(null)}
        onClose={() => setDetail(null)}
        aria-labelledby="word-title"
      >
        {detail && (
          <>
            <button
              className="dialog-close icon-button"
              onClick={() => setDetail(null)}
              aria-label="Close word detail"
            >
              <X />
            </button>
            <p className="eyebrow">
              Section {detail.section} · {detail.type || "type unspecified"}
            </p>
            <h1 id="word-title" className="latin">
              {detail.latin}
            </h1>
            <p className="forms">{detail.principalForms}</p>
            <p className="meaning">{detail.meaningText}</p>
            <dl className="grammar">
              {[
                ["Gender", detail.gender],
                ["Declension", detail.declension],
                ["Conjugation", detail.conjugation],
                ["Governing case", detail.governingCase],
                ["Notes", detail.grammaticalNotes],
                ["Status", detail.tags.join(", ")],
              ]
                .filter((x) => x[1])
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            <div className="detail-skills">
              {(["le", "el"] as const).map((skill) => {
                const s = snapshot.states.find(
                  (s) => s.word_id === detail.id && s.skill === skill,
                );
                return (
                  <div className="panel" key={skill}>
                    <b>{labels[skill]}</b>
                    <p>
                      {mastery(s, now)} · {Math.round(recall(s, now) * 100)}%
                      recall
                    </p>
                    <small>
                      Next: {s ? date(s.card.due) : "not introduced"}
                    </small>
                    <button
                      onClick={() =>
                        void start({
                          ...defaults,
                          mode: "custom",
                          direction: skill,
                          ids: [detail.id],
                          count: 1,
                        })
                      }
                    >
                      Practise this direction
                    </button>
                  </div>
                );
              })}
            </div>
            {detail.partOfSpeech === "verb" && forms(detail).length > 0 && (
              <button
                onClick={() =>
                  void start({
                    ...defaults,
                    mode: "custom",
                    direction: "parts",
                    ids: [detail.id],
                    count: 1,
                  })
                }
              >
                Practise principal parts
              </button>
            )}
            <h2>Recent attempts</h2>
            {snapshot.attempts
              .filter((a) => a.word_id === detail.id)
              .slice(0, 10)
              .map((a, i) => (
                <p className="history" key={i}>
                  <span>
                    {labels[a.skill]} · {a.outcome}
                    <small>
                      {a.raw || "No answer"}
                      {a.confusionId !== undefined
                        ? ` · confused with ${byId.get(a.confusionId)?.latin}`
                        : ""}
                    </small>
                  </span>
                  <time>{date(a.at)}</time>
                </p>
              ))}
            {!snapshot.attempts.some((a) => a.word_id === detail.id) && (
              <p className="muted">No attempts yet.</p>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
function message(e: unknown) {
  return e instanceof Error
    ? e.message
    : "Something went wrong. Please try again.";
}
function Select({
  label,
  value,
  values,
  texts,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  texts?: string[];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {values.map((v, i) => (
          <option key={v} value={v}>
            {texts?.[i] || v[0].toUpperCase() + v.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
}
function Backup({
  onNotice,
  onError,
  onRefresh,
}: {
  onNotice: (s: string) => void;
  onError: (s: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [pending, setPending] = useState<{
      text: string;
      revision: number;
      attempts: number;
    } | null>(null),
    [loading, setLoading] = useState(false);
  async function download() {
    setLoading(true);
    try {
      const text = await exportProgress();
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `latin-mastery-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onNotice("Backup downloaded. Keep it somewhere safe.");
    } catch (e) {
      onError(message(e));
    } finally {
      setLoading(false);
    }
  }
  async function choose(file: File | undefined) {
    if (!file) return;
    setPending(null);
    onError("");
    setLoading(true);
    try {
      if (file.size > 25000000)
        throw new Error("Backup exceeds the 25 MB limit.");
      const revision = await backupRevision();
      const text = await file.text();
      const snapshot = parseBackup(text);
      setPending({ text, revision, attempts: snapshot.attempts.length });
    } catch (e) {
      onError(message(e));
    } finally {
      setLoading(false);
    }
  }
  async function restore() {
    if (!pending) return;
    setLoading(true);
    try {
      await importProgress(pending.text, pending.revision);
      setPending(null);
      onNotice("Backup restored in this browser.");
      await onRefresh();
    } catch (e) {
      onError(message(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="account-page">
      <p className="eyebrow">Your progress, under your control</p>
      <h1>Keep what you learn.</h1>
      <p className="muted">
        Your learning history is stored in this browser on this device. There
        are no accounts and no automatic cross-device sync. Clearing site data
        or using private browsing can remove your progress.
      </p>
      <section className="panel">
        <h2>Back up your progress</h2>
        <p>
          Export a JSON backup regularly. Import it in the trainer on another
          device to transfer your learning history and current session.
        </p>
        <button
          className="primary"
          onClick={() => void download()}
          disabled={loading}
        >
          Export progress <Download size={18} />
        </button>
        <label className="field">
          Import backup{" "}
          <input
            type="file"
            accept=".json,application/json"
            disabled={loading}
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {pending && (
          <div role="status">
            <p>
              Validated backup: {pending.attempts} attempts. Restoring replaces
              this browser’s current progress. Export it first if you want to
              keep it.
            </p>
            <div className="button-row">
              <button disabled={loading} onClick={() => void restore()}>
                Replace progress with backup
              </button>
              <button disabled={loading} onClick={() => setPending(null)}>
                Cancel import
              </button>
            </div>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Privacy</h2>
        <p>
          Answers and learning history stay on your device. No analytics,
          emails, passwords or learning data are sent to a backend. GitHub Pages
          serves the application files.
        </p>
      </section>
    </section>
  );
}
