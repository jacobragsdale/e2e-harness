import { expect, test } from "../harness/fixtures.ts";
import { addRule, createProduct, usd } from "./support.ts";

// Repricing sets the final price to the list price less the sum of enabled rules, capped at 90%, rounded to cents.
function repriced(listPrice: number, enabledPercents: readonly number[]): number {
  const percent = Math.min(
    enabledPercents.reduce((sum, p) => sum + p, 0),
    90
  );
  return Math.round(listPrice * (100 - percent)) / 100;
}

test.describe("Reprice", { tag: "@reprice" }, () => {
  test("repricing applies the enabled rules to the final price", async ({ page }) => {
    const product = await createProduct(page, { listPrice: 200 });
    await addRule(page, "E2E quarter off", 25);
    await addRule(page, "E2E switched off", 10);
    await page.getByRole("row").filter({ hasText: "E2E switched off" }).getByRole("switch").click();
    await expect(page.getByText("Rule disabled. Reprice to apply it.")).toBeVisible();
    const expected = repriced(200, [25]);

    await page.getByRole("button", { name: "Reprice" }).click();

    await expect(page.getByRole("status")).toHaveText(/^Reprice job #\d+: DONE$/, { timeout: 15_000 });
    await expect(page.getByText(`Repriced: ${usd(200)} → ${usd(expected)}`)).toBeVisible();
    await expect(page.getByRole("main")).toMatchAriaSnapshot(`
      - term: Final price
      - definition: ${JSON.stringify(usd(expected))}
    `);

    await test.step("the job is listed with its old and new price", async () => {
      await page.getByRole("navigation").getByRole("link", { name: "Reprice jobs" }).click();
      const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: product.id, exact: true }) });
      await expect(row.getByRole("cell")).toHaveText([/^#\d+$/, product.id, "DONE", usd(200), usd(expected), /\d{4}/]);
    });
  });

  test("rules adding up to more than 90% are capped at 90%", async ({ page }) => {
    await createProduct(page, { listPrice: 200 });
    await addRule(page, "E2E big", 60);
    await addRule(page, "E2E bigger", 50);

    await page.getByRole("button", { name: "Reprice" }).click();

    await expect(page.getByRole("status")).toHaveText(/DONE$/, { timeout: 15_000 });
    await expect(page.getByRole("main")).toMatchAriaSnapshot(`
      - term: Final price
      - definition: ${JSON.stringify(usd(repriced(200, [60, 50])))}
    `);
  });

  test("repricing a discontinued product fails and keeps its price", async ({ page }) => {
    await createProduct(page, { listPrice: 80, status: "Discontinued" });
    await addRule(page, "E2E ignored", 50);

    await page.getByRole("button", { name: "Reprice" }).click();

    await expect(page.getByRole("status")).toHaveText(/^Reprice job #\d+: FAILED$/, { timeout: 15_000 });
    await expect(page.getByText("Reprice failed: Product is discontinued")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("main")).toMatchAriaSnapshot(`
      - term: Final price
      - definition: ${JSON.stringify(usd(80))}
    `);
  });
});
