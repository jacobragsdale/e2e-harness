import { expect, test } from "../harness/fixtures.ts";
import { usd } from "./support.ts";

test.describe("Product detail", { tag: "@products" }, () => {
  test("opening a product from the list shows its details and discount rules", async ({ page, db }) => {
    const p = await db.one(
      `SELECT p.PRODUCT_ID, p.SKU, p.NAME, c.NAME AS CATEGORY, p.LIST_PRICE, p.FINAL_PRICE, CASE p.STATUS WHEN 'ACTIVE' THEN 'Active' ELSE 'Discontinued' END AS STATUS, r.NAME AS RULE, r.PERCENT
       FROM PRODUCT p JOIN CATEGORY c ON c.CATEGORY_ID = p.CATEGORY_ID JOIN DISCOUNT_RULE r ON r.PRODUCT_ID = p.PRODUCT_ID
       WHERE p.NAME NOT LIKE 'E2E%' ORDER BY p.NAME, r.CREATED_AT, r.RULE_ID`
    );
    await page.goto("/products");
    await page.getByRole("link", { name: String(p["NAME"]), exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/products/${String(p["PRODUCT_ID"])}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(String(p["NAME"]));
    await expect(page.getByRole("main")).toMatchAriaSnapshot(`
      - term: SKU
      - definition: ${JSON.stringify(p["SKU"])}
      - term: Category
      - definition: ${JSON.stringify(p["CATEGORY"])}
      - term: Status
      - definition: ${String(p["STATUS"])}
      - term: List price
      - definition: ${JSON.stringify(usd(Number(p["LIST_PRICE"])))}
      - term: Final price
      - definition: ${JSON.stringify(usd(Number(p["FINAL_PRICE"])))}
    `);
    await expect(page.getByRole("row").filter({ hasText: String(p["RULE"]) })).toContainText(`${String(p["PERCENT"])}%`);
  });

  test("an unknown product id shows the not-found state", async ({ page }) => {
    await page.goto("/products/P-DOES-NOT-EXIST");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Product not found");
    await page.getByRole("link", { name: "Back to products" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Products");
  });
});
