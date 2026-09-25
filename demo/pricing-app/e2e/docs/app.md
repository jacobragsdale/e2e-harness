# App map

Pricing Admin: an Angular 22 + Angular Material app for keeping product prices. Users maintain products, attach
percentage discount rules to them, and run a reprice job that sets each product's final price. The API and static
host is `../server/server.ts` (Node, SQLite).

## Environment

|          |                                                                                              |
| -------- | -------------------------------------------------------------------------------------------- |
| Source   | `..` (Angular app in `../src/app`, API in `../server/server.ts`)                             |
| QA URL   | `http://pricing-qa.localhost:4300` (E2E_BASE_URL in .env)                                    |
| Database | SQLite, `/home/jacob/dev/e2e-harness/demo/pricing-app/server/pricing-qa.sqlite` (E2E_DB_URL) |

No login. Fonts come from Google Fonts (`fonts.gstatic.com`; the build inlines the CSS from `fonts.googleapis.com`).

## Screens

| Route                | Component                 | What the user does there                                                                                                                                                                                                                             |
| -------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                  | redirect                  | Goes to `/products`.                                                                                                                                                                                                                                 |
| `/products`          | `products/product-list`   | h1 "Products". Search (name or SKU, case-insensitive), Category and Status selects; table SKU, Name (link), Category, List price, Final price, Status; "N products" count; empty row "No products match your filters."                               |
| `/products/new`      | `products/product-form`   | h1 "New product". SKU, Name, Category, List price, Status (default Active); Save, Cancel (to list). Snackbar "Product ABC-123 created", then opens the detail.                                                                                       |
| `/products/:id`      | `products/product-detail` | h1 is the product name. Terms SKU, Category, Status, List price, Final price, Last updated. "Edit product", "Reprice". Discount rules table (Rule, Discount, Enabled switch, edit and delete icons); "Add rule". Unknown id: h1 "Product not found". |
| `/products/:id/edit` | `products/product-form`   | h1 "Edit product". Same form, SKU disabled; Cancel goes back to the detail. Snackbar "Product saved".                                                                                                                                                |
| `/jobs`              | `jobs/job-list`           | h1 "Reprice jobs". Last 50 jobs: Job (#id), Product (id link), Status, Old price, New price, Requested; "Refresh". Empty: "No reprice jobs yet."                                                                                                     |
| anything else        | `shared/not-found`        | h1 "Page not found", link "Back to products".                                                                                                                                                                                                        |

Toolbar nav: "Products", "Reprice jobs".

Validation messages. Product form (client and server): "SKU must look like ABC-123" (`^[A-Z]{3}-\d{3}$`, also when
empty), "Name is required" (max 80), "Category is required", "List price must be greater than 0". Server only:
"SKU already exists" (409, shown on the SKU field). Rule dialog ("Add discount rule" / "Edit discount rule"): Rule
name ("Name is required", max 60), Discount % ("Percent must be between 0 and 90", default 10); Cancel, Save rule.
Delete asks in a "Delete rule" dialog: "Delete the rule “name”? This cannot be undone." with Cancel and Delete.

Rule changes show a snackbar "Rule added|saved|enabled|disabled|deleted. Reprice to apply it." They do not change the
final price until the product is repriced.

## Workflows

| Workflow                                           | Screens                  | Test file                      |
| -------------------------------------------------- | ------------------------ | ------------------------------ |
| Browse, search and filter products                 | `/products`              | `tests/products-list.spec.ts`  |
| View a product; unknown id                         | `/products/:id`          | `tests/product-detail.spec.ts` |
| Create a product; validation; duplicate SKU        | `/products/new`          | `tests/product-create.spec.ts` |
| Edit a product; discontinue it; cancel             | `/products/:id/edit`     | `tests/product-edit.spec.ts`   |
| Add, edit, toggle, delete discount rules           | `/products/:id`          | `tests/discount-rules.spec.ts` |
| Reprice a product (background job) and see the job | `/products/:id`, `/jobs` | `tests/reprice.spec.ts`        |
| Navigation and not-found                           | toolbar, `**`            | `tests/smoke.spec.ts`          |

Reprice: `POST /api/products/:id/reprice` returns a QUEUED job; the page polls `GET /api/jobs/:id` every 500 ms. The
job goes RUNNING after ~0.4 s and DONE ~1.2 s later. Final price = list price × (100 − sum of enabled rule percents,
capped at 90) / 100, rounded to cents. A discontinued product's job ends FAILED with "Product is discontinued"; the
page shows `status` "Reprice job #N: FAILED" and a snackbar "Reprice failed: Product is discontinued".

## Write endpoints

| Endpoint                         | Fired by                  | Allowed in QA | Why                                                                        |
| -------------------------------- | ------------------------- | ------------- | -------------------------------------------------------------------------- |
| `POST /api/products`             | New product → Save        | yes           | Creates a new `E2E ...` product.                                           |
| `PUT /api/products/:id`          | Edit product → Save       | yes           | Tests edit only products they created.                                     |
| `POST /api/products/:id/rules`   | Add rule → Save rule      | yes           | Adds a rule to a test's own product.                                       |
| `PUT /api/rules/:id`             | Edit rule, Enabled switch | yes           | Tests change only rules they created.                                      |
| `DELETE /api/rules/:id`          | Delete icon → Delete      | yes           | Deletes one rule; tests delete only rules they created.                    |
| `POST /api/products/:id/reprice` | Reprice                   | yes           | Reprices one product (the test's own); adds a row to the shared jobs list. |

There is no endpoint to delete a product, so `E2E ...` products stay in QA. Clean them up with SQL if they pile up:
`PRODUCT`, `DISCOUNT_RULE` and `REPRICE_JOB` rows whose product NAME starts with `E2E`.

## Data

Tables: `CATEGORY`, `PRODUCT`, `DISCOUNT_RULE`, `REPRICE_JOB` (upper-case columns). The server seeds 3 categories
(Furniture, Electronics, Stationery), 15 products `P-100`..`P-114` (2 discontinued) and 8 rules on a fresh database.
New ids continue from the highest (`P-115`, `R-108`, ...).

```sql
-- Product list / detail: a seeded product with its category (read-only tests skip E2E products, which other tests change)
SELECT p.PRODUCT_ID, p.SKU, p.NAME, c.NAME AS CATEGORY, p.LIST_PRICE, p.FINAL_PRICE, p.STATUS
FROM PRODUCT p JOIN CATEGORY c ON c.CATEGORY_ID = p.CATEGORY_ID WHERE p.NAME NOT LIKE 'E2E%' ORDER BY p.NAME;
-- Detail with rules
SELECT p.PRODUCT_ID, r.NAME, r.PERCENT, r.ENABLED FROM DISCOUNT_RULE r JOIN PRODUCT p ON p.PRODUCT_ID = r.PRODUCT_ID;
-- Jobs
SELECT JOB_ID, PRODUCT_ID, STATUS, OLD_PRICE, NEW_PRICE, ERROR FROM REPRICE_JOB ORDER BY JOB_ID DESC;
```

What varies: STATUS `ACTIVE`/`DISCONTINUED`; rules ENABLED 1/0 (seeded P-107 has a disabled rule); products with no
rules have FINAL_PRICE = LIST_PRICE; FINAL_PRICE only changes on reprice, so it can be stale after a list-price edit
or rule change. Job STATUS `QUEUED`, `RUNNING`, `DONE`, `FAILED`.

## Terms

| Users say             | UI says               | Database                               |
| --------------------- | --------------------- | -------------------------------------- |
| product               | Product               | `PRODUCT`                              |
| discount, promo       | Discount rule, Rule   | `DISCOUNT_RULE` (`PERCENT`, `ENABLED`) |
| sale price, net price | Final price           | `PRODUCT.FINAL_PRICE`                  |
| price                 | List price            | `PRODUCT.LIST_PRICE`                   |
| deactivate, retire    | Status: Discontinued  | `PRODUCT.STATUS = 'DISCONTINUED'`      |
| reprice, recalc       | Reprice, Reprice jobs | `REPRICE_JOB`                          |

## Not covered

| What                                       | Why                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Deleting a product                         | The app has no product delete; "deactivate" is Status: Discontinued, covered in edit tests. |
| Jobs list empty state                      | Only true on a fresh QA database; any reprice (by people or tests) fills it.                |
| Jobs list "Refresh" button                 | Reloads the same list; the reprice test covers the listed job.                              |
| Server-side rule validation (percent > 90) | The dialog blocks it client-side; the UI cannot send it.                                    |
| "Could not load products." error state     | Needs the API to fail; the harness does not mock responses.                                 |

## Known app issues

- Editing a product always fails: the form sends `sku` (from `getRawValue()`, which includes the disabled SKU),
  and `PUT /api/products/:id` rejects it with 400 `Unrecognized key: "sku"`. The form shows no message, because
  `describeError` reports it under the field `body`, which no control has. `tests/product-edit.spec.ts` fails until fixed.
- The rule delete button and the Enabled switches have no accessible name.

## Harness notes

- The QA SQLite runs in rollback-journal mode, and `harness/db.ts` opens it without a busy timeout, so a `db` read
  that lands during a server write fails with `database is locked` (seen once in 96 runs). Fix upstream by passing
  `timeout` to `new DatabaseSync(...)`. Until then, write tests make SKUs with `randomSku()` instead of querying the DB.
- `e2e/.editorconfig` (`root = true`) keeps the app's `.editorconfig` (`quote_type = single`) out of Prettier here.
