# Teacher reference audit

The complete 646-line HTML, including all 450 entries, was read before implementation. It was created by the Latin teacher, not Atharv. The DOCX has 450 table rows with the same section ordering. HTML is the import authority.

The original offers 15 section toggles with select all/clear and streak progress bars; directions LE/EL; counts 10/20/30/all; weighted weak/random ordering; typed, MCQ, flashcard and list modes; last-wrong practice; first-letter hints; skips; immediate feedback; bounded retries after 3–5 questions; first-try results and missed retesting. Flashcards reinsert Not yet after 2–4 cards and affect weighting, not successful test counts. List meanings can be hidden/revealed. Enter, 1–4 and Space controls, focus outlines, dark mode, safe areas and reduced-motion CSS are useful.

English checking strips accents, punctuation, hyphens and optional leading to/articles; splits comma meanings outside parentheses, expands slash alternatives, optionally removes be, and tolerates one or two Levenshtein edits. Latin checking strips all nonletters and accepts comma headwords. Identical English strings from another Latin word count as correct; overlapping meanings request another try. Feedback permits a manual I was right override.

Progress lives only in localStorage and is shared across directions. Two exact or typo successes establish learnt; hints prevent streak growth but still count as right. Historical timestamps and long-term due scheduling are absent. MCQ prefers same POS but does not exclude semantic ambiguity. Principal forms are shown rather than tested. Session state is lost on refresh.

The new design retains restrained typography, introduction then active recall, useful normalization, immediate feedback, bounded repetition and accessible controls. It replaces local-only persistence, shared streaks, full typo credit, synonym auto-credit and arbitrary long-term weighting. Manual overrides must not silently create trusted mastery.

Source issues are flagged rather than corrected: unequal section sizes; distinct cum/in/ut entries; missing types for several phrases; DOCX ilIa versus HTML illa at entry 163; DOCX indeclinable labels absent from HTML; ellipsis formatting differences. No conjugator or unsourced grammar is added.
