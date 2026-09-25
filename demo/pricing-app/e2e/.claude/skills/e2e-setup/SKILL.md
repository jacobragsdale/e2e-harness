---
name: e2e-setup
description: "Set up this e2e harness for its app and write the first tests. Use when the harness is new, docs/app.md is unfilled, or the app changed a lot: maps screens from source, configures QA safety, covers common workflows, even if the user just says 'get e2e going'."
---

# Set up the e2e harness for this app

Adapt the harness to the app it sits in, then leave a passing suite that covers the app's common workflows. The
harness lives in `e2e/` inside the app's repository; the app's source is the parent directory unless the user says
otherwise. Work from the `e2e/` directory.

## Ask first

Collect these before touching config, ask them together, and wait for answers. Never guess a URL or credential.

- The QA base URL (`E2E_BASE_URL`) and the read-only DB URL (`E2E_DB_URL`, format in `.env.example`). The user puts
  passwords in `.env` themselves; don't ask for them in chat.
- The marker that makes QA URLs recognisable (default `qa`). Both URLs must contain it.
- Where the source is, if not `..`, and whether a sibling repo holds the backend (it tells you the tables).

Later, in step 4, ask the user to confirm the write list. If the user said to use your judgment or is not available,
take the defaults stated in each step and list every default you took in the final report.

## Workflow

Copy this checklist into your notes and tick it off:

```
- [ ] 1. Install and check
- [ ] 2. Map the app into docs/app.md
- [ ] 3. Map the data
- [ ] 4. Configure playwright.config.ts
- [ ] 5. Smoke test every screen
- [ ] 6. Tests for the common workflows
- [ ] 7. Full run and report
```

### 1. Install and check

```bash
npm install
npx playwright install chromium
npm run check
```

Write `.env` from `.env.example` with the answers. Confirm QA answers: `curl -sI "$E2E_BASE_URL"` returns a status.

### 2. Map the app

Read the source, not just the running app; it lists screens a click-through would miss.

- **Routes:** find every `Routes` array and `RouterModule.forRoot/forChild` (`grep -rn "Routes\b" ../src/app`),
  follow `loadChildren`/`loadComponent`, and note guards and resolvers.
- **Screens:** for each routed component, read its template. Note the heading, forms (labels, validators and their
  messages), tables and their columns, dialogs, buttons, and empty and error states.
- **Calls:** find HttpClient and `httpResource` calls (`grep -rnE "http\.(get|post|put|patch|delete)|httpResource" ../src`).
  Record each endpoint's method, path and the screen action that fires it.

Fill `docs/app.md` from the template already in it: screens, workflows, write endpoints, and terms (what users call
things versus what the UI and database call them). Keep it factual and short. The e2e-write skill relies on it.

### 3. Map the data

Find the tables behind each screen, so tests can locate data by what it is. Use the backend source when there is one.
Otherwise query the catalog, then sample:

```bash
npm run sql -- "SELECT table_name FROM user_tables ORDER BY table_name"                 # Oracle
npm run sql -- "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_NAME"   # SQL Server
npm run sql -- "SELECT name FROM sqlite_master WHERE type = 'table'"                    # SQLite
```

Match tables to screens by comparing a row the UI shows with the database. For each screen, record in
`docs/app.md` a query that finds a typical record, and note what varies (statuses, flags, counts) that tests may
need.

### 4. Configure `playwright.config.ts`

- `qaMarkers`: the answer from "Ask first".
- `allowedWrites`: the non-GET endpoints from step 2, written as `"METHOD /path/*"`. Show the user the list with
  what each does, and ask which the tests may call in QA. Default: allow the writes the common workflows need,
  that create records or change records the test created. Leave out anything that deletes or changes data in
  bulk, sends email, or touches other systems, and note each exclusion in `docs/app.md`.
- `readHosts`: start empty. Add a host only after a smoke run shows the app loading from it, and only once you
  know what it is: fonts, a CDN, the SSO provider. Never add a host to make an unexplained failure go away.
- Leave `failOnPageError: true`. If the app throws on load in QA, that is a finding for the report.

### 5. Smoke test

Write `tests/smoke.spec.ts`: one test per screen that needs no record (lists, forms, dashboards). Each opens the
route and asserts its heading. Add one test for the navigation links. Run it:

```bash
npx playwright test tests/smoke.spec.ts --retries 0
```

A guard failure here shows which hosts the app reads and which writes it makes on load. Resolve each as step 4
says, then rerun until green.

### 6. Tests for the common workflows

Write these tests without asking which ones, following the e2e-write skill (`.claude/skills/e2e-write/SKILL.md`)
for data, locators, and verification. Cover each item that the app has, for each main entity:

| Workflow           | Tests                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| List               | shows records; each search and filter narrows the results; the empty state shows when nothing matches                                          |
| Detail             | opening a record from the list shows its key fields; an unknown id shows the not-found state                                                   |
| Create             | a valid record is saved and shown; each client-side validation message appears; one server-side rejection (duplicate, rule violation) is shown |
| Edit               | a change persists after reload; cancel leaves the record unchanged                                                                             |
| Delete, deactivate | a record the test created goes away after confirming; cancelling the confirmation keeps it                                                     |
| Child records      | add, edit, toggle and remove items inside a record (lines, rules, notes), on a record the test created                                         |
| Background jobs    | starting one shows progress and the finished result; a failing case shows its error                                                            |
| Navigation         | the main nav reaches each screen; an unknown URL shows the not-found page                                                                      |

Skip a row when the app has no such feature, or when it needs a write the user did not allow. Record each skip and
its reason in `docs/app.md` under "Not covered". Prefer one clear test per behavior over one long test per screen.

### 7. Full run and report

```bash
npx playwright test --retries 0 --repeat-each 2
npm run check
```

Every test must pass both repeats, and `npm run check` must pass. Fix failures with the e2e-triage skill. A failure
that is an app bug stays in the suite, asserting the correct behavior, and goes in the report.

Report to the user:

- **Coverage:** each workflow, its test file, and its status.
- **Configuration:** the `allowedWrites` and `readHosts` you set, and why.
- **Findings:** likely app bugs, with steps and evidence (the test name and `test-results/` path).
- **Assumptions and open questions:** every default you took.

## Example

The user runs the skill in a new `e2e/` for an order-entry app. Step 2 finds routes `/orders`, `/orders/new`,
`/orders/:id` and the endpoints `POST /api/orders`, `PUT /api/orders/:id`, `POST /api/orders/:id/cancel`. The user
allows all three. Step 6 writes these files:

- `tests/orders-list.spec.ts`: list, search by customer, filter by status, empty state.
- `tests/orders-create.spec.ts`: create, required fields, server rejection of a past delivery date.
- `tests/orders-detail.spec.ts`: open from the list, edit the delivery note and reload, cancel an order it created
  (confirm and dismiss).
- `tests/navigation.spec.ts`: the main nav and the not-found page.

The report lists 14 tests passing, `readHosts: ["fonts.gstatic.com"]`, and one finding: the status filter ignores
"On hold".
