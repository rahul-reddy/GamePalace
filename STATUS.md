# Status

## Current handoff (2026-11-03)
- `main` at `27c4687`, CI green. THE SYNDICATE sprints 0-8 are merged: engine (rules 1.0.0 and
  2.0.0), live rooms, playable client, secret roles, polish, accessibility, 8/12-player browser
  tests, crash recovery, device transfer, load test, deploy tooling and docs. Since then: the
  how-to-play guide (#24) practice bots (#26: one person can play alone against bots) and the
  ultra-relaxed pace (#29, rules 2.1.0: twice relaxed, 90-minute cap).
- Evidence and gate-by-gate status: `the-syndicate/docs/RELEASE_READINESS.md`; history:
  `the-syndicate/CHANGELOG.md`; known issues: `the-syndicate/docs/KNOWN_ISSUES.md`.
- Staging deployed 2026-10-23: https://the-syndicate-staging.syndicate-worker.workers.dev (commit `27c4687`, rules 2.1.0, deployed 2026-11-03), verified by health check and browser tests over
  the internet (smoke and solo practice match on 2026-11-03). Remaining: human playtests, latency on a dedicated environment, production. Next steps: `the-syndicate/NEXT_ACTION.md`.
- Dependabot: react updates are grouped; TypeScript 7 and @types/node 26 are held (see
  `.github/dependabot.yml`).

## History
- 2026-11-03: PR #29 (ultra-relaxed pace, rules 2.1.0) merged after gemini approved; `27c4687` deployed to staging, health reports rules 2.1.0, 5 browser tests pass against it.
- 2026-11-03: PR #26 (practice bots) merged after gemini approved; `130a36d` deployed to staging, health and 5 browser tests pass against it.
- 2026-10-23: PR #24 (how-to-play guide) merged; `7d72d8e` deployed to staging.
- 2026-10-23: PR #22 (deploy credentials from .env) merged; `896146c` deployed to staging and verified.
- 2026-10-23: PRs #17 (recovery/ops), #19 (seat-link encoding, changelog), #12 and #18 (Dependabot) merged; main green at c592adb.
- 2026-10-23: PR #15 merged after gemini blocked focus stealing and suspended audio (both fixed with tests).
- 2026-10-23: PR #10 merged after codex blocked 3 real engine bugs (stacked insurance, double tip, Promise Keeper) which were fixed with regression tests; gemini approved the fix.
- 2026-10-23: PR #9 merged (playable client, golden path passing in CI in 49 s).
- 2026-10-23: PR #8 merged (authoritative rooms, 33 integration/security tests).
- 2026-10-23: PR #7 merged (foundation, engine, simulator).
- 2026-10-23: PR #1 merged: review/merge harness from TenFold `336a043`, CI, Dependabot.
- 2026-10-23: Repository created empty by the owner; harness setup started.
