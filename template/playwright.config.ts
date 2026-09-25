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
  use: { baseURL: process.env["E2E_BASE_URL"], trace: "retain-on-failure", screenshot: "only-on-failure", qaMarkers: ["qa"], readHosts: [], allowedWrites: [], failOnPageError: true },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
