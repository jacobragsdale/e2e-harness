# e2e-harness

A [Copier](https://copier.readthedocs.io) template that adds Playwright end-to-end tests to a web app's repo, built
to run against a **real, shared QA deployment** and to be driven by coding agents (Claude Code skills included).

```bash
cd my-angular-app
uvx copier copy gh:jacobragsdale/e2e-harness e2e
cd e2e && claude          # then: "set up the e2e tests"
```

The `e2e-setup` skill reads the app's source (routes, templates, services), maps it in `e2e/docs/app.md`, configures
the QA safety settings, and writes a passing suite for the common workflows: list, search and filter, detail,
create with validation, edit, delete, child records, background jobs, navigation. `e2e-write` adds tests from a
requirement or ticket; `e2e-triage` runs the suite and sorts test bugs from app bugs, data drift and QA outages.

## Why a harness, not just Playwright

Tests against shared QA need guarantees a plain Playwright project doesn't give. `harness/fixtures.ts` enforces them
for every test:

- The base URL and database URL must contain a QA marker, or nothing runs.
- Every browser request is checked. Reads go to the app or allowlisted hosts (fonts, CDN, SSO). Writes go only to
  the app, and only to allowlisted `METHOD /path/*` endpoints. Anything else is aborted and fails the test, so a
  test can't touch production or an endpoint nobody approved.
- Service workers and Playwright's `request` client are disabled, since both would bypass the check.
- A read-only database fixture (Oracle, SQL Server, SQLite) finds test data by what it is, not by fixed ids. It is
  read-only three ways: SELECT-only statements, a read-only or rolled-back transaction, and your SELECT-only account.
- Lint enforces `eslint-plugin-playwright`'s rules plus a ban on importing `@playwright/test` directly, so no test
  can skip the fixtures.

The skills add the conventions: tests change only records they create, locators come from roles and labels
checked against the Angular templates, waits are on what the user sees, and every new test passes three repeats
and is shown to fail when its expected value is wrong.

## This repo

| Path | What |
|---|---|
| `template/` | what gets stamped into `<app>/e2e/` |
| `copier.yml` | the question (`app_name`) and the app-owned files `copier update` leaves alone |
| `demo/pricing-app/` | a real Angular 22 + Material app (products, discount rules, reprice jobs) with a Node API over SQLite, to develop and evaluate against |
| `demo/pricing-app/e2e/` | the suite the `e2e-setup` skill wrote for the demo, unedited, as a reference |
| `check.sh` | stamps the template, runs its static checks and unit tests, then runs the demo suite against the demo app |

Run the demo: `cd demo/pricing-app && npm ci && npm run db:reset && npm start`, then open
<http://pricing-qa.localhost:4300>. `*.localhost` resolves to your machine in Chromium, and the `qa` in the host name
is what passes the QA guard.

Requirements: Node 22.18 or later (the harness runs `.ts` files with Node's type stripping) and `uv` for Copier.
