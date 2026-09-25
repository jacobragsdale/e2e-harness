// Every test imports `test` and `expect` from here, never from @playwright/test (ESLint enforces it).
// The fixtures below run for every test and are what keeps a run safe in a shared QA environment.
import { test as base, expect } from "@playwright/test";
import type { Db } from "./db.ts";
import { openDb } from "./db.ts";
import { blockReason, requireQaUrl } from "./guard.ts";

export { expect };

/** Settings each app gives in playwright.config.ts under `use`. */
export interface HarnessOptions {
  /** baseURL and E2E_DB_URL must contain one of these (case-insensitive), or nothing runs. */
  readonly qaMarkers: readonly string[];
  /** Hosts other than the app that pages may read from. See RequestRules in guard.ts. */
  readonly readHosts: readonly string[];
  /** Non-GET requests the app may send, as "METHOD /path/*". Anything else is aborted and fails the test. */
  readonly allowedWrites: readonly string[];
  /** Fail a test when the page throws an uncaught exception. */
  readonly failOnPageError: boolean;
}

interface TestFixtures {
  readonly guard: undefined;
}

interface WorkerFixtures {
  /** Read-only QA database, for finding test data. Connected on first use in each worker. */
  readonly db: Db;
}

export const test = base.extend<TestFixtures & Omit<HarnessOptions, "qaMarkers">, WorkerFixtures & Pick<HarnessOptions, "qaMarkers">>({
  qaMarkers: [["qa"], { option: true, scope: "worker" }],
  readHosts: [[], { option: true }],
  allowedWrites: [[], { option: true }],
  failOnPageError: [true, { option: true }],

  // Service workers' requests skip Playwright routing, so the guard could not see them.
  serviceWorkers: "block",

  // Requests from Playwright's API client skip the browser and the guard. Tests drive the UI.
  request: async ({ request }, use) => {
    await use(
      new Proxy(request, {
        get: () => {
          throw new Error("The request fixture is disabled: API calls would bypass the network guard. Drive the UI, and find data with the db fixture.");
        }
      })
    );
  },

  guard: [
    async ({ context, page, baseURL, qaMarkers, readHosts, allowedWrites, failOnPageError }, use, testInfo) => {
      const app = requireQaUrl(baseURL, qaMarkers, "baseURL (E2E_BASE_URL)");
      const rules = { appHost: app.host, readHosts, allowedWrites };
      const problems: string[] = [];
      await context.route("**/*", async (route, request) => {
        const reason = blockReason(request.method(), request.url(), rules);
        if (reason === undefined) {
          await route.fallback();
          return;
        }
        problems.push(`Blocked ${request.method()} ${request.url()}: ${reason}`);
        await route.abort("blockedbyclient");
      });
      page.on("pageerror", (error) => {
        if (failOnPageError) {
          problems.push(`Uncaught page error: ${error.message}`);
        }
      });
      await use(undefined);
      if (problems.length > 0) {
        await testInfo.attach("guard", { body: problems.join("\n"), contentType: "text/plain" });
        throw new Error(`Harness guard:\n${problems.join("\n")}`);
      }
    },
    { auto: true }
  ],

  db: [
    async ({ qaMarkers }, use) => {
      const db = await openDb(qaMarkers);
      await use(db);
      await db.close();
    },
    { scope: "worker" }
  ]
});
