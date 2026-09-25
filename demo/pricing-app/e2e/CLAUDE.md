# Pricing Admin e2e tests

Playwright tests that run against Pricing Admin's real QA deployment. This folder sits inside the app's repo; the
app's source is `..` unless `docs/app.md` says otherwise. Run everything from this folder.

- Skills: `e2e-setup` adapts the harness and writes the first suite; `e2e-write` adds tests; `e2e-triage` runs the suite and
  diagnoses failures.
- `docs/app.md` maps screens, workflows, write endpoints and data. Keep it current when you learn something.
- Tests import `test`/`expect` from `harness/fixtures.ts`. Its fixtures refuse non-QA URLs, abort requests to hosts
  and writes not listed in `playwright.config.ts`, fail on uncaught page errors, and give read-only DB access.
- Tests change only records they create (named `E2E ...`). Existing QA data is for reading.
- `harness/`, the lint, TypeScript and Prettier configs, and the skills come from the template and are replaced by
  `uvx copier update`. Change them upstream, not here.
- Before finishing: `npm run check`, and the tests you touched pass with `--retries 0 --repeat-each 3`.
