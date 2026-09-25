import { expect, test } from "../harness/fixtures.ts";

test.describe("Smoke", { tag: "@smoke" }, () => {
  test("the root URL opens the product list", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/products$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Products");
  });

  test("the new product form opens", async ({ page }) => {
    await page.goto("/products/new");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("New product");
  });

  test("the reprice jobs list opens", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reprice jobs");
  });

  test("the toolbar links reach products and reprice jobs", async ({ page }) => {
    await page.goto("/products");
    const nav = page.getByRole("navigation");
    await nav.getByRole("link", { name: "Reprice jobs" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reprice jobs");
    await nav.getByRole("link", { name: "Products" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Products");
  });

  test("an unknown URL shows the not-found page", async ({ page }) => {
    await page.goto("/no-such-page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
    await page.getByRole("link", { name: "Back to products" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Products");
  });
});
