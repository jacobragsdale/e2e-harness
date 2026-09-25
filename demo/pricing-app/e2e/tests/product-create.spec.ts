import { expect, test } from "../harness/fixtures.ts";
import { choose, e2eName, randomSku, usd } from "./support.ts";

test.describe("Create product", { tag: "@products" }, () => {
  test("a valid product is saved, shown, and listed at its list price", async ({ page }) => {
    const sku = randomSku();
    const name = e2eName("lamp");

    await test.step("fill and save the New product form", async () => {
      await page.goto("/products");
      await page.getByRole("link", { name: "New product" }).click();
      await page.getByLabel("SKU").fill(sku);
      await page.getByLabel("Name").fill(name);
      await choose(page, "Category", "Stationery");
      await page.getByLabel("List price").fill("1234.5");
      await page.getByRole("button", { name: "Save" }).click();
    });

    await expect(page.getByText(`Product ${sku} created`)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    // A new product has no rules, so its final price starts at the list price.
    await expect(page.getByRole("main")).toMatchAriaSnapshot(`
      - term: SKU
      - definition: ${sku}
      - term: Category
      - definition: Stationery
      - term: Status
      - definition: Active
      - term: List price
      - definition: ${JSON.stringify(usd(1234.5))}
      - term: Final price
      - definition: ${JSON.stringify(usd(1234.5))}
    `);
    await expect(page.getByText("No discount rules.")).toBeVisible();

    await page.goto("/products");
    await page.getByLabel("Search").fill(sku);
    await expect(page.getByRole("row").filter({ hasText: sku }).getByRole("cell")).toHaveText([sku, name, "Stationery", usd(1234.5), usd(1234.5), "Active"]);
  });

  test("saving an empty form shows a message on every required field", async ({ page }) => {
    await page.goto("/products/new");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("SKU must look like ABC-123")).toBeVisible();
    await expect(page.getByText("Name is required")).toBeVisible();
    await expect(page.getByText("Category is required")).toBeVisible();
    await expect(page.getByText("List price must be greater than 0")).toBeVisible();
    await expect(page).toHaveURL(/\/products\/new$/);
  });

  test("a SKU not in the ABC-123 format is rejected before saving", async ({ page }) => {
    await page.goto("/products/new");
    await page.getByLabel("SKU").fill("abc-12");
    await page.getByLabel("Name").fill(e2eName("bad sku"));
    await choose(page, "Category", "Furniture");
    await page.getByLabel("List price").fill("10");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("SKU must look like ABC-123")).toBeVisible();
    await expect(page).toHaveURL(/\/products\/new$/);
  });

  test("a SKU that another product uses is rejected by the server", async ({ page, db }) => {
    const existing = await db.one("SELECT SKU FROM PRODUCT ORDER BY SKU");
    await page.goto("/products/new");
    await page.getByLabel("SKU").fill(String(existing["SKU"]));
    await page.getByLabel("Name").fill(e2eName("duplicate"));
    await choose(page, "Category", "Furniture");
    await page.getByLabel("List price").fill("10");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("SKU already exists")).toBeVisible();
    await expect(page).toHaveURL(/\/products\/new$/);
  });

  test("cancel returns to the product list", async ({ page }) => {
    await page.goto("/products/new");
    await page.getByLabel("Name").fill(e2eName("abandoned"));
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Products");
  });
});
