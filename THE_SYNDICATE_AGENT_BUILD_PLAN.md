# THE SYNDICATE — Autonomous Coding Agent Build Plan

**Filename:** `THE_SYNDICATE_AGENT_BUILD_PLAN.md`  
**Version:** 1.0  
**Mission:** Build and verify an original, production-ready, real-time multiplayer social-deception and negotiation browser game.  
**Priority:** Deliver a genuinely playable **four-player complete match by Sprint 3** before elaborate styling, role complexity, or scale work.

> **Agent instruction:** This document is an executable implementation mandate, not a request for another plan. Inspect the repository and environment, implement features, run tests, fix failures, and maintain evidence of progress. Work autonomously within available permissions. Do not claim to have executed commands, tests, deployments, or human playtests unless you actually did so. Do not incur costs or publish externally without authorization.

## 1. Product requirements

- **Players:** 4–12 simultaneous participants on distinct phones or desktop browsers, including different networks.
- **Access:** Host creates a private room, shares room code/link/QR, others join with nickname; no required account.
- **Length:** Standard 15–25 minutes; optional quick mode 10–15 minutes.
- **Loop:** Intel → Negotiate → Commit → Reveal → Score; repeat across five operations and a final reckoning. No elimination.
- **Theme:** Fictional underground business syndicate with alliances, imperfect information, risky operations, sabotage, and influence.
- **Experience:** Premium noir-tech visual style, mobile-first UI, clear timer and action states, compelling reveals, replayable strategy.
- **Trust:** Server-authoritative role assignment, deadlines, randomness, finances, resolution and scoring; no unauthorized secret disclosure.
- **Boundaries:** Fictional credits only, no real-money gambling, no pay-to-win. No mandatory personal information.

### Initial game rules (version these and validate by simulation)

- Each player begins with **10 private credits, 0 public influence, 0 public suspicion**. Credit cap 30; no negative balance.
- Each operation announces a public risk tier and reward structure; selected players may have imperfect private intel.
- Players commit **0–3 credits** per operation, limited by available balance. Commitments remain sealed until resolution.
- Successful operation rewards influence according to a clearly specified deterministic payoff schedule and the actual contributions; failed operations may lose committed credits but cannot create debt.
- Each operation follows server-controlled phases and deadlines; early transition is allowed when all required players have finished their actions.
- Final score: **influence + floor(remaining credits / 3) + bounded objective bonuses − unresolved penalties**. Define exact tie-breaking and every edge case in the versioned rules.
- Deals in the first release are **nonbinding social promises**, clearly labeled. Do not implement enforceable contracts until atomic settlement is reliable.
- Public suspicion cannot eliminate players or create an unwinnable snowball.
- Keep match results auditable; use deterministic seeded resolution in **test mode** while keeping secret randomness secure in production.

### Roles (Sprint 4 onward)

| Role | Initial ability hypothesis |
|---|---|
| Broker | Once per match earns bounded influence from a joint successful operation |
| Insider | Twice receives imperfect probability intel |
| Fixer | Once may insure part of a real committed loss |
| Auditor | Twice investigates a narrow truthful fact about a prior action |
| Saboteur | Once may increase an operation's failure probability within a strict bound, risking exposure |
| Opportunist | Twice predicts an operation result before commitments close for a bounded reward |

Specify exact triggers, limits, ranges, visibility, resolution order, player-count role distributions, and anti-exploit behavior. Do **not** block the Sprint 3 playable slice waiting for these asymmetric roles: use a simple, fair four-player baseline with symmetric abilities.

## 2. Architecture and repository

**Preferred stack:** strict TypeScript, pnpm workspaces, React + Vite + Tailwind, Cloudflare Worker, one SQLite-backed Durable Object per room, hibernatable WebSockets, runtime schema validation (such as Zod), Vitest, Playwright, GitHub Actions, Wrangler. Verify current versions and compatibility against official documentation during implementation.

```text
the-syndicate/
├── apps/
│   ├── web/
│   └── worker/
├── packages/
│   ├── game-engine/
│   ├── shared/
│   ├── ui/
│   └── test-bots/
├── tests/
│   ├── e2e/
│   ├── integration/
│   └── security/
├── scripts/
├── docs/
├── artifacts/            # generated reports/screenshots, may be gitignored
├── .github/workflows/
├── pnpm-workspace.yaml
├── SPRINT_STATUS.md
├── NEXT_ACTION.md
└── README.md
```

