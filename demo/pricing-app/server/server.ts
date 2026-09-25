// The pricing app's API and static host. Run: node server/server.ts [--init]
// --init recreates the SQLite database with seed data; --no-listen exits after that. Env: PORT (4300), DB_PATH (server/pricing-qa.sqlite).
import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

const root = join(import.meta.dirname, '..');
const dbPath = process.env['DB_PATH'] ?? join(root, 'server', 'pricing-qa.sqlite');
const port = Number(process.env['PORT'] ?? '4300');
const staticDir = join(root, 'dist', 'pricing-app', 'browser');
const maxDiscount = 90;

if (process.argv.includes('--init') && existsSync(dbPath)) {
  rmSync(dbPath);
}
const fresh = !existsSync(dbPath);
const db = new DatabaseSync(dbPath);
if (fresh) {
  seed();
}

// ---------- schemas: rows out of SQLite and bodies in from HTTP are both boundaries ----------

const categoryRow = z.strictObject({ CATEGORY_ID: z.string(), NAME: z.string() });
const productRow = z.strictObject({
  PRODUCT_ID: z.string(),
  SKU: z.string(),
  NAME: z.string(),
  CATEGORY_ID: z.string(),
  CATEGORY_NAME: z.string(),
  LIST_PRICE: z.number(),
  FINAL_PRICE: z.number(),
  STATUS: z.enum(['ACTIVE', 'DISCONTINUED']),
  UPDATED_AT: z.string()
});
const ruleRow = z.strictObject({ RULE_ID: z.string(), PRODUCT_ID: z.string(), NAME: z.string(), PERCENT: z.number(), ENABLED: z.number(), CREATED_AT: z.string() });
const jobRow = z.strictObject({
  JOB_ID: z.number(),
  PRODUCT_ID: z.string(),
  STATUS: z.enum(['QUEUED', 'RUNNING', 'DONE', 'FAILED']),
  OLD_PRICE: z.number().nullable(),
  NEW_PRICE: z.number().nullable(),
  ERROR: z.string().nullable(),
  REQUESTED_AT: z.string(),
  FINISHED_AT: z.string().nullable()
});

const productBody = z.strictObject({
  sku: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}-\d{3}$/, 'SKU must look like ABC-123'),
  name: z.string().trim().min(1, 'Name is required').max(80),
  categoryId: z.string().min(1, 'Category is required'),
  listPrice: z.number().positive('List price must be greater than 0').max(1_000_000),
  status: z.enum(['ACTIVE', 'DISCONTINUED']).default('ACTIVE')
});
const productUpdate = productBody.omit({ sku: true });
const ruleBody = z.strictObject({
  name: z.string().trim().min(1, 'Name is required').max(60),
  percent: z.number().gt(0, 'Percent must be between 0 and 90').max(maxDiscount, 'Percent must be between 0 and 90'),
  enabled: z.boolean().default(true)
});
const ruleUpdate = ruleBody.partial();

type Category = Readonly<{ id: string; name: string }>;
type Product = Readonly<{
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  categoryName: string;
  listPrice: number;
  finalPrice: number;
  status: 'ACTIVE' | 'DISCONTINUED';
  updatedAt: string;
}>;
type Rule = Readonly<{ id: string; productId: string; name: string; percent: number; enabled: boolean; createdAt: string }>;
type Job = Readonly<{
  id: number;
  productId: string;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
  oldPrice: number | null;
  newPrice: number | null;
  error: string | null;
  requestedAt: string;
  finishedAt: string | null;
}>;

function toCategory(row: z.infer<typeof categoryRow>): Category {
  return { id: row.CATEGORY_ID, name: row.NAME };
}

function toProduct(row: z.infer<typeof productRow>): Product {
  return {
    id: row.PRODUCT_ID,
    sku: row.SKU,
    name: row.NAME,
    categoryId: row.CATEGORY_ID,
    categoryName: row.CATEGORY_NAME,
    listPrice: row.LIST_PRICE,
    finalPrice: row.FINAL_PRICE,
    status: row.STATUS,
    updatedAt: row.UPDATED_AT
  };
}

