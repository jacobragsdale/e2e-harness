import { expect, test } from "../harness/fixtures.ts";
import { addRule, createProduct } from "./support.ts";

test.describe("Discount rules", { tag: "@rules" }, () => {
  test("an added rule is listed, enabled, after reload", async ({ page }) => {
    await createProduct(page);
    await addRule(page, "E2E spring sale", 15);
    await expect(page.getByText("Rule added. Reprice to apply it.")).toBeVisible();

    await page.reload();
    const row = page.getByRole("row").filter({ hasText: "E2E spring sale" });
    await expect(row).toContainText("15%");
    await expect(row.getByRole("switch")).toBeChecked();
  });

  test("editing a rule changes its name and percent", async ({ page }) => {
    await createProduct(page);
    await addRule(page, "E2E before", 10);

    await page.getByRole("row").filter({ hasText: "E2E before" }).getByRole("button", { name: "Edit rule" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit discount rule" });
    await expect(dialog.getByLabel("Rule name")).toHaveValue("E2E before");
    await dialog.getByLabel("Rule name").fill("E2E after");
    await dialog.getByLabel("Discount %").fill("35");
    await dialog.getByRole("button", { name: "Save rule" }).click();
    await expect(page.getByText("Rule saved. Reprice to apply it.")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: "E2E after" })).toContainText("35%");
    await expect(page.getByRole("row").filter({ hasText: "E2E before" })).toHaveCount(0);
  });

  test("cancelling the rule dialog adds nothing", async ({ page }) => {
    await createProduct(page);
    await page.getByRole("button", { name: "Add rule" }).click();
    const dialog = page.getByRole("dialog", { name: "Add discount rule" });
    await dialog.getByLabel("Rule name").fill("E2E never saved");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText("No discount rules.")).toBeVisible();
  });

  test("the rule dialog requires a name and a percent up to 90", async ({ page }) => {
    await createProduct(page);
    await page.getByRole("button", { name: "Add rule" }).click();
    const dialog = page.getByRole("dialog", { name: "Add discount rule" });
    await dialog.getByLabel("Discount %").fill("95");
    await dialog.getByRole("button", { name: "Save rule" }).click();

    await expect(dialog.getByText("Name is required")).toBeVisible();
    await expect(dialog.getByText("Percent must be between 0 and 90")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("No discount rules.")).toBeVisible();
  });

  test("turning a rule off persists after reload", async ({ page }) => {
    await createProduct(page);
    await addRule(page, "E2E toggled", 20);
    const toggle = page.getByRole("row").filter({ hasText: "E2E toggled" }).getByRole("switch");

    await toggle.click();
    await expect(page.getByText("Rule disabled. Reprice to apply it.")).toBeVisible();
    await page.reload();
    await expect(toggle).not.toBeChecked();

    await toggle.click();
    await expect(page.getByText("Rule enabled. Reprice to apply it.")).toBeVisible();
    await page.reload();
    await expect(toggle).toBeChecked();
  });

  test("a deleted rule is gone after confirming", async ({ page }) => {
    await createProduct(page);
    await addRule(page, "E2E doomed", 5);

    // The delete button has no accessible name (app a11y gap), only its icon ligature text.
    await page.getByRole("row").filter({ hasText: "E2E doomed" }).getByRole("button").filter({ hasText: "delete" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete rule" });
    await expect(dialog).toContainText("Delete the rule “E2E doomed”? This cannot be undone.");
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Rule deleted. Reprice to apply it.")).toBeVisible();

    await page.reload();
    await expect(page.getByText("No discount rules.")).toBeVisible();
  });

  test("cancelling the delete confirmation keeps the rule", async ({ page }) => {
    await createProduct(page);
    await addRule(page, "E2E kept", 5);

    await page.getByRole("row").filter({ hasText: "E2E kept" }).getByRole("button").filter({ hasText: "delete" }).click();
    await page.getByRole("dialog", { name: "Delete rule" }).getByRole("button", { name: "Cancel" }).click();

    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: "E2E kept" })).toContainText("5%");
  });
});
