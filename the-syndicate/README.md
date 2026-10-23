# THE SYNDICATE

A social deception and negotiation game for 4-12 players, played in the browser on phones and
desktops. No accounts, no downloads, fictional credits only.

> Status: in development. See [SPRINT_STATUS.md](SPRINT_STATUS.md) for what works today and
> [NEXT_ACTION.md](NEXT_ACTION.md) for what is next. Rules: [docs/RULES.md](docs/RULES.md).

## Requirements

- Node.js 24+
- pnpm 12.12.1 (`npm i -g pnpm@12.12.1`, or `corepack enable` on Node 24)

## Install and run

```bash
cd the-syndicate
pnpm install --frozen-lockfile
pnpm dev            # Worker on :8787, web app with hot reload on http://localhost:5173
```

## Checks

| Command | What it runs |
| --- | --- |
| `pnpm lint` / `pnpm format:check` / `pnpm typecheck` | ESLint, Prettier, strict TypeScript in every package |
| `pnpm test` | Unit tests (engine, protocol, bots) |
| `pnpm test:engine` | Engine tests only |
| `pnpm test:coverage` | Engine tests with coverage (90% thresholds enforced), then all unit tests |
| `pnpm build` | Web app (Vite) and Worker bundle (`wrangler deploy --dry-run`) |
| `pnpm sim:check` | 600 seeded bot matches; fails on any invariant violation or illegal move |
| `pnpm test:balance` | 10,000 seeded bot matches with a report in `reports/balance` |
| `pnpm test:integration` | API and socket tests against a real local `wrangler dev` (needs `pnpm build` first) |
| `pnpm test:e2e` | Playwright against the built app served by the real Worker |

## Layout

```text
apps/web           React + Vite + Tailwind client
apps/worker        Cloudflare Worker: API routing, room Durable Objects
packages/game-engine  Pure deterministic rules engine (no I/O, clocks or Math.random)
packages/shared    Versioned wire protocol and Zod schemas
packages/ui        Design tokens and shared UI pieces
packages/test-bots Bot strategies, match simulator, balance statistics
config/            Versioned rule sets (a room keeps its version until it closes)
tests/             integration, security and e2e suites
docs/              Rules, architecture, security, operations
```