function toRule(row: z.infer<typeof ruleRow>): Rule {
  return { id: row.RULE_ID, productId: row.PRODUCT_ID, name: row.NAME, percent: row.PERCENT, enabled: row.ENABLED === 1, createdAt: row.CREATED_AT };
}

function toJob(row: z.infer<typeof jobRow>): Job {
  return {
    id: row.JOB_ID,
    productId: row.PRODUCT_ID,
    status: row.STATUS,
    oldPrice: row.OLD_PRICE,
    newPrice: row.NEW_PRICE,
    error: row.ERROR,
    requestedAt: row.REQUESTED_AT,
    finishedAt: row.FINISHED_AT
  };
}

// ---------- queries ----------

const productSelect = `SELECT p.PRODUCT_ID, p.SKU, p.NAME, p.CATEGORY_ID, c.NAME AS CATEGORY_NAME, p.LIST_PRICE, p.FINAL_PRICE, p.STATUS, p.UPDATED_AT
  FROM PRODUCT p JOIN CATEGORY c ON c.CATEGORY_ID = p.CATEGORY_ID`;

function findProduct(id: string): Product | undefined {
  const row = db.prepare(`${productSelect} WHERE p.PRODUCT_ID = ?`).get(id);
  return row === undefined ? undefined : toProduct(productRow.parse(row));
}

function listProducts(q: string, category: string, status: string): readonly Product[] {
  const rows = db
    .prepare(
      `${productSelect}
       WHERE (? = '' OR lower(p.NAME) LIKE '%' || lower(?) || '%' OR lower(p.SKU) LIKE '%' || lower(?) || '%')
         AND (? = '' OR p.CATEGORY_ID = ?) AND (? = '' OR p.STATUS = ?)
       ORDER BY p.NAME`
    )
    .all(q, q, q, category, category, status, status);
  return rows.map((r) => toProduct(productRow.parse(r)));
}

function rulesFor(productId: string): readonly Rule[] {
  return db
    .prepare('SELECT * FROM DISCOUNT_RULE WHERE PRODUCT_ID = ? ORDER BY CREATED_AT, RULE_ID')
    .all(productId)
    .map((r) => toRule(ruleRow.parse(r)));
}

function findJob(id: number): Job | undefined {
  const row = db.prepare('SELECT * FROM REPRICE_JOB WHERE JOB_ID = ?').get(id);
  return row === undefined ? undefined : toJob(jobRow.parse(row));
}

function now(): string {
  return new Date().toISOString();
}

function nextId(table: string, column: string, prefix: string): string {
  const row = z.strictObject({ N: z.number().nullable() }).parse(db.prepare(`SELECT max(CAST(substr(${column}, ${String(prefix.length + 1)}) AS INTEGER)) AS N FROM ${table}`).get());
  return `${prefix}${String((row.N ?? 99) + 1)}`;
}

// The reprice job: QUEUED, then RUNNING, then DONE with the new final price (or FAILED for discontinued products).
function startReprice(product: Product): number {
  const result = db.prepare("INSERT INTO REPRICE_JOB (PRODUCT_ID, STATUS, REQUESTED_AT) VALUES (?, 'QUEUED', ?)").run(product.id, now());
  const jobId = Number(result.lastInsertRowid);
  setTimeout(() => {
    db.prepare("UPDATE REPRICE_JOB SET STATUS = 'RUNNING' WHERE JOB_ID = ?").run(jobId);
    setTimeout(() => {
      finishReprice(jobId, product.id);
    }, 1200);
  }, 400);
  return jobId;
}

function finishReprice(jobId: number, productId: string): void {
  const product = findProduct(productId);
  if (product === undefined || product.status === 'DISCONTINUED') {
    db.prepare("UPDATE REPRICE_JOB SET STATUS = 'FAILED', ERROR = ?, FINISHED_AT = ? WHERE JOB_ID = ?").run('Product is discontinued', now(), jobId);
    return;
  }
  const percent = Math.min(
    rulesFor(productId)
      .filter((r) => r.enabled)
      .reduce((sum, r) => sum + r.percent, 0),
    maxDiscount
  );
  const newPrice = Math.round(product.listPrice * (100 - percent)) / 100;
  db.prepare('UPDATE PRODUCT SET FINAL_PRICE = ?, UPDATED_AT = ? WHERE PRODUCT_ID = ?').run(newPrice, now(), productId);
  db.prepare("UPDATE REPRICE_JOB SET STATUS = 'DONE', OLD_PRICE = ?, NEW_PRICE = ?, FINISHED_AT = ? WHERE JOB_ID = ?").run(product.finalPrice, newPrice, now(), jobId);
}

