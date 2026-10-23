---
name: gamepalace-change-workflow
description: Implement, verify, review, and hand off code or documentation changes in the GamePalace repository (multiplayer browser games such as THE SYNDICATE). Use for GamePalace development work that should follow its branch, testing, status, cross-model review, guarded-merge and manual-deploy workflow; do not use for ordinary questions about how a game is played.
---

# GamePalace change workflow

Read `AGENTS.md`, `docs/PLAN.md`, and the current handoff at the top of `STATUS.md` before changing behavior. Each game folder (for example `the-syndicate/`) also has its own README and docs; read the ones covering the code you change.

Use a focused `feat/`, `fix/`, or `docs/` branch. Inspect the worktree before editing and preserve unrelated changes. When multiple agents work concurrently, declare file ownership before editing shared files.

Keep game rules in the pure engine package and the server authoritative. Never let a client decide an outcome, see another player's secrets, or advance a phase. Changes to rules, scoring, randomness, redaction or the protocol need boundary, property or secrecy tests; UI flows need a real browser test.

Run checks that cover the changed behavior, then the game's full verification when the change is ready (from the game folder):

```powershell
pnpm install --frozen-lockfile
pnpm run lint; pnpm run format:check; pnpm run typecheck
pnpm run test:coverage; pnpm run build; pnpm run sim:check
pnpm run test:integration; pnpm run test:e2e
```

For harness changes, from the repository root:

```powershell
pwsh -NoProfile -File scripts/cross-review-selftest.ps1
uv run --no-project --with pyyaml python scripts/validate_skills.py
```

Do not claim a check passed unless it ran on the current revision. Update the current handoff in `STATUS.md` with the exact revision tested, commands run, results, limitations and next action. Keep history below the handoff.

AI-authored commits must carry the appropriate `Co-Authored-By` trailer. Open a PR, wait for CI on the final head, run `pwsh -NoProfile -File scripts/cross-review.ps1 -Number <PR>`, address or rebut every blocking finding, and merge only with `pwsh -NoProfile -File scripts/merge-pr.ps1 -Number <PR>`.

Deploying is a separate step, run only on request: use the game's deploy script, which ships a commit already on `origin/main`, requires a typed confirmation and records the deployed SHA.
