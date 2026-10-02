# GCSE Latin Trainer

A static React/TypeScript/Vite learning application for GitHub Pages. The original vocabulary, reference code and reference design were created by the Latin teacher, not the student. All 450 entries in 15 sections are reproducibly extracted without silent corrections.

Latest scope (2 October 2026): **GitHub Pages only; no authentication, Supabase or server backend.** Progress persists in IndexedDB in this browser. Validated JSON export/import transfers it manually between devices; automatic sync is out of scope. Clearing site data or private browsing can remove progress, so export regular backups.

Practice starts immediately with a 10-word Latin-to-English session. Learn, custom practice, exams, MCQ, flashcards, principal parts, supported grammar and vocabulary lookup remain available. The interface has no returning-user dashboard, historical progress stats or resume prompts. Within-session feedback, results and bounded mistake repeats remain. Existing IndexedDB records, independent FSRS cards and JSON backups stay compatible; opening the trainer does not delete saved data.

**Source repository:** [tamotia11-jpg/Latin-Trainer](https://github.com/tamotia11-jpg/Latin-Trainer). GitHub Pages publication uses the included Actions workflow. No backend credentials are needed. Production deployment verification is recorded in the project Page in Atharv Second Brain.

## Documentation

- [Reference audit](docs/REFERENCE-AUDIT.md)
- [Architecture and browser data schema](docs/ARCHITECTURE.md)
- [Scheduler](docs/SCHEDULER.md)
- [GitHub Pages deployment](docs/DEPLOYMENT.md)
- [Verification and limitations](docs/VERIFICATION.md)
- [Import report](docs/import-report.json)

## Development verification

Node 22. `npm ci`, then:

```sh
npm run validate:data
npm run lint
npm run typecheck
npm test
npm run test:integration
npx playwright install chromium
npm run test:e2e
npm run build
```

Local execution is development verification; GitHub Pages HTTPS publication is the deliverable. `npm run extract` regenerates structured vocabulary JSON and its report from the immutable teacher HTML. No conjugation generator or unsupported metadata is invented. Durable task memory is maintained in Atharv Second Brain.
