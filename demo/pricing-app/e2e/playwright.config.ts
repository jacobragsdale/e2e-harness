// This app's harness settings. App-owned: the e2e-setup skill fills it in, and `copier update` leaves it alone.
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import type { HarnessOptions } from "./harness/fixtures.ts";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig<HarnessOptions>({
  testDir: "tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2, // QA is shared with people; raise it only if QA copes.
  retries: 1, // A pass on retry is reported as flaky; e2e-triage treats flaky as a failure to fix.
  forbidOnly: true,
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL: process.env["E2E_BASE_URL"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    qaMarkers: ["qa"],
    readHosts: ["fonts.gstatic.com"], // Google Fonts files (Roboto, Material Symbols) from src/index.html; the build inlines the CSS
    allowedWrites: [
      "POST /api/products", // create a product
      "PUT /api/products/*", // edit a product (tests edit only products they created)
      "POST /api/products/*/rules", // add a discount rule
      "PUT /api/rules/*", // edit or toggle a rule
      "DELETE /api/rules/*", // delete one rule (tests delete only rules they created)
      "POST /api/products/*/reprice" // start a reprice job for one product
    ],
    failOnPageError: true
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
