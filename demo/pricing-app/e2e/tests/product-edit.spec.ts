import { expect, test } from "../harness/fixtures.ts";
import { choose, createProduct, e2eName, usd } from "./support.ts";

test.describe("Edit product", { tag: "@products" }, () => {
  test("changes to name, category and list price persist after reload", async ({ page }) => {
    const product = await createProduct(page, { category: "Furniture", listPrice: 200 });
    const renamed = e2eName("renamed");

    await test.step("edit and save", async () => {
      await page.getByRole("link", { name: "Edit product" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Edit product");
      await expect(page.getByLabel("SKU")).toBeDisabled();
      await page.getByLabel("Name").fill(renamed);
      await choose(page, "Category", "Electronics");
      await page.getByLabel("List price").fill("250");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Product saved")).toBeVisible();
    });

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(renamed);
    // The final price stays until the product is repriced.
    await expect(page.getByRole("main")).toMatchAriaSnapshot(`
      - term: SKU
      - definition: ${product.sku}
      - term: Category
      - definition: Electronics
      - term: Status
      - definition: Active
      - term: List price
      - definition: ${JSON.stringify(usd(250))}
      - term: Final price
      - definition: ${JSON.stringify(usd(200))}
    `);
  });

  test("discontinuing a product shows it as discontinued in the list", async ({ page }) => {
    const product = await createProduct(page);
    await page.getByRole("link", { name: "Edit product" }).click();
    await choose(page, "Status", "Discontinued");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Product saved")).toBeVisible();

    await page.goto("/products");
    await page.getByLabel("Search").fill(product.sku);
    await expect(page.getByRole("row").filter({ hasText: product.sku }).getByRole("cell")).toHaveText([product.sku, product.name, "Furniture", usd(200), usd(200), "Discontinued"]);
  });

  test("cancel leaves the product unchanged", async ({ page }) => {
    const product = await createProduct(page);
    await page.getByRole("link", { name: "Edit product" }).click();
    await page.getByLabel("Name").fill(e2eName("not saved"));
    await page.getByLabel("List price").fill("999");
    await page.getByRole("link", { name: "Cancel" }).click();

    await expect(page).toHaveURL(new RegExp(`/products/${product.id}$`));
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(product.name);
    await expect(page.getByRole("main")).toMatchAriaSnapshot(`
      - term: List price
      - definition: ${JSON.stringify(usd(200))}
    `);
  });

  test("clearing the name shows the required message and does not save", async ({ page }) => {
    const product = await createProduct(page);
    await page.getByRole("link", { name: "Edit product" }).click();
    await expect(page.getByLabel("Name")).toHaveValue(product.name);
    await page.getByLabel("Name").clear();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Name is required")).toBeVisible();

    await page.goto(`/products/${product.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(product.name);
  });
});
