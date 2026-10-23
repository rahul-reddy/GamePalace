# Operations runbook

## Environments

| Environment | Worker name | How it is deployed |
| --- | --- | --- |
| local | `wrangler dev` | `pnpm dev` (Worker :8787, Vite :5173) |
| staging | `the-syndicate-staging` | `scripts/deploy.ps1 -Environment staging` |
| production | `the-syndicate` | `scripts/deploy.ps1 -Environment production` |

Both deployed environments use the same code and bindings (`apps/worker/wrangler.jsonc`), each
with its own Durable Object namespaces, so staging rooms never touch production. `TEST_MODE` is
`"0"` in both; never change that, because it enables test-only endpoints.

**Status (2026-10-23):** staging is deployed at https://the-syndicate-staging.syndicate-worker.workers.dev (Workers Free plan). Production is not
deployed. Credentials: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the repository's
git-ignored `.env` (read by the deploy script, never printed), or a prior `wrangler login`.

## Deploy

Deploys are manual, ship only commits already on `origin/main`, and are never run by CI.

```powershell
pwsh -NoProfile -File the-syndicate/scripts/deploy.ps1 -Sha <commit> -Environment staging -AcceptedMonthlyBudgetUsd 0
```

The script verifies that the commit is on `origin/main` and asks you to type `deploy <short-sha>`.
It then builds from `git archive` of that commit (never the working tree; this bundling step is
self-tested in CI) and runs `wrangler deploy` with `REVISION=<sha>`.

1. Deploy to **staging**, open it on two phones and play a quick 4-player match, and run the
   browser suites against it: `E2E_BASE_URL=https://<staging-host> pnpm test:e2e`. (The
   scoreboard-versus-server-replay check needs test-only endpoints and is skipped there; every
   other check runs.)
2. `GET https://<staging-host>/api/health` must show `"revision": "<sha>"` and `"rules": "2.0.0"`.
3. Deploy the same SHA to **production**, check `/api/health` again.

**Effect on live rooms:** a deploy disconnects every WebSocket. Clients reconnect automatically
and resume their seats; state, deadlines (alarms) and seat tokens live in Durable Object storage
and survive (proven by `pnpm test:recovery`, which kills the runtime mid-match). Rooms keep
their rules version. Stored state from older code is upgraded on load. Avoid deploying during
peak play anyway: players see a "reconnecting" banner for a few seconds.

**Durable Object migrations:** the classes are declared once (`migrations` tag `v1`). Renaming or
deleting a class needs a new migration tag. Deleting a class destroys its rooms: that is a
destructive migration and needs explicit owner approval.

## Rollback

Run the deploy script with the previous good SHA (`git log origin/main`). The rules versions in
`config/` are additive, so rooms created on the newer code keep working after a rollback only if
their rules version still exists in the older code. If a new rules version is being rolled back,
wait for rooms on it to finish (at most 12 hours) or accept that those rooms will fail to load
with a clear error.

## Monitoring

- **Health:** `GET /api/health` (revision, rules version, protocol). Point an uptime checker at it.
- **Logs and traces:** `observability` is enabled in `wrangler.jsonc`; view them in the Cloudflare
  dashboard (Workers > the-syndicate > Logs) or `wrangler tail`. The Worker logs only error class
  names, never tokens, names or chat.
- **What to watch:** 5xx rate on `/api/*`, 429 rate (abuse or a misbehaving client), Durable Object
  errors ("Uncaught" in logs), CPU time per request, and the account's usage page for the Free
  plan limits below.

## Incidents

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Everyone sees "Reconnecting" | Deploy or platform incident | Wait; check Cloudflare status; check `/api/health`. |
| One room stuck in a phase | Alarm not firing | Any player reconnecting runs the overdue deadline (every command and hello applies passed deadlines first). Check logs for that room's errors. |
| `Uncaught` errors loading rooms after a deploy | Stored state from incompatible code | Roll back to the previous SHA; add a state upgrade in `deserialize`. |
| 429s for real players | Shared network (school, office) hitting per-IP limits | Raise limits in `apps/worker/src/limiter.ts` and redeploy. |
| Free plan limit reached | Popularity | Move to Workers Paid ($5/month); see cost model. |

## Abuse handling

- Players: the host can mute anyone and kick outside matches; rooms can be preset-chat only.
- Room spam: creation is limited to 10 per IP per 10 minutes; codes expire with their room.
- There is no global moderation queue or report inbox yet (known issue). Rooms are private and
  short-lived (at most 12 hours) and keep no history after they close.

## Cost model (source: Cloudflare pricing pages, read 2026-10-23; pages dated 2026-10-02 and 2026-10-18)

Static assets are free and unlimited. The Worker and Durable Objects are the only metered parts.

**Per standard match with 8 players (assumptions, not measurements):** about 500 inbound socket
messages (60 per player: hello, readiness, commits, chat), 30 alarms, 20 HTTP calls.

| Resource | Per match (estimate) | Free plan daily allowance | Free plan matches/day | Paid ($5/month) included |
| --- | ---: | ---: | ---: | --- |
| Worker requests | ~30 | 100,000 | ~3,000 | 10M/month |
| DO requests (sockets billed 20:1 + alarms + RPC) | ~80 | 100,000 | ~1,200 | 1M/month, then $0.15/M |
| DO duration (128 MB, assume ~2 min awake) | ~15 GB-s | 13,000 GB-s | ~850 | 400k GB-s/month, then $12.50/M GB-s |
| SQL rows written (~3 per accepted command) | ~1,500 | 100,000 | **~65** | 50M/month, then $1.00/M |
| SQL stored (rooms deleted after close) | < 1 MB | 5 GB | n/a | 5 GB-month |

- **Free plan:** about **65 standard matches per day**, limited by SQL rows written. Plenty for
  friends; a public launch should use the Paid plan.
- **Paid plan ($5/month minimum):** included rows written cover about 33,000 matches a month; each
  further match costs roughly $0.0015 in rows written plus about $0.0002 in duration.
- **Biggest lever if usage grows:** stop writing the full state on chat messages (store chat in a
  separate table) and batch the command log; that would cut rows written by roughly half.

Re-measure these assumptions on staging with Cloudflare's usage graphs before relying on them.

## Data retention and privacy

Rooms store nicknames, avatars, chat and game state, and delete all of it when they close (idle
30 minutes between matches, 2 hours without any command, or 12 hours after creation). Nothing is
kept after that. No accounts, emails or analytics.
