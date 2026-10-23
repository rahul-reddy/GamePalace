# Release readiness report (2026-10-23)

Verdict: **ready for a private beta with friends once deployed**; not yet a public release.
Deployment, human playtests and production measurements are blocked on access and people, not on
code. "Local" means Windows 11, Node 24, real `workerd` via `wrangler dev`; "CI" means GitHub
Actions on Ubuntu for the commit under review.

| Gate | Status | Evidence |
| --- | --- | --- |
| Strict TypeScript, lint, format, typecheck, build | PASS | CI `Verify GamePalace` on every PR |
| Reproducible install | PASS | `pnpm install --frozen-lockfile` in CI; pinned versions |
| Pure deterministic engine, replay | PASS | Engine property tests; server command log replays to the persisted state byte for byte (integration and golden path) |
| Engine branch coverage ≥ 90% | PASS | 92.4% branches, 98.0% statements (thresholds enforced) |
| Invariants (no negative balances, no double rewards, legal phases) | PASS | fast-check properties; checked after every command in 10,000 simulated matches: 0 violations |
| Secrecy: no other player's secrets reach a client | PASS | Allowlist redaction; property tests for rules 1.0.0 and 2.0.0; socket-frame inspection in integration and golden path |
| Server authority, auth, idempotency, races | PASS | 15 security tests + 16 room tests against real workerd |
| Durable state, alarm deadlines, crash recovery | PASS | `pnpm test:recovery`: runtime killed mid-match, alarm fires after restart with nobody connected, all seats resume |
| E2E-MULTIPLAYER-001 (4 browsers, disconnect, rematch) | PASS | `tests/e2e/golden-path.spec.ts`, local and CI |
| 4-12 players | PASS | Golden path (4), `scale.spec.ts` with 8 and 12 isolated browsers; simulations at every count 4-12 |
| Same seat from new tab / new device | PASS | Rooms integration test (new socket replaces old); `device.spec.ts` (separate browser context via private link, token never sent to a server) |
| 10,000 simulated matches | PASS | `docs/balance/report-2.0.0-final.md` (reproducible seed) |
| Role balance within 5 pp (matched tables) | PASS with 1 flag | All archetypes within ±3.7 pp; Opportunist variant +6.1 pp flagged in `docs/KNOWN_ISSUES.md` |
| Accessibility (automated) | PASS | axe WCAG 2.0/2.1 A+AA, no serious/critical violations on any screen, desktop and phone |
| Accessibility (manual screen reader) | BLOCKED | Not performed |
| No horizontal scroll at 375 px | PASS | Smoke and 8/12-player tests at 375 px |
| Load: 100 rooms correctness | PASS | 100 rooms, 796 players, 0 failed rooms, 0 rejected commands (`docs/load/`) |
| Latency ≤ 250 ms p95 ack | PASS (uncontended, local) / FAIL (25 rooms on one machine) / BLOCKED (production) | 119 ms p95 one room at a time; 1.66 s p95 with 25 rooms sharing one local process; no staging to measure |
| Security review | PASS (internal) | `docs/SECURITY.md`, cross-model review on every PR; no external penetration test |
| CI pipeline | PASS | `.github/workflows/ci.yml` runs every check above except load and the 10k simulation (600-match `sim:check` instead) |
| Deploy tooling | PASS | `scripts/deploy.ps1` (merged commits only, typed confirmation, SHA recorded at `/api/health`), bundle self-test in CI |
| Deployed staging / production | BLOCKED | Needs Cloudflare account access and owner approval |
| Human playtests (≥3 matches) | BLOCKED | Needs participants |
| Docs: rules, architecture, protocol, security, operations, cost, host guide | PASS | `docs/` |

## What "done" does not claim

No deployment exists. Balance is simulated. Latency figures are local. The security work is
internal testing and cross-model code review, not an external audit.

## Next steps, in order

1. Owner logs in to Cloudflare; deploy `main` to staging; run `E2E_BASE_URL=... pnpm test:e2e`.
2. Run three or more human matches (4, 8 and 12 players) on staging; record confusion points,
   match length and replay desire; adjust rules in a new rules version if needed.
3. Measure latency on a dedicated load environment; then deploy production.
