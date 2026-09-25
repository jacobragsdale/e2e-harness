import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { assertReadOnlySql, openDb } from "./db.ts";

test("assertReadOnlySql allows one SELECT or WITH statement", () => {
  assertReadOnlySql("SELECT 1");
  assertReadOnlySql("  with x as (select 1) select * from x;");
  assertReadOnlySql("SELECT ';DROP TABLE t' AS s -- comment; delete\nFROM t");
  assert.throws(() => assertReadOnlySql("DELETE FROM t"), /Only SELECT/);
  assert.throws(() => assertReadOnlySql("/* SELECT */ UPDATE t SET a = 1"), /Only SELECT/);
  assert.throws(() => assertReadOnlySql("SELECT 1; DELETE FROM t"), /one statement/);
});

test("openDb reads sqlite read-only and refuses non-QA URLs", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "e2e-")), "qa.sqlite");
  const seed = new DatabaseSync(path);
  seed.exec("CREATE TABLE T (ID INTEGER, NAME TEXT); INSERT INTO T VALUES (1, 'a'), (2, 'b');");
  seed.close();

  const db = await openDb(["qa"], `sqlite://${path}`);
  try {
    assert.deepEqual(await db.one("SELECT NAME FROM T WHERE ID = ?", [2]), { NAME: "b" });
    await assert.rejects(db.one("SELECT NAME FROM T WHERE ID = 3"), /No QA data matches/);
    // A write that slips past the SQL check still fails: the connection itself is read-only.
    await assert.rejects(db.query("WITH x AS (SELECT 1) INSERT INTO T SELECT 3, 'c' FROM x"), /readonly/);
  } finally {
    await db.close();
  }
  await assert.rejects(openDb(["qa"], "sqlite:///tmp/prod.sqlite"), /does not look like QA/);
});
