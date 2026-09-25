---
name: e2e-write
description: "Write Playwright e2e tests for this app. Use whenever the user asks to test, cover or automate a screen, workflow, requirement, ticket or bug, even if they don't say Playwright or e2e. Not for fixing failing tests (e2e-triage)."
---

# Write e2e tests

Turn a requirement into Playwright tests that run against the real QA deployment, pass reliably, and fail when the
behavior breaks. Every test here shares QA with people, so a test changes only data it created.

## Before writing

1. Read `docs/app.md` (screens, workflows, write endpoints, data) and `playwright.config.ts` (`allowedWrites`).
   If `docs/app.md` is still the unfilled template, run the e2e-setup skill first.
2. Restate the requirement as one or more behaviors: _given_ some data, _when_ the user does something, _then_ they
   see an outcome. One behavior is one test.
3. Read the Angular source for each screen involved (`../src/app`, or where `docs/app.md` says): the route, the
   component template (labels, button text, dialogs, error messages) and the service calls. The template is the
   truth for names; the live page confirms them.
4. Ask before writing when the answer changes what the test asserts: an expectation with no checkable value
   ("prices update correctly"), two plausible readings, or a write the test needs that `allowedWrites` lacks. Ask
   up to four questions at once, each with your recommended answer first. Otherwise take the default below and say
   which default you took.

## Find the data

- **Tests that change data create their own records** through the UI, named `E2E <what> <unique>` (for example
  `` `E2E chair ${Date.now().toString(36)}` ``) so people can recognise and clean them up. Never edit, delete, or
  run jobs on a record the test did not create in the same test.
- **Read-only tests use existing data found at run time** with the `db` fixture. Write the query so it states the
  property the test needs, never a fixed id:

  ```ts
  const product = await db.one(`SELECT PRODUCT_ID, NAME FROM PRODUCT WHERE STATUS = 'DISCONTINUED' ORDER BY PRODUCT_ID`);
  ```

  Check the query first with `npm run sql -- "SELECT ..."`. The database is read-only; the harness refuses anything
  but a single SELECT.

- When the expected value depends on found data, derive it from the row in the test with the business rule in
  plain sight (`const expected = listPrice * (1 - percent / 100)`), rather than hard-coding today's value.

## Explore the live page

Confirm names and flows against QA with a probe: a throwaway test that prints the accessibility tree.
`tests/_probe*` is git-ignored.

```ts
// tests/_probe.spec.ts
import { test } from "../harness/fixtures.ts";

test("probe", async ({ page }) => {
  await page.goto("/products/new");
  await page.getByRole("combobox", { name: "Category" }).click();
  console.log(await page.locator("body").ariaSnapshot());
  await page.screenshot({ path: "test-results/probe.png", fullPage: true });
});
```

Run `npx playwright test tests/_probe.spec.ts --retries 0 --reporter=line`, read the output (and the PNG if layout
matters), then delete the probe. The guard applies to probes too; a blocked request in a probe means the flow needs
a write that is not in `allowedWrites`.

## Write the test

Put tests in `tests/<area>.spec.ts`, one file per screen or workflow area. Follow this shape:

```ts
import { expect, test } from "../harness/fixtures.ts";

test.describe("Discount rules", () => {
  test("an enabled rule lowers the final price after repricing", { tag: ["@pricing", "@PRC-142"] }, async ({ page }) => {
    const name = `E2E chair ${Date.now().toString(36)}`;
    const sku = `QAE-${String(Date.now()).slice(-3)}`; // this app's SKUs must match ABC-123

    await test.step("create a product at 200.00", async () => {
      await page.goto("/products/new");
      await page.getByLabel("SKU").fill(sku);
      await page.getByLabel("Name").fill(name);
      await page.getByRole("combobox", { name: "Category" }).click();
      await page.getByRole("option", { name: "Furniture" }).click();
      await page.getByLabel("List price").fill("200");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    });

    await test.step("add a 25% rule and reprice", async () => {
      await page.getByRole("button", { name: "Add rule" }).click();
      const dialog = page.getByRole("dialog", { name: "Add discount rule" });
      await dialog.getByLabel("Rule name").fill("E2E quarter off");
      await dialog.getByLabel("Discount %").fill("25");
      await dialog.getByRole("button", { name: "Save rule" }).click();
      await page.getByRole("button", { name: "Reprice" }).click();
    });

    await expect(page.getByRole("status")).toHaveText(/DONE/, { timeout: 30_000 });
    await expect(page.getByRole("definition").filter({ hasText: "$150.00" })).toBeVisible();
  });
});
```

Rules, each from a failure seen in practice:

- Import `test` and `expect` from `../harness/fixtures.ts`. Lint rejects `@playwright/test` in tests, because the
  harness fixtures are what block non-QA hosts and unlisted writes.
- **Name tests as business sentences** ("a discontinued product cannot be repriced"). Group steps with `test.step`
  in the user's words. Tag with the area and any ticket id the user gave.
- **Locators, in order:** `getByRole` with its accessible name; `getByLabel`; `getByText` for static content;
  `getByTestId` if the app has test ids. Scope to a container before repeating names: a dialog
  (`getByRole("dialog", { name })`), a table row (`getByRole("row", { name: /Bulk buyer/ })`), a section. Last
  resort: an Angular attribute such as `[formcontrolname="percent"]`, with a comment saying why. Never nth-child,
  XPath, `_ngcontent`/`mat-mdc-*` classes, or `.first()` to silence a strict-mode error.
- **Angular Material:** a `mat-select` is a `combobox`; its options render in an overlay outside the form, so pick
  them with `page.getByRole("option", { name })`. A `mat-slide-toggle` is a `switch`. A `mat-dialog` is a
  `dialog` named by its title. A snackbar is transient: assert it right after the action with `getByText`, or
  assert the lasting outcome instead. Icon-only buttons are named by their `aria-label`, or by the icon ligature
  text (`delete`) when the app omitted one.
- **Wait on what the user sees.** Use web-first assertions (`await expect(locator).toHave...`). For background work,
  raise that assertion's timeout. Use `page.waitForResponse` only when nothing visible changes. Lint rejects
  `waitForTimeout`, `networkidle`, `force: true`, `test.skip`, and conditionals in tests.
- **Assert the outcome, not the steps.** End every test with an assertion of the business result: the value shown,
  the row in the list, the error message. When persistence matters, `page.reload()` and assert again, or check the
  row with `db`.
- **Independent tests.** Each test passes alone, in any order, in parallel with the others, and on a second run
  (so no fixed names or SKUs that a first run already used).

## Verify

Run each new test until it is trustworthy, and finish with the suite checks:

```bash
npx playwright test tests/<file>.spec.ts -g "<test name>" --retries 0 --repeat-each 3
npm run check    # typecheck, lint (includes the Playwright rules), format, harness unit tests
```

- All three repeats must pass. A pass that needs a retry is a race; fix the wait, don't raise retries.
- Prove the main assertion can fail: change its expected value, run once, see the failure message name the
  business outcome, then restore it.
- If the app, not the test, is wrong (the source or requirement says one thing and QA does another), stop polishing.
  Leave the test asserting the correct behavior, and report the failure as a likely app bug with the evidence.
- Report what you added: file, test names, the data each test uses or creates, and anything you assumed.
