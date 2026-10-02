# Revised static scope: verification and red-team

Latest scope: GitHub Pages only, with browser persistence and validated export/import. Earlier PostgreSQL/backend checks are historical and do not verify this scope. No subagents, Ruflo, independent agent review or desktop build were used. Current work is in the existing cloud workspace.

## Current checks

The revised domain/storage suite has 58 tests (44 preserved domain tests, 14 IndexedDB/backup integration checks). Browser suite has 27 checks across desktop, iPad emulation and phone emulation. Final consolidated run: all 58 unit/storage tests and all 27 browser checks passed. Lint, strict TypeScript, deterministic dataset validation, the dedicated storage integration run and the production build passed. Lint, strict TypeScript, deterministic data validation and production build are required. Tests execute development builds in the cloud workspace; they are not a live deployment smoke pass.

Storage checks exercise reopen persistence, independent direction states, atomic concurrent retries, stale session rejection, saved hints, feedback advancement, confusion counts, corrupt stored data, backup round-trip, invalid versions/datasets, nonfinite metrics, IDs, duplicates, session positions, prototype payloads, oversized files and import revision conflicts. Browser checks exercise refresh/resume, saved hints, separate-context backup transfer, invalid-file preservation, multi-tab conflict/recovery, storage failure retaining the typed answer and retry without duplicate progress. The original list/learn/exam/MCQ/keyboard/contrast checks are retained; light/dark accessibility is checked with axe.

## Red-team findings and fixes

- Superseded cloud setup/account UI and backend dependency removed; all learning writes now use IndexedDB transactions.
- Async persistence exposed keyboard registration/focus races. Keyboard handlers/focus now run before paint and include session revisions; hints and MCQ feedback appear after saves complete.
- Refresh immediately during an in-flight write cannot imply a committed save. Visible committed feedback is verified before refresh; failed writes never claim success.
- Imported backups are untrusted: strict shape, finite bounds, actual ISO dates, vocabulary/version checks and session consistency protect scheduler/UI behavior. Invalid imports retain existing data.
- Multiple tabs cannot apply stale state or double-count a retry. Import replacement also checks the storage revision captured when choosing the file.
- Failed transactions can already be aborted; preserving the original error prevents misleading quota errors.
- Published tests use relative URLs so a GitHub Pages repository subpath works.
- Earlier grading fixes remain: Latin whitespace/token safety, semantic confusion handling, complete MCQ labels, explicit unknown metadata, bounded flashcard revisits without mastery and hidden exam answers until results.

## Remaining gates and limits

No public URL or deployed smoke pass is verified. On 2 October 2026 the owner created `tamotia11-jpg/Latin-Trainer`, and the existing integration verified repository admin and push permissions. Deployment and live smoke-test results are recorded separately in Atharv Second Brain. No Supabase/auth credential is needed. Browser progress does not sync automatically. Export/import replaces rather than merges profiles. Clearing storage/private mode can remove history. Backups are limited to 25 MB and saved profiles remain exportable. Physical iPad/Safari are not tested. FSRS uses default weights plus conservative evidence safeguards; no authoritative conjugator is implemented.

V2: assess FSRS calibration on real data, support backup merging, improve contrast lessons, validate richer grammar against authoritative sources, add physical Safari/iPad testing and consider an offline app cache. Keep the teacher's source data flags visible and do not silently correct them.