**Server rules:** One authoritative room state per game; every command authenticated, authorized, validated and idempotent via `commandId`; messages carry protocol version, room state version and server event sequence. Persist roles, commitments, deadlines, and transition state. Send each player an explicitly redacted view, never a whole private game object. Support authenticated reconnect with state snapshot; clients cannot assign roles, resolve outcomes or advance authoritative phases. Do not rely solely on browser timers or transient server `setTimeout` for deadlines.

## 3. Sprint map

| Sprint | Focus | Non-negotiable exit result |
|---|---|---|
| 0 | Foundation | Buildable monorepo and working browser ↔ backend connection |
| 1 | Rules engine | Deterministic four-bot five-operation match, invariants pass |
| 2 | Real-time backend | Four authenticated independent clients share authoritative room |
| **3** | **Playable vertical slice** | **Four real browser sessions complete a match and rematch** |
| 4 | Deception roles | Six fully implemented and validated role archetypes |
| 5 | UI/UX | Polished, mobile-first and accessible experience |
| 6 | Player scale and balance | 4–12 players, 10,000 reproducible simulated matches |
| 7 | Security and recovery | Tested reconnect, abuse controls and secret-data boundaries |
| 8 | Performance and operations | Staging, CI, benchmarks, runbooks, cost assumptions |
| 9 | Release candidate | Evidence-backed private beta, launch decision and handoff |

Sprints are implementation checkpoints, **not calendar commitments**. Work sequentially through gates; do not skip a failed critical gate.

## 4. Exact sprint checklists

### Sprint 0 — Foundation

**Goal:** A runnable monorepo with a working frontend-to-backend connection.

- [ ] Initialize pnpm workspaces, strict TypeScript, Vite frontend, Cloudflare Worker.
- [ ] Add lint, format, typecheck, build, and test scripts.
- [ ] Define shared versioned command/event schemas and structured error responses.
- [ ] Implement `GET /health` and a local WebSocket handshake.
- [ ] Build a simple landing page with Host and Join actions.
- [ ] Add `.env.example`, Wrangler configuration and a minimal CI workflow.
- [ ] Document exact local setup and smoke-test commands.

**Exit gate:** Install, lint, typecheck, tests and build pass; browser can reach the backend.  
**Evidence:** Command logs, health check, working source, README.

### Sprint 1 — Deterministic four-player game engine

**Goal:** Four bots can finish a complete match without networking.

- [ ] Define `GameState`, `Player`, `Phase`, `Operation`, `Action`, `Event`, rules version and authorized projections.
- [ ] Specify exact economy, payouts, outcome generation, scoring and tie-breakers; cover zero-participation operations.
- [ ] Implement finite-state phases: `LOBBY → ROLE_REVEAL → INTELLIGENCE → NEGOTIATION → COMMITMENT → RESOLUTION → ROUND_SUMMARY → (next round or FINAL_RECKONING) → RESULTS`.
- [ ] Implement `createGame`, `joinPlayer`, `startGame`, `legalActions`, `applyCommand`, `transitionPhase`, `resolveOperation`, `computeScore`, `determineWinners`, `redactViewForPlayer`.
- [ ] Implement sealed commitments, secure production RNG boundaries and reproducible test seeds.
- [ ] Implement simple symmetric four-player abilities; postpone full asymmetric roles.
- [ ] Write invariant/property tests: no negative credits, no double rewards, legal phases, secret projection redaction, deterministic replay.
- [ ] Run 100–1,000 bot matches and fix deadlocks and impossible states.

**Exit gate:** Four automated players reliably finish five rounds; replay and all critical invariants pass.  
**Evidence:** `packages/game-engine`, versioned rules, fixture seeds, unit and property test report.

### Sprint 2 — Authoritative live rooms

**Goal:** Four real independent clients communicate through one persisted room.

- [ ] Implement create-room, join-room, ready-state and start APIs; collision-safe public room codes.
- [ ] Authenticate each seat with a private scoped token; do not put secrets in shared invite links.
- [ ] Implement a Durable Object per room with persisted state and state versioning.
- [ ] Wire hibernatable WebSockets, schema validation, command acknowledgements and server event sequence IDs.
- [ ] Make duplicate `commandId` submissions idempotent; guard phase-boundary races.
- [ ] Produce per-player redacted projections; prohibit private data in global broadcasts or logs.
- [ ] Persist roles, commitments, deadlines and round transitions; use alarms and deadline checks on incoming commands.
- [ ] Implement snapshot synchronization, event cursor and an initial authenticated reconnect path.
- [ ] Write integration tests covering four sockets, duplicate commands, concurrent submissions, and separate rooms.

