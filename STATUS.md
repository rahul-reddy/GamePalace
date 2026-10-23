# Status

## Current handoff (2026-10-23)
- Merged: #1 harness, #7 engine, #8 rooms, #9 playable client, #10 roles + 10k balance evidence,
  #15 rules dialog / sound / accessibility / 8-12 player browser tests, Dependabot #2-#6.
- Branch `feat/syndicate-recovery`: crash-recovery test, device transfer, load test (100 rooms),
  deploy script + self-test, runbook and cost model, release readiness report. All local checks
  pass on this tree (see the-syndicate/SPRINT_STATUS.md).
- Release status: `the-syndicate/docs/RELEASE_READINESS.md`. BLOCKED: Cloudflare deploy (needs
  owner login), human playtests, production latency.
- Open Dependabot PRs #11-#14 (npm): react/react-dom must merge together; check the dev group for
  TypeScript 7 (typescript-eslint supports <6.1).

## History
- 2026-10-23: PR #15 merged after gemini blocked focus stealing and suspended audio (both fixed with tests).
- 2026-10-23: PR #10 merged after codex blocked 3 real engine bugs (stacked insurance, double tip, Promise Keeper) which were fixed with regression tests; gemini approved the fix.
- 2026-10-23: PR #9 merged (playable client, golden path passing in CI in 49 s).
- 2026-10-23: PR #8 merged (authoritative rooms, 33 integration/security tests).
- 2026-10-23: PR #7 merged (foundation, engine, simulator).
- 2026-10-23: PR #1 merged: review/merge harness from TenFold `336a043`, CI, Dependabot.
- 2026-10-23: Repository created empty by the owner; harness setup started.
