# THE SYNDICATE

A social deception and negotiation game for 4-12 players, played in the browser on phones and
desktops. No accounts, no downloads, fictional credits only.

Each round the table studies a risky operation, negotiates (promises are not enforced), and seals
0-3 credits in secret. Everyone holds a secret role: brokers, insiders, fixers, auditors,
opportunists, and at least one saboteur. Five operations later the final reckoning reveals every
role and explains every score. About 15-20 minutes; a quick mode takes about 10.

- How to play with friends: [docs/HOST_GUIDE.md](docs/HOST_GUIDE.md)
- Full rules: [docs/RULES.md](docs/RULES.md)
- Status: [docs/RELEASE_READINESS.md](docs/RELEASE_READINESS.md), [SPRINT_STATUS.md](SPRINT_STATUS.md),
  [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md)

## Requirements

- Node.js 24+
- pnpm 12.12.1 (`npm i -g pnpm@12.12.1`, or `corepack enable` on Node 24)
- PowerShell 7 (`pwsh`) for the deploy script and its self-test
- Playwright's Chromium for browser tests: `pnpm exec playwright install chromium`

## Install and play locally

```bash
cd the-syndicate
pnpm install --frozen-lockfile
pnpm dev            # Worker on :8787, web app with hot reload on http://localhost:5173
```

Open http://localhost:5173 in four browser windows (use private windows or different browsers, so
each one has its own seat), host in one and join with the code in the others. Other devices on
your network can use `http://<your-ip>:5173`.

## Checks

| Command | What it runs |
| --- | --- |
| `pnpm lint` / `pnpm format:check` / `pnpm typecheck` | ESLint, Prettier, strict TypeScript in every package |
| `pnpm test` | Unit tests (engine, protocol, bots) |
| `pnpm test:coverage` | Engine tests with enforced 90% coverage thresholds, then all unit tests |
| `pnpm build` | Web app (Vite) and Worker bundle (`wrangler deploy --dry-run`) |
| `pnpm sim:check` | 600 seeded bot matches; fails on any invariant violation or illegal move |
| `pnpm test:balance` | 10,000 seeded bot matches with a report in `reports/balance` (about 25 minutes) |
| `pnpm test:integration` | API, socket, role and security tests against a real local `wrangler dev` (run `pnpm build` first) |
| `pnpm test:security` | The security suite only |
| `pnpm test:recovery` | Kills the runtime mid-match and checks state, seats and alarms survive |
| `pnpm test:e2e` | All Playwright suites: smoke, accessibility, golden path, device move, 8 and 12 players |
| `pnpm test:e2e:4p` / `:8p` / `:12p` / `test:a11y` | Individual browser suites |
| `pnpm test:load` | 100 rooms against a local server, with latency percentiles in `reports/load` |
| `pwsh -NoProfile -File scripts/deploy-selftest.ps1` | Proves deploy bundles contain exactly the committed files |

Set `E2E_BASE_URL=https://<host>` to run the browser suites against a deployed environment.

## Deploy

Manual only, from a commit already on `origin/main`:

```powershell
pwsh -NoProfile -File the-syndicate/scripts/deploy.ps1 -Sha <commit> -Environment staging -AcceptedMonthlyBudgetUsd 0
```

Details, rollback, monitoring and the cost model: [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Layout

```text
apps/web              React + Vite + Tailwind client
apps/worker           Cloudflare Worker: API routing, room / directory / rate-limit Durable Objects
packages/game-engine  Pure deterministic rules engine, redaction, replay, invariants
packages/shared       Versioned wire protocol and Zod schemas
packages/ui           Design tokens and shared accessible components
packages/test-bots    Bot strategies, match simulator, balance statistics
config/               Versioned rule sets (a room keeps its version until it closes)
tests/                integration, security, recovery and e2e suites
docs/                 Rules, architecture, protocol, security, balance, operations, load, guides
scripts/              dev server, load test, deploy and its self-test
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `ERR_PNPM_IGNORED_BUILDS` | Use pnpm 12.12.1; `pnpm-workspace.yaml` allows only esbuild and workerd to run install scripts. |
| Integration tests: "wrangler dev did not become healthy" | Run `pnpm build` first; make sure ports 8790-8794 are free (a crashed earlier run may still hold one). |
| `EPERM` removing `.wrangler/*-state` | A leftover `wrangler dev` holds it; stop it (`taskkill /T /F` on Windows) and rerun. |
| Browser tests time out on a busy machine | Close other heavy processes; the golden path already uses relaxed pace. |
| "This seat is not valid in this room" | The room closed or you were removed; join again with the code. |
| "Opened somewhere else" | Your seat is active in another tab or device; press "Play here instead" to take it back. |
| Sound does not play | Sound is off by default; turn it on with the speaker button (browsers need a tap first). |
