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

## Sprint 4 - Deception mechanics (rules 2.0.0)
Status: PASS (local) - CI pending on PR
Implemented:
- Rules 2.0.0 (`config/rules-2.0.0.json`, spec `docs/RULES.md`): six archetypes with twelve role variants (Broker/Kingmaker, Insider/Informant, Fixer/Underwriter, Auditor/Inspector, Saboteur/Mole, Opportunist/Speculator), per-player-count distribution tables (4-12), charges, timing, exact effects and probabilities; sabotage with capped stacking, rising exposure chance, public exposure and fines; public suspicion with bounded penalties and decay; accusations (limits, no pile-ons, no accusing the exposed, scored at the end); eight hidden objectives; final reckoning with full role/objective reveal and per-operation audit including sabotage. Rules 1.0.0 stays playable for older rooms; stored rooms from before roles are upgraded on load.
- Protocol: `useAbility` and `accuse` commands (strict schemas). Redaction: own role/objective/charges only; ability results only to the players they name; public exposure flag and accusations; everything else at the reckoning.
- UI: role card with distinct sigils, ability panel with confirmation, accusations, private dossier, suspicion/exposure in the roster, reveal grid and bonus/penalty column at the reckoning.
- Bots play roles; simulator reports win rates by role, archetype, table size, sabotage/detection, accusations and objectives; parallel worker threads.
Tests and results:
- Engine: 88 tests (22 role tests, 2.0.0 secrecy and legal/apply agreement properties, stored-room upgrade); coverage above the 90% thresholds.
- Integration + security: 35/35 against real workerd, including roles dealt privately over sockets and abilities/accusations end to end.
- E2E golden path with roles (every browser checks its secret role card, uses its ability through the UI in round 2, one public accusation, full reveal at the reckoning).
Fixes made: stored rooms written before roles crashed the new code (state upgrade added); exposures scrolled out of the 80-entry log (permanent public flag); Kingmaker gift label leaked role mechanics (neutral "patron" label).
Known defects and risk: balance is simulated, not human-tested (see `docs/BALANCE.md`); golden path needs relaxed pace on heavily loaded machines.

## Sprints 5-6 (part 1) - Product polish and table scale
Status: PASS (local) - CI pending on PR
Implemented:
- In-game Rules dialog (How to play / Roles / Scoring), generated from the room's rules; public role catalog in the rules summary (which player holds which role stays secret).
- Optional sound effects, muted by default, synthesized with Web Audio (no audio files); toggle in the header, remembered per device.
- Dialogs render in a portal to `<body>` (the sticky header's backdrop filter had trapped the Rules overlay off-screen; found by the accessibility test).
Tests and results:
- `tests/e2e/a11y.spec.ts`: axe-core WCAG 2.0/2.1 A and AA on landing, host, join, lobby, briefing, intelligence, negotiation, commitment, confirm dialog, outcome, rules dialog (both tabs) and final reckoning, desktop and phone: no serious or critical violations.
- `tests/e2e/scale.spec.ts`: 8 and 12 isolated browsers (half phone-sized at 375 px) each play a quick match: distinct secret roles, identical outcomes and scoreboards everywhere, no horizontal scroll at 375 px, no console errors (8p 1.1 min, 12p 1.6 min).
- Full local e2e suite: 11 passed.
Known defects and risk: phone layouts at 12 players are long (scrolling) but complete; no human playtest yet.
