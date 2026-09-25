import { expect, test } from "../harness/fixtures.ts";
import { choose, usd } from "./support.ts";

// Seeded products only: E2E products are renamed and repriced by other tests while this runs.
const seeded = "p.NAME NOT LIKE 'E2E%'";

test.describe("Product list", { tag: "@products" }, () => {
  test("shows each product with its SKU, category, prices and status", async ({ page, db }) => {
    const p = await db.one(
      `SELECT p.SKU, p.NAME, c.NAME AS CATEGORY, p.LIST_PRICE, p.FINAL_PRICE, CASE p.STATUS WHEN 'ACTIVE' THEN 'Active' ELSE 'Discontinued' END AS STATUS FROM PRODUCT p JOIN CATEGORY c ON c.CATEGORY_ID = p.CATEGORY_ID
       WHERE ${seeded} AND p.FINAL_PRICE < p.LIST_PRICE ORDER BY p.NAME`
    );
    await page.goto("/products");
    const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: String(p["NAME"]), exact: true }) });
    await expect(row.getByRole("cell")).toHaveText([String(p["SKU"]), String(p["NAME"]), String(p["CATEGORY"]), usd(Number(p["LIST_PRICE"])), usd(Number(p["FINAL_PRICE"])), String(p["STATUS"])]);
  });

  test("searching by SKU leaves only that product", async ({ page, db }) => {
    const p = await db.one(`SELECT p.SKU, p.NAME FROM PRODUCT p WHERE ${seeded} ORDER BY p.SKU`);
    await page.goto("/products");
    await page.getByLabel("Search").fill(String(p["SKU"]).toLowerCase());
    await expect(page.getByRole("link", { name: String(p["NAME"]), exact: true })).toBeVisible();
    await expect(page.getByText("1 products", { exact: true })).toBeVisible();
  });

  test("searching by name shows exactly the products whose name or SKU contains it", async ({ page, db }) => {
    const p = await db.one(`SELECT p.NAME FROM PRODUCT p WHERE ${seeded} ORDER BY p.NAME`);
    const term = String(p["NAME"]).toUpperCase();
    const { N } = await db.one(`SELECT count(*) AS N FROM PRODUCT WHERE lower(NAME) LIKE lower(?) OR lower(SKU) LIKE lower(?)`, [`%${term}%`, `%${term}%`]);
    await page.goto("/products");
    await page.getByLabel("Search").fill(term);
    await expect(page.getByRole("link", { name: String(p["NAME"]), exact: true })).toBeVisible();
    await expect(page.getByText(`${String(N)} products`, { exact: true })).toBeVisible();
  });

  test("the category filter shows only products in that category", async ({ page, db }) => {
    const p = await db.one(`SELECT p.NAME, c.NAME AS CATEGORY FROM PRODUCT p JOIN CATEGORY c ON c.CATEGORY_ID = p.CATEGORY_ID WHERE ${seeded} ORDER BY c.NAME, p.NAME`);
    const other = await db.one(`SELECT c.NAME FROM CATEGORY c JOIN PRODUCT p ON p.CATEGORY_ID = c.CATEGORY_ID WHERE c.NAME <> ? ORDER BY c.NAME`, [p["CATEGORY"]]);
    await page.goto("/products");
    await expect(page.getByRole("cell", { name: String(other["NAME"]), exact: true })).not.toHaveCount(0);

    await choose(page, "Category", String(p["CATEGORY"]));

    await expect(page.getByRole("link", { name: String(p["NAME"]), exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: String(other["NAME"]), exact: true })).toHaveCount(0);
  });

  test("the status filter shows only discontinued products", async ({ page, db }) => {
    const p = await db.one(`SELECT p.NAME FROM PRODUCT p WHERE ${seeded} AND p.STATUS = 'DISCONTINUED' ORDER BY p.NAME`);
    await page.goto("/products");
    await choose(page, "Status", "Discontinued");
    await expect(page.getByRole("link", { name: String(p["NAME"]), exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Active", exact: true })).toHaveCount(0);
  });

  test("a search that matches nothing shows the empty state", async ({ page }) => {
    await page.goto("/products");
    await page.getByLabel("Search").fill("no product is called this zq9");
    await expect(page.getByText("No products match your filters.")).toBeVisible();
    await expect(page.getByText("0 products", { exact: true })).toBeVisible();
  });
});