**Exit gate:** Four independently authenticated clients can join, ready, submit valid commands and see consistent authoritative state without role leaks.  
**Evidence:** Worker/room implementation, transport schemas, integration logs.

### Sprint 3 — First playable vertical slice **(highest priority)**

**Goal:** One host and three guests finish a five-operation match and rematch on real browsers.

- [ ] Build create/join room screens and lobby with player list, code, Ready, host Start.
- [ ] Show each player's private role and lightweight rules onboarding.
- [ ] Build public operation-intel screen with risk, potential reward and phase timer.
- [ ] Implement simple negotiation: preset reactions and clearly nonbinding promises.
- [ ] Build sealed 0–3 credit commitment UI; show pending and server-confirmed states.
- [ ] Implement server-controlled phase progression, clear no-action defaults, and timeouts.
- [ ] Show shared operation result, private player effects, credits and influence updates.
- [ ] Advance through all five operations; show breakdown and final ranking.
- [ ] Implement rematch that creates a fresh properly reset round/game state.
- [ ] Implement minimal disconnect indication and same-seat reconnect for basic use.
- [ ] Run four **isolated Playwright browser contexts** through a full match, including round-three disconnect/reconnect.
- [ ] Capture screenshots, verify no blocking console errors, and repair any broken interactions.

**Exit gate:** `E2E-MULTIPLAYER-001` passes all ten criteria in Section 5. Do not substitute mock clients or an animated demo.  
**Evidence:** Running app, full-match E2E result, state assertions, screenshots, local instructions.

### Sprint 4 — Full deception mechanics

- [ ] Implement Broker, Insider, Fixer, Auditor, Saboteur and Opportunist abilities in the engine.
- [ ] Define exact charges, timing, caps, cooldowns, effects and resolution ordering.
- [ ] Add imperfect intel with a documented probability/error model.
- [ ] Add truthful narrow investigations and bounded sabotage/exposure mechanics.
- [ ] Implement suspicion and accusations without player elimination.
- [ ] Implement visible voluntary deal proposals/acceptances, clearly nonbinding.
- [ ] Add secret objectives, bounded score bonuses and final role reveal.
- [ ] Integrate role ability controls and explanatory text in UI.
- [ ] Test each ability at phase boundaries, when exhausted, and when disconnected.

**Exit gate:** Each ability can succeed lawfully and is rejected when illegal, with no role-data leakage.

### Sprint 5 — Product-grade user experience

- [ ] Create design tokens: midnight navy, charcoal, restrained gold/teal, readable typography.
- [ ] Design distinct role cards and a cohesive interface for all states.
- [ ] Refine lobby, operations, alliance prompts, commitments, results and rematch.
- [ ] Add dramatic but quick outcome animations and optional muted-by-default audio.
- [ ] Add guided first-round tutorial, role reference and rule explanations.
- [ ] Test 375px, 390px, tablet and desktop layouts; no critical horizontal overflow.
- [ ] Provide accessible labels, focus indicators, contrast and reduced-motion support.
- [ ] Handle mobile keyboard, loading, offline, reconnect and error states.
- [ ] Add invitation links and QR codes.
- [ ] Review actual browser screenshots and fix visual regressions.

**Exit gate:** Screens work cleanly on supported viewports, and the user can identify phase, time, resources and action instantly.

### Sprint 6 — 4–12 players and quantifiable balance

- [ ] Specify legal role compositions for every party size 4, 5, 6, 7, 8, 9, 10, 11, 12.
- [ ] Implement balanced role variants or constrained duplication as needed.
- [ ] Add bot policies: random legal, conservative, aggressive, cooperative, detective, opportunist, sabotage-focused and adversarial exploit seeker.
- [ ] Run at least **10,000** seeded full matches distributed across player counts and compositions if resources permit; report actual count.
- [ ] Measure role win rates conditioned on bot strategies, score distributions, comeback frequency, tie frequency, deadlocks, passive play and first-mover effects.
- [ ] Investigate deviations larger than five percentage points from matched-strategy expected win rate; report sample size and uncertainty.
- [ ] Adjust payouts, roles and information advantages in versioned rules; rerun regressions.
- [ ] Add quick mode and full standard mode only with corresponding tests.
- [ ] Run real 8-player and 12-player browser test scenarios.

