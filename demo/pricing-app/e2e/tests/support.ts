// Steps several specs share. Tests that change data create their own product with createProduct.
import type { Page } from "../harness/fixtures.ts";
import { expect, test } from "../harness/fixtures.ts";

export interface NewProduct {
  readonly category?: string;
  readonly listPrice?: number;
  readonly status?: "Active" | "Discontinued";
}

export interface CreatedProduct {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
}

/** A name people can recognise as test data, unique across parallel and repeated runs. */
export function e2eName(what: string): string {
  return `E2E ${what} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * A random SKU in the app's ABC-123 format. Seeded SKUs never start with Q, and 676,000 combinations make a clash
 * with an earlier E2E product unlikely; the server rejects one with "SKU already exists".
 * ponytail: no DB check for a free SKU, because reads during QA writes can fail with "database is locked" (see docs/app.md).
 */
export function randomSku(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const pick = (): string => letters.charAt(Math.floor(Math.random() * letters.length));
  return `Q${pick()}${pick()}-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
}

/** Prices as the app shows them (Angular's currency pipe in en-US). */
export function usd(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

/** Picks an option of a mat-select; its options render in an overlay outside the form. */
export async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Creates a product through the New product form and leaves the page on its detail screen. */
export async function createProduct(page: Page, input: NewProduct = {}): Promise<CreatedProduct> {
  return test.step("create a product", async () => {
    const sku = randomSku();
    const name = e2eName("product");
    await page.goto("/products/new");
    await page.getByLabel("SKU").fill(sku);
    await page.getByLabel("Name").fill(name);
    await choose(page, "Category", input.category ?? "Furniture");
    await page.getByLabel("List price").fill(String(input.listPrice ?? 200));
    await choose(page, "Status", input.status ?? "Active");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    const id = new URL(page.url()).pathname.split("/").at(-1) ?? "";
    return { id, sku, name };
  });
}

/** Adds a discount rule on the product detail screen. */
export async function addRule(page: Page, name: string, percent: number): Promise<void> {
  await test.step(`add the rule ${name} at ${String(percent)}%`, async () => {
    await page.getByRole("button", { name: "Add rule" }).click();
    const dialog = page.getByRole("dialog", { name: "Add discount rule" });
    await dialog.getByLabel("Rule name").fill(name);
    await dialog.getByLabel("Discount %").fill(String(percent));
    await dialog.getByRole("button", { name: "Save rule" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible();
  });
}
