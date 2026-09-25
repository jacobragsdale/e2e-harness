#!/usr/bin/env bash
# Refresh the template-owned files in demo/pricing-app/e2e from this repo's working tree. App-owned files (tests,
# docs/app.md, playwright.config.ts) are kept, as `copier update` would. check.sh fails until this has been run.
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
uvx copier copy --defaults --overwrite --quiet --vcs-ref HEAD --data app_name="Pricing Admin" "$here" "$here/demo/pricing-app/e2e"
# Record the published source, so `copier update` in a copy of the demo pulls from GitHub, not this checkout.
sed -i "s#^_src_path: .*#_src_path: gh:jacobragsdale/e2e-harness#" "$here/demo/pricing-app/e2e/.copier-answers.yml"
