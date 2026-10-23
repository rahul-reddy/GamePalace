# Next action

Owner: log in to Cloudflare (`pnpm --filter @syndicate/worker exec wrangler login`) and approve a
staging deploy. Then: deploy `main` to staging with `scripts/deploy.ps1`, run
`E2E_BASE_URL=https://<staging-host> pnpm test:e2e`, play three human matches (4, 8, 12 players)
and record findings, measure latency on a dedicated load environment, then production.
