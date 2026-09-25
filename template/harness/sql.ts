// Run one read-only query against the QA database and print the rows. For finding test data while writing tests.
// Usage: npm run sql -- "SELECT ..." [--json]
import config from "../playwright.config.ts";
import { openDb } from "./db.ts";

const args = process.argv.slice(2);
const sql = args.find((a) => !a.startsWith("--"));
if (sql === undefined) {
  console.error('Usage: npm run sql -- "SELECT ..." [--json]');
  process.exit(2);
}
const db = await openDb(config.use?.qaMarkers ?? []);
try {
  const rows = await db.query(sql);
  if (args.includes("--json")) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.table(rows);
  }
  console.log(`${String(rows.length)} row(s)${rows.length === 1000 ? " (capped at 1000)" : ""}`);
} finally {
  await db.close();
}
