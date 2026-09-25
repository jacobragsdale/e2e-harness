// Read-only access to the QA database, for finding test data. Three layers keep it read-only:
// the SQL must be one SELECT (or WITH) statement, the database runs it in a read-only or rolled-back
// transaction, and E2E_DB_URL should name an account with SELECT grants only.
import { existsSync } from "node:fs";
import { requireQaUrl } from "./guard.ts";

export type Row = Readonly<Record<string, unknown>>;

export interface Db {
  /** Rows for a SELECT. Bind values with `?` (sqlite), `:1` (Oracle) or `@p1` (SQL Server). */
  query(sql: string, params?: readonly unknown[]): Promise<readonly Row[]>;
  /** The first row, or an error naming the query when nothing matches: the QA data no longer fits the test. */
  one(sql: string, params?: readonly unknown[]): Promise<Row>;
  close(): Promise<void>;
}

const maxRows = 1000;

/** Throws unless the text is a single SELECT or WITH statement. */
export function assertReadOnlySql(sql: string): void {
  const code = sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim()
    .replace(/;\s*$/, "");
  if (code.includes(";")) {
    throw new Error("Only one statement per query.");
  }
  if (!/^(select|with)\b/i.test(code)) {
    throw new Error(`Only SELECT queries are allowed, got: ${sql.slice(0, 60)}`);
  }
}

/** Connects to E2E_DB_URL: oracle://user@host:1521/service, mssql://user@host:1433/database, or sqlite:///abs/path.db. */
export async function openDb(qaMarkers: readonly string[], url = process.env["E2E_DB_URL"], password = process.env["E2E_DB_PASSWORD"] ?? ""): Promise<Db> {
  const target = requireQaUrl(url, qaMarkers, "E2E_DB_URL");
  const connect = drivers[target.protocol];
  if (connect === undefined) {
    throw new Error(`E2E_DB_URL scheme ${target.protocol} is not one of ${Object.keys(drivers).join(", ")}`);
  }
  const run = await connect(target, password);
  const query = async (sql: string, params: readonly unknown[] = []): Promise<readonly Row[]> => {
    assertReadOnlySql(sql);
    return run.query(sql, params);
  };
  return {
    query,
    one: async (sql, params) => {
      const [row] = await query(sql, params);
      if (row === undefined) {
        throw new Error(`No QA data matches this query; the data changed or the query is wrong:\n${sql}`);
      }
      return row;
    },
    close: async () => run.close()
  };
}

interface Connection {
  query(sql: string, params: readonly unknown[]): Promise<readonly Row[]>;
  close(): Promise<void>;
}

const drivers: Readonly<Record<string, (url: URL, password: string) => Promise<Connection>>> = {
  "sqlite:": async (url) => {
    const path = decodeURIComponent(url.pathname);
    if (!existsSync(path)) {
      throw new Error(`No SQLite database at ${path}`);
    }
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(path, { readOnly: true });
    return {
      query: async (sql, params) =>
        Promise.resolve(
          db
            .prepare(sql)
            .all(...params.map(toSqlite))
            .slice(0, maxRows)
            .map((row) => ({ ...row }))
        ),
      close: async () => {
        db.close();
        return Promise.resolve();
      }
    };
  },
  "oracle:": async (url, password) => {
    const oracledb = (await import("oracledb")).default;
    const conn = await oracledb.getConnection({ user: decodeURIComponent(url.username), password, connectString: `${url.host}${url.pathname}` });
    return {
      query: async (sql, params) => {
        try {
          await conn.execute("SET TRANSACTION READ ONLY");
          const result = await conn.execute<Record<string, unknown>>(sql, [...params], { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows });
          return result.rows ?? [];
        } finally {
          await conn.rollback();
        }
      },
      close: async () => conn.close()
    };
  },
  "mssql:": async (url, password) => {
    const mssql = (await import("mssql")).default;
    const pool = await mssql.connect({
      server: url.hostname,
      port: Number(url.port === "" ? "1433" : url.port),
      database: decodeURIComponent(url.pathname.slice(1)),
      user: decodeURIComponent(url.username),
      password,
      options: { trustServerCertificate: url.searchParams.get("trustServerCertificate") === "true" }
    });
    return {
      query: async (sql, params) => {
        // SQL Server has no read-only transaction; whatever the statement did is rolled back.
        const tx = new mssql.Transaction(pool);
        await tx.begin();
        try {
          const request = new mssql.Request(tx);
          for (const [i, value] of params.entries()) {
            request.input(`p${String(i + 1)}`, value);
          }
          const result = await request.query<Record<string, unknown>>(sql);
          // Typed as always present, but undefined for a statement that returns no rows (SELECT ... INTO).
          const rows: unknown = result.recordset;
          return Array.isArray(rows) ? result.recordset.slice(0, maxRows) : [];
        } finally {
          await tx.rollback();
        }
      },
      close: async () => pool.close()
    };
  }
};

function toSqlite(value: unknown): string | number | bigint | null {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  throw new Error(`Cannot bind ${typeof value} in a sqlite query`);
}