// ---------- HTTP ----------

type Reply = readonly [status: number, body: unknown];

class HttpError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`HTTP ${String(status)}`);
    this.status = status;
    this.body = body;
  }
}

function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = issue.path.join('.');
      fields[field === '' ? 'body' : field] ??= issue.message;
    }
    throw new HttpError(400, { error: 'Validation failed', fields });
  }
  return result.data;
}

function requireProduct(id: string): Product {
  const product = findProduct(id);
  if (product === undefined) {
    throw new HttpError(404, { error: `Product ${id} not found` });
  }
  return product;
}

function requireCategory(id: string): void {
  if (db.prepare('SELECT 1 FROM CATEGORY WHERE CATEGORY_ID = ?').get(id) === undefined) {
    throw new HttpError(400, { error: 'Validation failed', fields: { categoryId: 'Unknown category' } });
  }
}

type Handler = (id: string, query: URLSearchParams, body: unknown) => Reply;

function requireRule(id: string): Rule {
  const row = db.prepare('SELECT * FROM DISCOUNT_RULE WHERE RULE_ID = ?').get(id);
  if (row === undefined) {
    throw new HttpError(404, { error: `Rule ${id} not found` });
  }
  return toRule(ruleRow.parse(row));
}

function createProduct(body: unknown): Reply {
  const input = parseBody(productBody, body);
  requireCategory(input.categoryId);
  if (db.prepare('SELECT 1 FROM PRODUCT WHERE SKU = ?').get(input.sku) !== undefined) {
    throw new HttpError(409, { error: `SKU ${input.sku} already exists`, fields: { sku: 'SKU already exists' } });
  }
  const productId = nextId('PRODUCT', 'PRODUCT_ID', 'P-');
  db.prepare('INSERT INTO PRODUCT VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(productId, input.sku, input.name, input.categoryId, input.listPrice, input.listPrice, input.status, now());
  return [201, requireProduct(productId)];
}

function updateProduct(id: string, body: unknown): Reply {
  requireProduct(id);
  const input = parseBody(productUpdate, body);
  requireCategory(input.categoryId);
  db.prepare('UPDATE PRODUCT SET NAME = ?, CATEGORY_ID = ?, LIST_PRICE = ?, STATUS = ?, UPDATED_AT = ? WHERE PRODUCT_ID = ?').run(
    input.name,
    input.categoryId,
    input.listPrice,
    input.status,
    now(),
    id
  );
  return [200, requireProduct(id)];
}

function addRule(productId: string, body: unknown): Reply {
  requireProduct(productId);
  const input = parseBody(ruleBody, body);
  const ruleId = nextId('DISCOUNT_RULE', 'RULE_ID', 'R-');
  db.prepare('INSERT INTO DISCOUNT_RULE VALUES (?, ?, ?, ?, ?, ?)').run(ruleId, productId, input.name, input.percent, input.enabled ? 1 : 0, now());
  return [201, requireRule(ruleId)];
}

function updateRule(id: string, body: unknown): Reply {
  const rule = requireRule(id);
  const input = parseBody(ruleUpdate, body);
  db.prepare('UPDATE DISCOUNT_RULE SET NAME = ?, PERCENT = ?, ENABLED = ? WHERE RULE_ID = ?').run(input.name ?? rule.name, input.percent ?? rule.percent, (input.enabled ?? rule.enabled) ? 1 : 0, id);
  return [200, requireRule(id)];
}

function requireJob(id: string): Job {
  const job = findJob(Number(id));
  if (job === undefined) {
    throw new HttpError(404, { error: `Job ${id} not found` });
  }
  return job;
}

const handlers: Readonly<Record<string, Handler>> = {
  'GET categories': () => [
    200,
    db
      .prepare('SELECT * FROM CATEGORY ORDER BY NAME')
      .all()
      .map((r) => toCategory(categoryRow.parse(r)))
  ],
  'GET products': (_id, query) => [200, listProducts(query.get('q') ?? '', query.get('category') ?? '', query.get('status') ?? '')],
  'POST products': (_id, _query, body) => createProduct(body),
  'GET products/:id': (id) => [200, { ...requireProduct(id), rules: rulesFor(id) }],
  'PUT products/:id': (id, _query, body) => updateProduct(id, body),
  'POST products/:id/rules': (id, _query, body) => addRule(id, body),
  'POST products/:id/reprice': (id) => [202, findJob(startReprice(requireProduct(id)))],
  'PUT rules/:id': (id, _query, body) => updateRule(id, body),
  'DELETE rules/:id': (id) => {
    db.prepare('DELETE FROM DISCOUNT_RULE WHERE RULE_ID = ?').run(requireRule(id).id);
    return [204, null];
  },
  'GET jobs': () => [
    200,
    db
      .prepare('SELECT * FROM REPRICE_JOB ORDER BY JOB_ID DESC LIMIT 50')
      .all()
      .map((r) => toJob(jobRow.parse(r)))
  ],
  'GET jobs/:id': (id) => [200, requireJob(id)]
};

/** Routes /api/<resource>[/<id>[/<sub>]] to its handler. */
function route(method: string, path: string, query: URLSearchParams, body: unknown): Reply {
  const [, resource = '', id, sub] = path.split('/').filter((p) => p !== '');
  const key = `${method} ${[resource, id === undefined ? undefined : ':id', sub].filter((p) => p !== undefined).join('/')}`;
  const handler = handlers[key];
  if (handler === undefined) {
    throw new HttpError(404, { error: `No route for ${method} ${path}` });
  }
  return handler(id ?? '', query, body);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text === '') {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, { error: 'Body is not JSON' });
  }
}

