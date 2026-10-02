# FSRS and evidence policy

Uses the pinned ts-fsrs package in package-lock.json, FSRS default weights, 90% requested retention, a 365-day maximum and short-term learning enabled. Fuzz is disabled for deterministic calculation. Card snapshots retain due, stability, difficulty, state, reps/lapses, previous review, intervals and learning step. LE/EL and principal-part/grammar cards are independent.

Exact independent typed recall maps to Good. Minor typo maps to Hard; wrong, skip and hint map to Again. MCQ exact maps to Hard. Flashcard self-report only records exposure and never updates a memory card. Correctly completing an introduced word remains assisted on its first learn-mode question.

Conservative safeguards around FSRS cap interval/stability growth for typos, MCQ, repeats within 24 hours, and answers taking over two minutes. These are evidence-policy adaptations, not claims of a newly validated memory model. Response time is measured from the browser's persisted question timestamp (and includes idle time; advancing resets it); it never triggers Easy. Historical accuracy/failures and confusion counts prioritize custom/targeted practice. Five independent retrieval days and stability of at least 60 days are required for Mastered; three days and 14-day stability for Strong. Due takes precedence over strength. Weak reflects a failed last recall or sustained failures. New is unreviewed; other cards are Learning.

Same-session retries insert after three intervening positions when available, at most twice. They do not replace the FSRS due queue and cannot inflate durable mastery. Exam never inserts repeats; diagnostic outcomes are retained and scheduling uses the same conservative policy. Daily review orders overdue skill cards before up to ten unseen cards. Queue length is bounded by requested count before retries.

Future: fit parameters from real history; evaluate calibration/retention; account for inactivity explicitly; richer contrast prompts and authoritative morphology. No unreliable conjugation generation is included.
