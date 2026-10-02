# GitHub Pages deployment

The latest decision requires static GitHub Pages hosting only. No Supabase, auth, database, server deployment, environment keys or ChatGPT Sites are used.

The repository is [tamotia11-jpg/Latin-Trainer](https://github.com/tamotia11-jpg/Latin-Trainer), created by the owner and accessible through the existing integration. The GitHub Pages URL is expected to be `https://tamotia11-jpg.github.io/Latin-Trainer/`; verify it after the deployment succeeds.

Push the current static project to `main`. In repository Settings → Pages choose **GitHub Actions**. `.github/workflows/pages.yml` verifies dataset, lint, types, unit/storage tests, browser checks and production build, then publishes `dist`. GitHub supplies HTTPS. No application environment variables are required. Vite uses relative assets; there are no path-based app routes requiring a server fallback. Future content can be updated separately from domain logic.

The teacher source is credited in the interface and audit. Before public source publication, exclude private teacher/student material and secrets. The rendered application needs only vocabulary content, not the supplementary DOCX. Both original references are retained in the private cloud workspace for audit. The supplementary DOCX is excluded from the public repository; the teacher HTML is included as the reproducible dataset source. Do not attribute the teacher work to the student.

After deployment run `SMOKE_URL=https://<owner>.github.io/<repo>/ npm run test:e2e`. Tests should use relative application URLs under the repository path. Verify all 450 entries, exact/wrong/hinted answers, repeats, exams, independent directions, refresh/resume, export/download, malformed backup rejection, import into a second browser, storage failure recovery, multiple tabs, mobile and keyboard behavior. Inspect console errors and verify no application backend requests. Do not claim production completion before the real HTTPS smoke pass.
