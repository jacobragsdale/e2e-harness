import { expect, test } from "../harness/fixtures.ts";
import { addRule, createProduct, usd } from "./support.ts";
import type { Page } from "../harness/fixtures.ts";

// Repricing sets the final price to the list price less the sum of enabled rules, capped at 90%, rounded to cents.
function repriced(listPrice: number, enabledPercents: readonly number[]): number {
  const percent = Math.min(
    enabledPercents.reduce((sum, p) => sum + p, 0),
    90
  );
  return Math.round(listPrice * (100 - percent)) / 100;
}

/** Reprices and waits for the job that moves the final price from `from` to `to`. */
async function reprice(page: Page, from: number, to: number): Promise<void> {
  await test.step(`reprice from ${usd(from)} to ${usd(to)}`, async () => {
    await page.getByRole("button", { name: "Reprice" }).click();
    await expect(page.getByText(`Repriced: ${usd(from)} → ${usd(to)}`)).toBeVisible({ timeout: 15_000 });
  });
}

async function expectPrices(page: Page, listPrice: number, finalPrice: number): Promise<void> {
  await expect(page.getByRole("main")).toMatchAriaSnapshot(`
    - term: List price
    - definition: ${JSON.stringify(usd(listPrice))}
    - term: Final price
    - definition: ${JSON.stringify(usd(finalPrice))}
  `);
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

  test("a switched-off rule no longer affects the price when the product is repriced", async ({ page }) => {
    await createProduct(page, { listPrice: 200 });
    await addRule(page, "E2E promo", 30);
    await reprice(page, 200, repriced(200, [30]));

    await page.getByRole("row").filter({ hasText: "E2E promo" }).getByRole("switch").click();
    await expect(page.getByText("Rule disabled. Reprice to apply it.")).toBeVisible();
    await reprice(page, repriced(200, [30]), repriced(200, []));

    await page.reload();
    await expectPrices(page, 200, 200);
  });

  test("changing the list price keeps the final price until the product is repriced", async ({ page }) => {
    await createProduct(page, { listPrice: 200 });
    await addRule(page, "E2E quarter off", 25);
    await reprice(page, 200, repriced(200, [25]));

    await test.step("change the list price to 300", async () => {
      await page.getByRole("link", { name: "Edit product" }).click();
      // The form fills itself once the product loads, overwriting anything typed before that.
      await expect(page.getByLabel("List price")).toHaveValue("200");
      await page.getByLabel("List price").fill("300");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Product saved")).toBeVisible();
    });

    await page.reload();
    await expectPrices(page, 300, repriced(200, [25]));

    await reprice(page, repriced(200, [25]), repriced(300, [25]));
    await page.reload();
    await expectPrices(page, 300, repriced(300, [25]));
  });
});
