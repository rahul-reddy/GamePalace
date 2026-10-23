# Changelog

All dates 2026-10-23. Pull request numbers refer to rahul-reddy/GamePalace.

## Unreleased (not deployed)

### Recovery, operations and release readiness (#17)
- Crash-recovery test: the runtime is killed mid-match; persisted alarms advance the phase with
  nobody connected and every seat resumes.
- "Use on another device": a private seat link in the URL fragment, never sent to servers.
- Load test (100 rooms, 796 players), deploy script with typed confirmation and SHA recording,
  deploy-bundle self-test, runbook, cost model, release readiness report, known issues.
- Dialogs trap keyboard focus; player views trimmed by 25% (only recent deals).

### Polish and table scale (#15)
- In-game rules and role reference; optional sound, muted by default.
- Automated accessibility audit on every screen; 8- and 12-player matches in isolated browsers.
- Fixed: dialogs stole focus on every countdown tick; audio stayed suspended for returning players.

### Secret roles, rules 2.0.0 (#10)
- Six role archetypes in twelve variants, sabotage with exposure, suspicion, accusations, hidden
  objectives, full reveal and audit at the final reckoning.
- Balance tuned over 10,000-match simulations; all archetypes within ±3.7 pp in matched tables.
- Fixed before merge: stacked insurance could over-refund, an insider tip could pay twice,
  Promise Keeper counted no-accusation deals.

### Playable game (#9)
- Every screen from landing to rematch; resilient reconnecting client; four-browser golden path.

### Live rooms (#8)
- Room, directory and rate-limiter Durable Objects; seat tokens; protocol v1 with idempotent
  commands; integration and security suites against real workerd.

### Engine and foundation (#7)
- Deterministic rules engine (rules 1.0.0), redaction, replay, invariants, bot simulator.

### Repository (#1)
- Cross-model review and merge harness, CI, Dependabot.
