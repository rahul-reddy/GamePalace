# Known issues and limitations (prioritized)

## Blocked on things outside the repository

1. **Not deployed.** Deployment needs a Cloudflare account login and the owner's go-ahead. Everything
   needed is in place (`scripts/deploy.ps1`, `docs/OPERATIONS.md`), and the bundling step is
   self-tested.
2. **No human playtests.** All balance evidence comes from bots (`docs/BALANCE.md`). The plan asks
   for at least three real matches; that needs people. Questions to answer in those sessions are
   listed in `docs/BALANCE.md`.
3. **No production latency numbers.** Local load testing proves correctness at 100 rooms / 796
   players and meets the 250 ms p95 target for an uncontended room, but local contention numbers
   say nothing about Cloudflare. Measure on a dedicated staging environment (`docs/load/README.md`).
4. **No manual screen-reader pass.** Automated axe checks find no serious or critical issues on any
   screen; a VoiceOver/TalkBack walkthrough has not been done.

## Game and balance

5. **Opportunist variant +6.1 pp, Kingmaker +5.0 pp** above expectation in matched bot tables
   (all six archetypes are within ±3.7 pp). Watch in playtests; tune via `config/` (new rules version).
6. **Clean Hands objective is easy** (86% completion against 24-69% for the others); its bonus is
   already reduced to +1.
7. **Two in three saboteurs are exposed by the end** of a standard match in simulation. Exposure is
   meant to create tension; playtests should confirm it does not feel inevitable.
8. **12-player phone layout is a long scroll.** Complete and usable, but busy; a tabbed in-match
   layout for phones would help.

## Product

9. **No global moderation inbox or report button.** Hosts can mute, kick between matches and switch
   to preset-only chat; rooms are private and deleted within 12 hours.
10. **Profanity filtering is list-based** and English-centric.
11. **The "use on another device" link is a credential.** It is clearly labelled private and travels
    in the URL fragment (never sent to servers), but a user could still screenshot or share it.
12. **Fonts are system fonts** (no web fonts are downloaded); headings use the platform's serif.

## Operations

13. **Free plan capacity is about 65 standard matches per day** (SQL rows written); see the cost
    model. Storing chat outside the main state row would roughly halve writes.
14. **Rate-limit counters are in memory** per limiter object; an eviction resets one window.
15. **Dependabot opens separate PRs for `react` and `react-dom`**; they must be merged together.
