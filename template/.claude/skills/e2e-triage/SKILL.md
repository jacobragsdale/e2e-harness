---
name: e2e-triage
description: "Run e2e tests and diagnose failing or flaky ones. Use when Playwright tests fail, time out or flake, or the user asks to run the suite or check a QA run, even if they only paste an error. Sorts test bugs from app bugs, data drift and QA outages."
---

# Triage e2e failures

Run the suite against QA, explain every failure, fix the ones that are test bugs, and report the rest with
evidence. A green suite that hides an app bug is worse than a red one, so never make a test pass by weakening what
it checks.

## Run

```bash
npx playwright test [file or -g "name"] --retries 0
```

Use the results already in `test-results/` when the user asks about a run that already happened. The results are:

- `test-results/results.json`: every test's status, error and attachments.
- `test-results/<test-dir>/error-context.md`: the page's accessibility tree at the moment of failure. Read this
  first; it usually shows what was on screen instead of the expected element.
- `test-results/<test-dir>/test-failed-1.png`: the screenshot. Read it when layout or overlays matter.
- The `guard` attachment: requests the harness blocked, and uncaught page errors.

## Classify each failure

Match the first line of the error, then confirm with `error-context.md` and the app source (`../src`).

| Symptom                                                         | Likely cause                                                          | Action                                                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Harness guard: Blocked GET ... read from <host>`               | The app now loads from a new host                                     | Find out what the host is. Add it to `readHosts` if it's a font, CDN or SSO host; otherwise report it  |
| `Harness guard: Blocked <METHOD> ... not in allowedWrites`      | The test triggers a write that isn't allowed, or the app added a call | Ask the user whether to allow it. Don't reroute the test around it                                     |
| `Harness guard: Uncaught page error`                            | The app threw in the browser                                          | App bug: report it with the message                                                                    |
| `No QA data matches this query`                                 | QA data changed and nothing fits the query                            | Loosen the query to what the test really needs, or ask for the data. Never hard-code an id             |
| `strict mode violation: ... resolved to N elements`             | The locator is too broad                                              | Scope it to a dialog, row or section. Never add `.first()`                                             |
| `element(s) not found`, the tree shows a different UI           | The app changed the label or flow, or the test is wrong               | Check the template in `../src`. If the change is intended, update the locator; if not, it's an app bug |
| `element(s) not found`, the tree shows a spinner or empty state | The test outran loading or a background job                           | Wait on the visible outcome, with a longer timeout on that assertion                                   |
| Wrong value in `toHaveText`/`toHaveValue`                       | An app bug, or an expectation that doesn't match the found data       | Work out the right value from the business rule and source. Change the test only if the test was wrong |
| `net::ERR_*`, navigation timeouts, 5xx on every test            | QA is down or unreachable                                             | Check `curl -sI "$E2E_BASE_URL"`. Stop and report; don't edit tests                                    |
| Passes alone, fails in the full run                             | Tests share data or depend on order                                   | Make the test create its own record or use a unique name                                               |
| Fails once in `--repeat-each 5`                                 | A race                                                                | Replace the wait that assumes timing with an assertion on what the user sees                           |

## Fix or report

- **Test bug:** fix it following the e2e-write skill's rules, then prove it with
  `npx playwright test <file> -g "<name>" --retries 0 --repeat-each 5`.
- **App bug:** leave the test asserting the correct behavior. Report the title, steps, expected and actual results,
  and evidence (test name, `test-results/` path, source file and line if you found the cause). Mark it
  `test.fail()` only when the user asks, with the bug id in the reason.
- **Environment or data:** report what is missing and who can fix it. Change nothing.

Never fix a failure by adding `waitForTimeout`, `force: true`, `.first()`, retries, a longer global timeout, a
conditional, or a looser expected value. Never widen `allowedWrites` or `readHosts` without the user's agreement.

## Report

Give one line per failure, grouped by cause:

```
App bugs (1)
  products.spec.ts › a discontinued product cannot be repriced: job shows DONE, expected FAILED ("Product is discontinued").
    Evidence: test-results/products-a-discontinued-.../error-context.md; server skips the status check (server/reprice.ts:41).
Fixed test bugs (2)
  rules.spec.ts › toggling a rule...: toggle was located by position; now scoped to the rule's row. 5/5 repeats pass.
  ...
Environment (0)
```

Finish with the overall result of the last full run, as passed, failed and flaky counts.
