# e2e harness template

A Copier template: `template/` is stamped into `<app>/e2e/`. `demo/pricing-app/` is the app it is developed and
evaluated against, and `demo/pricing-app/e2e/` is a stamped copy with the suite the skills wrote in eval runs.

- Develop in `template/` like any npm project (`npm ci && npm run check`). Playwright needs the demo running:
  `cd demo/pricing-app && npm run db:reset && npm start`.
- `./check.sh` is the gate: it stamps the template, runs `npm run check`, and runs the demo suite with the fresh
  harness. Run it before finishing a change; after changing template files, `demo/restamp.sh` refreshes the demo copy.
- Only `README.md.jinja`, `CLAUDE.md.jinja` and the answers file are templated. Keep `{{`/`{%` out of other files.
- A new app-owned file goes in `_skip_if_exists` in `copier.yml`, or `copier update` overwrites apps' copies.
- Safety lives in `harness/` code (fixtures, guard, db), not in skills or Claude Code settings. Skills are procedure.
- Change a skill only for a failure seen in an eval run (`evals/run.sh setup|write|triage`), and rerun that eval
  after the change. Read the transcript, not just the final report.