const contentTypes: Readonly<Record<string, string>> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon', '.json': 'application/json' };

async function serveStatic(path: string, res: ServerResponse): Promise<void> {
  const file = normalize(join(staticDir, path));
  const target = file.startsWith(staticDir) && extname(file) !== '' && existsSync(file) ? file : join(staticDir, 'index.html');
  if (!existsSync(target)) {
    res.writeHead(503, { 'content-type': 'text/plain' }).end('Build the app first: npm run build');
    return;
  }
  res.writeHead(200, { 'content-type': contentTypes[extname(target)] ?? 'application/octet-stream' }).end(await readFile(target));
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const method = req.method ?? 'GET';
  if (!url.pathname.startsWith('/api/')) {
    await serveStatic(url.pathname, res);
    return;
  }
  try {
    const [status, body] = route(method, url.pathname, url.searchParams, await readJson(req));
    res.writeHead(status, { 'content-type': 'application/json' }).end(status === 204 ? undefined : JSON.stringify(body));
  } catch (error: unknown) {
    const [status, body]: Reply = error instanceof HttpError ? [error.status, error.body] : [500, { error: String(error) }];
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  }
  console.log(`${method} ${url.pathname}${url.search} ${String(res.statusCode)}`);
}

if (!process.argv.includes('--no-listen')) {
  startServer();
}

function startServer(): void {
  createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      console.error(error);
      res.writeHead(500).end();
    });
  }).listen(port, '127.0.0.1', () => {
    console.log(`pricing-app on http://pricing-qa.localhost:${String(port)} (db ${dbPath})`);
  });
}

// ---------- seed ----------

