# Pricing Admin (demo)

A small Angular 22 + Angular Material app for the e2e harness to test: products (search, filter, create, edit),
discount rules per product (add, edit, enable/disable, delete with confirmation), and reprice jobs that run in the
background. `server/server.ts` serves the API and the built app from SQLite, using only Node's standard library and zod.

```bash
npm ci
npm run db:reset     # recreate server/pricing-qa.sqlite with seed data
npm start            # build, then serve on http://pricing-qa.localhost:4300 (PORT, DB_PATH override)
```

Checks: `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check`.

`e2e/` holds the Playwright suite the harness's `e2e-setup` skill wrote for this app.
