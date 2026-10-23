## Change
Describe the problem and resulting behavior.

## Verification
- [ ] Relevant tests, lint, typing and browser flows pass.
- [ ] Server authority and secrecy boundaries reviewed: no client-decided outcomes, no other
      player's secrets in any player's view, no secrets or tokens committed.
- [ ] STATUS.md and affected documentation updated.
- [ ] `scripts/cross-review.ps1 -Number <this PR>` run, with zero blocking findings on
      the current head (see AGENTS.md "Cross-model code review"). N/A only if every
      commit here is human-authored with no AI Co-Authored-By trailer.

## Limitations
State unimplemented behavior and external prerequisites explicitly. Needs a deploy? Say so.
