#!/usr/bin/env bash
# Stamp the template into a temp dir, run its checks, then run the demo's suite with the fresh harness against a
# fresh demo app. Uncommitted template changes are included (copier warns about a dirty template; that is expected).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
demo=$here/demo/pricing-app
out=$(mktemp -d)
server=
trap '[ -n "$server" ] && kill "$server"; rm -rf "$out"' EXIT

cp "$demo/.editorconfig" "$out/"  # stamp as if inside an app repo, whose editorconfig must not leak in
uvx copier copy --defaults --quiet --vcs-ref HEAD --data app_name="Pricing Admin" "$here" "$out/e2e"
if ! diff -rq -x node_modules -x .env -x tests -x test-results -x playwright-report -x app.md -x playwright.config.ts -x .copier-answers.yml "$out/e2e" "$demo/e2e"; then
  echo "check.sh: demo/pricing-app/e2e has stale template files; run demo/restamp.sh" >&2
  exit 1
fi
cd "$out/e2e"
npm ci --silent
npm run check

[ -d "$demo/node_modules" ] || (cd "$demo" && npm ci --silent)
(cd "$demo" && npm run --silent build > /dev/null)
DB_PATH=$out/pricing-qa.sqlite PORT=4310 node "$demo/server/server.ts" --init > "$out/server.log" 2>&1 &
server=$!
cp -r "$demo/e2e/tests" "$demo/e2e/docs" "$demo/e2e/playwright.config.ts" .
npx playwright install chromium > /dev/null
until curl -sf http://127.0.0.1:4310/api/categories > /dev/null; do sleep 0.2; done
E2E_BASE_URL=http://pricing-qa.localhost:4310 E2E_DB_URL="sqlite://$out/pricing-qa.sqlite" npx playwright test --retries 0 --reporter=dot
echo "check.sh: stamped harness passes its checks and runs the demo suite green"
