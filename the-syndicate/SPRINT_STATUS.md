# Sprint status

## Sprint 0 - Foundation
Status: PASS (local) - CI pending on PR
Implemented:
- pnpm workspace (`apps/web`, `apps/worker`, `packages/{game-engine,shared,ui,test-bots}`), strict TypeScript, ESLint, Prettier.
- Shared versioned protocol schemas (Zod) with structured error codes.
- Worker: `GET /api/health`, `/api/ws-probe` WebSocket handshake, origin checks, security headers; static assets with CSP via `_headers`.
- Landing page with Host/Join actions and a live backend check.
Commands actually executed (this revision, Windows 11, Node 24.13.0, pnpm 12.12.1):
- `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`: pass.
- `pnpm test:integration`: 4/4 pass against real `wrangler dev` (workerd).
- `pnpm test:e2e`: smoke test passes on desktop Chrome and Pixel 7 viewports (CSP present, no console errors).
Known defects and risk: Host/Join buttons are not wired yet (Sprint 2/3).

## Sprint 1 - Deterministic game engine
Status: PASS (local)
Implemented:
- `createGame`, `applyCommand` (join, ready, settings, start, kick, mute, leave, intel, commit, deals, chat, rematch, presence, tick), `transitionPhase`, `nextPhase`, `resolveOperation`, `splitPool`, `computeScore`, `determineWinners`, `redactViewForPlayer`, `legalActions`, `serialize`/`deserialize`, `replay`, `checkInvariants`.
- Seeded per-purpose RNG; rules in versioned `config/rules-1.0.0.json`; specification in `docs/RULES.md`.
- Eight bot strategies and a match simulator that only sees redacted views.
Tests and results:
- Engine: 59 tests pass (unit, fast-check properties for invariants, secrecy and replay; legalActions/applyCommand agreement). Coverage: 98.8% statements, 94.2% branches.
- Simulation: `pnpm sim:check` (600 matches, 4-12 players, mixed and matched strategies, dropouts): 0 violations, 0 unfinished, 0 illegal moves by legal strategies.
Fixes made: remainder tie-break by seat gave seat 1 a 38.7% win rate in matched tables (expected 14.2%); now a seeded per-operation shuffle (all seats within CI).
Known defects and risk:
- "Always commit the maximum" (aggressive bot) outperforms in mixed tables (+9 pp over expectation in a 300-match sample). To be addressed with roles and payoff tuning in Sprint 4/6.
- Tie rate is high in matched-strategy tables (identical bots); mixed-table tie rate to be reported separately in Sprint 6.