function seed(): void {
  db.exec(`
    CREATE TABLE CATEGORY (CATEGORY_ID TEXT PRIMARY KEY, NAME TEXT NOT NULL);
    CREATE TABLE PRODUCT (
      PRODUCT_ID TEXT PRIMARY KEY, SKU TEXT NOT NULL UNIQUE, NAME TEXT NOT NULL,
      CATEGORY_ID TEXT NOT NULL REFERENCES CATEGORY, LIST_PRICE REAL NOT NULL, FINAL_PRICE REAL NOT NULL,
      STATUS TEXT NOT NULL CHECK (STATUS IN ('ACTIVE', 'DISCONTINUED')), UPDATED_AT TEXT NOT NULL);
    CREATE TABLE DISCOUNT_RULE (
      RULE_ID TEXT PRIMARY KEY, PRODUCT_ID TEXT NOT NULL REFERENCES PRODUCT, NAME TEXT NOT NULL,
      PERCENT REAL NOT NULL, ENABLED INTEGER NOT NULL, CREATED_AT TEXT NOT NULL);
    CREATE TABLE REPRICE_JOB (
      JOB_ID INTEGER PRIMARY KEY AUTOINCREMENT, PRODUCT_ID TEXT NOT NULL REFERENCES PRODUCT,
      STATUS TEXT NOT NULL, OLD_PRICE REAL, NEW_PRICE REAL, ERROR TEXT, REQUESTED_AT TEXT NOT NULL, FINISHED_AT TEXT);
  `);
  const categories = [
    ['C-FURN', 'Furniture'],
    ['C-ELEC', 'Electronics'],
    ['C-STAT', 'Stationery']
  ] as const;
  for (const [id, name] of categories) {
    db.prepare('INSERT INTO CATEGORY VALUES (?, ?)').run(id, name);
  }
  const products = [
    ['P-100', 'DSK-001', 'Standing desk', 'C-FURN', 600, 'ACTIVE'],
    ['P-101', 'CHR-001', 'Office chair', 'C-FURN', 250, 'ACTIVE'],
    ['P-102', 'CHR-002', 'Drafting stool', 'C-FURN', 120, 'ACTIVE'],
    ['P-103', 'SHF-001', 'Bookshelf', 'C-FURN', 180, 'DISCONTINUED'],
    ['P-104', 'LMP-001', 'Desk lamp', 'C-FURN', 45, 'ACTIVE'],
    ['P-105', 'MON-001', '27-inch monitor', 'C-ELEC', 320, 'ACTIVE'],
    ['P-106', 'MON-002', '34-inch ultrawide monitor', 'C-ELEC', 540, 'ACTIVE'],
    ['P-107', 'KBD-001', 'Mechanical keyboard', 'C-ELEC', 130, 'ACTIVE'],
    ['P-108', 'MSE-001', 'Wireless mouse', 'C-ELEC', 40, 'ACTIVE'],
    ['P-109', 'HDP-001', 'Noise-cancelling headphones', 'C-ELEC', 280, 'ACTIVE'],
    ['P-110', 'WBC-001', 'Webcam', 'C-ELEC', 90, 'DISCONTINUED'],
    ['P-111', 'NTB-001', 'Notebook, A5 dotted', 'C-STAT', 12, 'ACTIVE'],
    ['P-112', 'PEN-001', 'Gel pen, 10 pack', 'C-STAT', 9.5, 'ACTIVE'],
    ['P-113', 'PLN-001', 'Weekly planner', 'C-STAT', 22, 'ACTIVE'],
    ['P-114', 'FLD-001', 'Document folders, 25 pack', 'C-STAT', 18, 'ACTIVE']
  ] as const;
  const rules = [
    ['R-100', 'P-100', 'Spring sale', 10, 1],
    ['R-101', 'P-101', 'Bulk buyer', 15, 1],
    ['R-102', 'P-105', 'Clearance', 20, 1],
    ['R-103', 'P-105', 'Loyalty', 5, 1],
    ['R-104', 'P-107', 'Launch promo', 12, 0],
    ['R-105', 'P-109', 'Bundle', 8, 1],
    ['R-106', 'P-111', 'Back to school', 25, 1],
    ['R-107', 'P-103', 'Clearance', 30, 1]
  ] as const;
  const seededAt = '2026-09-01T09:00:00.000Z';
  for (const [id, sku, name, category, price, status] of products) {
    const percent = rules.filter((r) => r[1] === id && r[4] === 1).reduce((sum, r) => sum + r[3], 0);
    db.prepare('INSERT INTO PRODUCT VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, sku, name, category, price, Math.round(price * (100 - percent)) / 100, status, seededAt);
  }
  for (const [id, product, name, percent, enabled] of rules) {
    db.prepare('INSERT INTO DISCOUNT_RULE VALUES (?, ?, ?, ?, ?, ?)').run(id, product, name, percent, enabled, seededAt);
  }
}
