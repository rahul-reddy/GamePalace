# Balance: method, results and limits

## How the simulations work

`packages/test-bots` plays complete matches against the real engine, with no networking. Every
bot sees only its own redacted `PlayerView`, exactly what a human gets, and must pass every
engine rule. After every command the simulator checks the engine invariants (credits within
[0, 30], influence never decreasing, legal phase transitions, commitments within 0-3, each
operation resolved once, pools never overpaid, nothing paid on failure).

- **Strategies:** random legal, conservative (commits 1 only on strong odds), aggressive (always
  the maximum), cooperative (proposes table-wide deals and keeps them), opportunist (expected-value
  commits, buys intel when uncertain), detective (EV commits, distrusts promise-breakers, accuses
  on evidence), saboteur-style (promises big, commits selectively, sabotages eagerly), and an
  exploit seeker that also sends illegal commands to prove they are refused.
- **Role play:** every strategy uses its secret ability sensibly (insiders read odds, auditors check
  players who sat out failed operations, fixers insure likely backers, saboteurs hit later rounds
  and keep their own credits out, forecasters predict only when confident) and accuses only on
  evidence it actually holds.
- **Match plan:** player counts cycle 4-12; every fifth table is *matched* (all seats play the same
  strategy, so role and seat are the main differences); every tenth match is a quick match; one
  match in seven has players dropping out for whole phases.
- **Reproducibility:** `pnpm test:balance` runs 10,000 matches with base seed
  `syndicate-balance-v2`. The same seed, count and rules version reproduce the report exactly,
  whatever the number of worker threads.

## How to read the tables

*Win rate* gives a k-way shared win 1/k to each winner. *Expected* is the rate if every seat were
equally likely to win (average of 1/players). Intervals are 95% Wilson intervals. A delta above
5 percentage points is flagged INVESTIGATE: a diagnostic threshold, not a significance test.
Strategy deltas measure skill differences between bots, so they are expected; role deltas in
**matched** tables are the fairness signal.

## Tuning history (rules 2.0.0)

| Pass | Matches | Finding | Change |
| --- | ---: | --- | --- |
| 1.0.0 baseline | 300 | Seat 1 won 38.7% of matched games (expected 14.2%) | Seeded remainder tie-break |
| 1.0.0 baseline | 300 | Always committing the maximum won +9 pp | Smaller pools and per-credit cap in 2.0.0 |
| 2.0.0 pass 1 | 900 | Opportunist +21 pp, Insider −11, Fixer −8, Auditor −7; 92% of accusations "correct" because everyone accused exposed saboteurs | Forecast reward 3→2, Insider tip, Fixer 2 charges and premium 2, no accusing exposed players, gentler exposure |
| 2.0.0 pass 2 | 900 | Saboteur +12 (exposure cost nothing), Auditor −7 | Exposure fine, Saboteur reward 4→3, Auditor background check over the whole record |
| 2.0.0 pass 3 | 1,800 + 10,000 | All archetypes within ±5 pp; Kingmaker +6.3, Opportunist +6.4, Informant/Underwriter about −4.8; Backer/Clean Hands objectives 86%, Contrarian 13% | Wrong forecast costs 1; objective thresholds; variant numbers |
| 2.0.0 pass 4 | 10,000 | Archetypes within ±4.1 pp; Informant +10, Kingmaker −6 | Kingmaker +3 with 3 other backers, Informant and Underwriter 2 charges |
| 2.0.0 final | 10,000 | see below | none |

Pass 3 and pass 4 reports are kept in `docs/balance/`.

## Final results (rules 2.0.0, 10,000 matches)

Full report: [`docs/balance/report-2.0.0-final.md`](balance/report-2.0.0-final.md). Reproduce with
`pnpm test:balance` (about 23 minutes on 8 worker threads).

- **Integrity:** 10,000 of 10,000 matches finished; 0 invariant violations; 0 illegal moves by
  legal strategies (the exploit seeker's illegal probes were all refused).
- **Roles (matched tables, the fairness signal):** every archetype is within ±3.7 pp of
  expectation (Auditor −1.1, Broker +1.9, Fixer −2.7, Insider +1.1, Opportunist +3.7,
  Saboteur −2.6). Eleven of twelve variants are within ±5 pp; the Opportunist variant is +6.1 pp
  (95% CI 17.6%-21.2% against 13.2% expected) and Kingmaker sits exactly at +5.0.
- **First mover:** no seat deviates more than 2.2 pp in matched tables; all intervals contain the
  expected rate.
- **Ties** for first: 1.3% of mixed-strategy matches. **Comebacks** (winner outside the top half
  after round 2): 20.2%.
- **Score spread:** mean winning score 14.8, median player 10.1.
- **No dominant commitment pattern:** always committing the maximum (aggressive bot) wins 18.7%
  against 12.4% expected, below the selective expected-value strategy (20.1%) and not far above
  the detective (16.4%); always committing little (conservative) loses (6.1%). Commitment sizes
  are spread across 0-3.
- **Sabotage:** sabotaged operations fail 56.9% of the time against 37.6% for clean ones; 67.4% of
  sabotages are exposed by the end; 41% of accusations are correct.
- **Objectives:** completion ranges from 24% (Promise Keeper) to 69% (Backer), with Clean Hands an
  outlier at 86% (its bonus was cut to +1 to compensate).
- **Only 1.4%** of commitment decisions had no real choice (zero credits).

## What these numbers do not show

- **Bots are not people.** They do not bluff in chat, read faces or hold grudges. The numbers find
  broken rules and dominant strategies; they cannot show that the game is fun or fair for humans.
- **Strategy deltas are skill.** The selective and detective strategies beat random play, as they
  should.
- **Open items for human playtests:** whether the Opportunist variant (+6.1 pp) and Kingmaker
  (+5.0 pp) feel strong, whether 75 seconds of negotiation is enough at 10-12 players, whether
  Clean Hands is too easy, and whether exposure (two in three saboteurs by the end) is too likely.
  Human playtests are listed as not yet done in the release readiness report.
