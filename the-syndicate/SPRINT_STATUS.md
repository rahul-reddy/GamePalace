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

## Sprint 2 - Authoritative live rooms
Status: PASS (local) - CI pending on PR
Implemented:
- `RoomDirectory` DO (code -> unguessable room id, collision-checked, sharded), `Room` DO (SQLite state/seats/commands/events, alarms, hibernatable WebSockets), `RateLimiter` DO.
- `POST /api/rooms`, `GET /api/rooms/:code`, `POST /api/rooms/:code/join`, `GET /api/rooms/:code/ws`; seat tokens (256-bit, SHA-256 stored, sent only in `hello`).
- Protocol v1: acknowledgements, `commandId` idempotency, `expectedPhaseVersion` stale-phase guard, server sequence numbers, full redacted snapshot per state change, one live socket per seat (newest wins), presence, kick/leave revocation, expiry and cleanup.
- Test-mode-only endpoints (`TEST_MODE=1`): phase fast-forward, replay log, aging for expiry tests, per-test rate-limit identity.
- Docs: `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`.
Tests and results (real `wrangler dev`, workerd, SQLite DOs):
- `pnpm test:integration`: 33/33 (health 4, rooms 14, security 15). Covers a full 4-player match with consistent views and network-level secrecy checks, server replay reproducing the persisted state byte for byte, duplicate commandIds, 6 simultaneous commits resolving once, stale/late commands, same-seat reconnect replacing the old socket, disconnect/return, a real alarm deadline (fast pace), kick + token revocation, full/in-progress/unknown rooms, expiry, forged system commands, impersonation, over-commitment, double-spend races, origin checks, HTML nicknames, oversized/malformed input, create/join/socket rate limits, unauthenticated socket timeout, revoked tokens.
Fixes made during the sprint: room storage tables recreated after `deleteAll()` (closed rooms crashed on late socket events); leaving the lobby now acknowledges before closing the socket; `MATCH_IN_PROGRESS` returns 409.
Known defects and risk: restart/redeploy recovery is designed (lazy load from SQLite) but not yet tested by killing the runtime (Sprint 7). Rate-limit counters are in memory and reset if the limiter object is evicted.

## Sprint 3 - First playable vertical slice
Status: PASS (local) - CI pending on PR
Implemented:
- Web client: landing, host/join (nickname, avatar, code entry, rejoin offer), lobby (code, share link, QR, roster, host settings, kick, ready/start), briefing, intelligence (operation card, private intel, paid contact), negotiation (table talk with presets/reactions/filtered text, nonbinding deals), sealed commitment (confirm dialog, pending, server-confirmed state), outcome reveal, round summary with kept/broken promises, final reckoning with scoreboard, highlights and per-operation audit, results with seed and rematch, leave.
- Resilient connection: reconnect with backoff, heartbeat and dead-socket detection, wake/online triggers, unacknowledged commands resent with the same commandId, "opened elsewhere" takeover, kicked/closed/unauthorized/outdated-version end states, unsupported-browser screen.
- Public vs private styling (gold public, teal hatched private), sticky header with phase, countdown, credits and influence, screen-reader phase announcements, reduced motion.
Tests and results:
- `E2E-MULTIPLAYER-001` (`tests/e2e/golden-path.spec.ts`, 4 isolated contexts: 2 desktop, 2 phone-sized): PASS twice locally (3.3-3.4 min). Verified: host gets code; 3 joins via invite link; ready/start; private briefing and credits per player; intel purchase; deal proposed/accepted; chat; sealed commitments with confirmation; identical outcomes on all 4; five rounds via readiness; player C closes the page in round 3, others see "offline" and continue, C reopens and gets the same seat mid-round; scoreboard totals equal an independent engine replay of the server's command log; no socket frame carried other players' credits/intel or hidden odds before the reckoning; full rematch played to results; zero console errors.
- Smoke (desktop + Pixel 7): CSP present, HTTP + WebSocket reachable from the page, no horizontal overflow, unknown room code shows a clear error, unknown paths go home.
- Screenshots: `docs/screenshots/` (curated) and `artifacts/screenshots/` (all, regenerated by the E2E run).
Fixes made: roster missing during intelligence/negotiation (presence was invisible); header label truncated at 375-390 px; JSON import attribute needed for Node-based test runners.
Known defects and risk: no asymmetric roles yet (Sprint 4); visual polish, tutorial depth, sound and 12-player layout pending (Sprints 5-6); no human playtest yet.
