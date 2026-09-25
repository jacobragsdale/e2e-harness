#!/usr/bin/env bash
# Run one skill eval the way a user would: a headless Claude Code session in a fresh copy of the demo app's repo,
# against its own server and database. Read the report at the end, then the transcript and the workspace's git diff.
#
#   evals/run.sh setup  [dir]   fresh stamp, no tests: "set up the e2e tests"
#   evals/run.sh write  [dir]   the demo suite, plus three BA requirements (one the app can't satisfy)
#   evals/run.sh triage [dir]   the demo suite, after a deploy that renames a button and breaks repricing
#
# Needs the demo's node_modules (cd demo/pricing-app && npm ci), uv, and the claude CLI. Costs real tokens.
set -euo pipefail
kind=${1:?setup, write or triage}
here=$(cd "$(dirname "$0")/.." && pwd)
demo=$here/demo/pricing-app
out=${2:-$(mktemp -d)}
app=$out/pricing-app
port=4320
server=
trap '[ -n "$server" ] && kill "$server"' EXIT

mkdir -p "$app"
(cd "$demo" && git ls-files -z | xargs -0 -I{} cp --parents {} "$app/")
cd "$app"
git init -q && git add -A && git commit -qm "app"

case $kind in
  setup)
    git rm -rq e2e && git commit -qm "no e2e yet"
    uvx copier copy --defaults --quiet --vcs-ref HEAD --data app_name="Pricing Admin" "$here" e2e
    git add -A && git commit -qm "stamp e2e harness"
    prompt="Set up the e2e tests for this app. QA is at http://pricing-qa.localhost:$port and the QA database is sqlite://$out/qa.sqlite (no password needed). I won't be around to answer questions, so use your judgment, take the defaults, and list what you assumed at the end."
    ;;
  write)
    prompt="Our BA sent over some pricing requirements, please get them covered by e2e tests:
1. A discount rule that is switched off must not affect the price when the product is repriced.
2. When someone changes a product's list price, the final price stays the same until the product is repriced.
3. Every reprice job shows who requested it.
I won't be around to answer questions; use your judgment and tell me what you assumed."
    ;;
  triage)
    python3 - <<'PY'
p = "server/server.ts"; s = open(p).read()
s = s.replace("rulesFor(productId)\n      .filter((r) => r.enabled)\n      .reduce", "rulesFor(productId)\n      .reduce")
open(p, "w").write(s)
p = "src/app/products/product-detail.html"; s = open(p).read()
open(p, "w").write(s.replace(">Add rule</button>", ">New rule</button>"))
PY
    git commit -qam "Rename Add rule to New rule; simplify reprice"
    prompt="The nightly e2e run against QA went red after today's deploy. Find out why, fix whatever is broken in the tests, and tell me what's wrong with the app. I won't be around for questions."
    ;;
  *) echo "unknown eval: $kind" >&2; exit 2 ;;
esac

ln -s "$demo/node_modules" node_modules
npx ng build > /dev/null
DB_PATH=$out/qa.sqlite PORT=$port node server/server.ts --init > "$out/server.log" 2>&1 &
server=$!
until curl -sf "http://127.0.0.1:$port/api/categories" > /dev/null; do sleep 0.2; done
if [ "$kind" != setup ]; then
  (cd e2e && npm ci --silent && printf 'E2E_BASE_URL=http://pricing-qa.localhost:%s\nE2E_DB_URL=sqlite://%s/qa.sqlite\n' "$port" "$out" > .env)
fi

echo "eval $kind in $out"
(cd e2e && claude -p "$prompt" --dangerously-skip-permissions --output-format stream-json --verbose > "$out/transcript.jsonl")
python3 - "$out/transcript.jsonl" <<'PY'
import json, sys
for line in open(sys.argv[1]):
    event = json.loads(line)
    if event.get("type") == "result":
        print(f"{event['num_turns']} turns, ${event['total_cost_usd']:.2f}, {event['duration_ms'] / 60000:.1f} min\n")
        print(event.get("result", ""))
PY
echo "workspace: $app (git diff shows what the session changed)"