**Exit gate:** All player counts can complete games with no invariants broken; any balance anomalies are documented, not hidden. Simulated balance is not proof of human fairness.

### Sprint 7 — Security and recovery

- [ ] Resume an authenticated seat after disconnect, tab close or device change.
- [ ] Recover durable state and deadlines after server hibernation/restart.
- [ ] Auto-pass absent players at deadlines without blocking the entire room.
- [ ] Implement room expiration, cleanup and reasonable reconnect grace policy.
- [ ] Add origin protections, nickname/chat sanitization, input bounds, rate limits and preset-chat option.
- [ ] Try forged actions, impersonation, cross-room access, command replay, duplicate tabs, spending beyond balance, and deadline races.
- [ ] Inspect all HTTP/socket responses, logs and error messages for unauthorized role/intel disclosures.
- [ ] Add host moderation and mute/report paths appropriate to private rooms.
- [ ] Fix all discovered high/critical security or game-integrity findings.

**Exit gate:** Protected data remains protected, reconnect works, and observed failure scenarios do not corrupt the game.

### Sprint 8 — Performance, staging and operations

- [ ] Build realistic multiplayer load clients; test only authorized infrastructure.
- [ ] Simulate 100 active rooms with typical player counts if environment resources permit.
- [ ] Measure p50/p95 command acknowledgements, phase transitions, socket activity, storage and error rates.
- [ ] Use 250 ms p95 acknowledgement as a measured test-region target, not an unsupported universal production guarantee.
- [ ] Add structured telemetry with private information redacted.
- [ ] Complete CI pipeline for build, lint, typecheck, engine/integration/E2E smoke tests.
- [ ] Document staging/production environments, configuration, migration and rollback.
- [ ] Model hosting costs using measured assumptions and current provider pricing.
- [ ] Write monitoring, outage, abuse, deploy and rollback runbooks.

**Exit gate:** Staging and benchmark findings documented, with measurable limitations and repeatable operation instructions.

### Sprint 9 — Release candidate and handoff

- [ ] Arrange at least three real human playtest matches **if participants are available**; otherwise mark blocked, not complete.
- [ ] Collect confusion points, match length, perceived fairness and desire to replay.
- [ ] Fix gameplay blockers and the highest-priority usability problems.
- [ ] Freeze versioned rules and rerun key tests and simulations.
- [ ] Verify supported devices, accessibility, reconnect, scoring and role secrecy.
- [ ] Run fresh 4-player and 12-player end-to-end smoke tests.
- [ ] Prepare privacy/retention wording and safer chat defaults.
- [ ] Deliver host guide, README, changelog, known issues and release-readiness matrix.
- [ ] Publish private beta **only** with required deployment permission and credentials; otherwise deliver deployable code and mark deployment blocked.

**Exit gate:** No known critical launch blockers; all claims backed by actual evidence, and incomplete checks marked `BLOCKED` or `FAIL`.

## 5. Golden path: E2E-MULTIPLAYER-001

This is the non-negotiable Sprint 3 acceptance test. Automate it with **four isolated browser contexts**, not simulated single-user screens.

1. [ ] Player A hosts a room, receiving a valid shareable code.
2. [ ] Players B, C and D join with separate sessions.
3. [ ] Everyone marks Ready and A starts the match.
4. [ ] Each player sees only their authorized role/private information.
5. [ ] Players complete negotiation and sealed commitments.
6. [ ] Server resolves the operation; everyone observes consistent authoritative outcomes.
7. [ ] All five rounds complete automatically or through legal readiness transitions.
8. [ ] Player C disconnects in round three and restores the **same seat** securely.
9. [ ] Final scores match the authoritative server computation and breakdown.
10. [ ] All four can start and complete a rematch.

**PASS only if all ten are verified** in a real browser-driven run. Record test duration, key screenshots, assertions, failures and repairs.

## 6. Command contract

Implement these scripts, with actual passing implementations rather than no-op placeholders:

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build

