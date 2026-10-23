# GamePalace plan

## Direction
GamePalace hosts original, server-authoritative multiplayer browser games that friends can play
on phones and desktops with no accounts or downloads. Each game lives in its own top-level folder
as a self-contained pnpm monorepo. The first game is THE SYNDICATE (`the-syndicate/`): a 4-12
player social deception and negotiation game; its rules, architecture and balance evidence live in
`the-syndicate/docs/`.

## Decisions
- 2026-10-23: Review harness copied from TenFold at commit `336a043` ("feat: run the Gemini
  reviewer through the Antigravity CLI (#141)"). Sync later by diffing `scripts/` against TenFold.
- 2026-10-23: One repository, many games. Harness and CI at the root; critical-path patterns and
  the CI verify loop are folder-agnostic (`^[^/]+/...`, every folder with a pnpm workspace), so a
  new game is covered without editing the gate.
- 2026-10-23: The repository stays public as the owner created it (the playbook default is
  private). Consequences: branch protection is available and is used to require the CI check;
  nothing secret may ever be committed. Owner to confirm.
- 2026-10-23: THE SYNDICATE stack: TypeScript strict, pnpm workspaces, React + Vite + Tailwind,
  Cloudflare Workers + one SQLite-backed Durable Object per room with hibernatable WebSockets and
  alarm-driven deadlines, Vitest, Playwright. Integration tests run against a real local
  `wrangler dev` (workerd), not mocks.
- 2026-10-23: Delivery: no container registry. The Worker and static assets are built from
  source and deployed by a manual script that ships only an `origin/main` commit after a typed
  confirmation. No deploy happens without a Cloudflare account the owner provides.