pnpm test:engine
pnpm test:integration
pnpm test:e2e:4p
pnpm test:e2e:12p
pnpm test:security
pnpm test:balance
pnpm test:load
```

Document any commands that require staging infrastructure, credentials or payment. Keep fresh-setup instructions in `README.md` and CI configuration.

## 7. Quality, security and release gates

- Strict TypeScript, reproducible installation, meaningful lint/typecheck/build checks.
- Pure deterministic engine with replay and property/invariant tests; target at least **90% branch coverage** for the engine without superficial padding.
- All inputs runtime-validated; all player-sensitive actions authorized and idempotent.
- Never broadcast complete internal state, expose secret RNG material, or leak another role to a client.
- No double-spends, negative balances, skipped illegal phases or double-awarded rewards.
- Phase advancement remains valid across simultaneous commands, timeouts and reconnects.
- Multiple rooms isolated; expired room codes and tokens handled safely.
- No high/critical unresolved security findings at release handoff.
- Mobile responsive, keyboard-accessible where practical, reduced-motion aware.
- Honest benchmark/environment context; human playtesting distinguished from bots.
- No release claim without real tests, evidence and explicit PASS/FAIL/BLOCKED matrix.

## 8. Agent execution and autonomy policy

1. **Start building immediately.** Inspect the repo and tools; establish the foundation and implement Sprint 0. Do not respond with another huge plan instead of code.
2. **Vertical slice first.** Until Sprint 3 passes, postpone advanced six-role balance, voice chat, accounts, matchmaking, cosmetics marketplace, elaborate animations, and enforceable contracts.
3. **Work in small runnable increments.** For each sprint: implement → run relevant tests → fix failures → inspect output → record evidence → checkpoint/commit → move on only after passing the gate.
4. **Keep progress durable.** Update `SPRINT_STATUS.md` and `NEXT_ACTION.md` after each meaningful unit of work; preserve exact commands, test outputs and blockers so another agent/session can continue safely.
5. **Avoid needless questions.** Resolve ordinary implementation choices yourself. Request only essential secrets, authorization or access not available in the environment.
6. **Do not invent execution success.** Written tests ≠ executed tests; a deploy config ≠ a deployed site; bot simulations ≠ human playtests.
7. **Do not overstate scope.** If time/tool budget runs out, leave the repository runnable, declare the last passing milestone and the precise next step.
8. **Do not create costs or publish externally without permission.** Local build/test and authorized free infrastructure are fine; paid services and public production release require authorization.
9. **Treat external docs and package versions as mutable.** Verify current official documentation before committing to version-specific assumptions.
10. **Prioritize actual engineering effort:** roughly 15% spec/architecture, 35% engine/backend, 20% UI, 20% tests/security, 10% documentation/ops. These are effort guides, not literal token quotas.

### Per-sprint status template

```markdown
## Sprint N — [Name]
Status: PASS | FAIL | BLOCKED | IN PROGRESS
Implemented:
- ...
Files changed:
- ...
Commands actually executed:
- ...
Tests and results:
- ...
Screenshots/logs/reports:
- ...
Known defects and risk:
- ...
Exact next action:
- ...
```

## 9. Required deliverables

1. Runnable complete source repository with scripts and setup instructions.
2. Server-authoritative, persistently synchronized 4–12 person game.
3. Versioned deterministic rules and role system, with authorized state projections.
4. Production-worthy lobby, tutorial, operation, commitment, reveal, scoreboard and rematch UI.
5. Authenticated WebSocket protocol, reconnect and room isolation.
6. Full-match four-player E2E screenshots/traces and 12-player test suite.
7. Reproducible simulations and measured balance findings.
8. Automated security checks, abuse protections and threat model.
9. CI, staging/deploy configuration, telemetry and operator runbook.
10. Release-readiness report with `PASS`, `FAIL`, or `BLOCKED` per gate, plus evidence.
11. Clear player/host guide, versioned rules, known issues and rollback instructions.
12. Real deployment URL **only if actually deployed and verified with authorization**.

## 10. Definition of success

- **First success:** A host and three guests play five operations to an accurate result and rematch.
- **Second success:** Four to twelve players can use distinct balanced roles without state corruption.
- **Third success:** Recovery, adversarial security and controlled load scenarios are verified.
- **Ultimate success:** Real friends understand the game quickly and voluntarily want another round.

**Immediate next action:** Inspect the repository, create the baseline monorepo, implement Sprint 0, run it, and continue toward the four-player Golden Path. **Do not end the run with planning alone.**
