# Balance simulation report

- Rules version: 2.0.0
- Base seed: `syndicate-balance-v2`; matches: 10000 (re-run with the same seed, count and rules to reproduce exactly)
- Finished: 10000; wall time 1367.6 s on 8 worker(s)
- Invariant violations: 0; unexpected rejections: 0
- Ties for first: 1.8% overall, 1.3% in mixed-strategy tables
- Comeback wins (winner outside the top half after round 2): 20.2%
- Mean winning score 14.8, mean median score 10.1, mean first-minus-median gap 4.7
- Commitment decisions with no real choice (0 credits): 1.4%
- Mean credits at end: 6.2

Simulated agents are not humans: these numbers find broken rules and dominant strategies; they do not prove human balance.
The 5-point flag is a diagnostic threshold, not a significance test; compare each delta with its confidence interval.

### Win rate by strategy (all tables)

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| aggressive | 10243 | 18.7% | 12.4% | 6.3 | 17.9%-19.5% | INVESTIGATE |
| conservative | 10495 | 6.1% | 12.5% | -6.4 | 5.6%-6.6% | INVESTIGATE |
| cooperative | 10436 | 8.9% | 12.5% | -3.6 | 8.3%-9.4% |  |
| detective | 10486 | 16.4% | 12.6% | 3.8 | 15.7%-17.1% |  |
| exploiter | 7956 | 9.6% | 12.5% | -2.9 | 8.9%-10.2% |  |
| opportunist | 10260 | 13.0% | 12.4% | 0.6 | 12.4%-13.7% |  |
| random | 10085 | 6.9% | 12.6% | -5.7 | 6.4%-7.4% | INVESTIGATE |
| saboteur | 10035 | 20.1% | 12.4% | 7.6 | 19.3%-20.9% | INVESTIGATE |

### Win rate by seat in matched tables (first-mover check)

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| seat 1 | 2001 | 16.3% | 14.1% | 2.2 | 14.8%-18.0% |  |
| seat 2 | 2001 | 12.9% | 14.1% | -1.2 | 11.5%-14.5% |  |
| seat 3 | 2001 | 14.1% | 14.1% | -0.1 | 12.6%-15.7% |  |
| seat 4 | 2001 | 14.4% | 14.1% | 0.2 | 12.9%-16.0% |  |
| seat 5 | 1777 | 13.5% | 12.7% | 0.8 | 12.0%-15.2% |  |
| seat 6 | 1555 | 11.8% | 11.7% | 0.1 | 10.3%-13.6% |  |
| seat 7 | 1333 | 10.2% | 10.9% | -0.7 | 8.7%-12.0% |  |
| seat 8 | 1111 | 9.0% | 10.2% | -1.2 | 7.5%-10.8% |  |
| seat 9 | 889 | 9.1% | 9.6% | -0.5 | 7.4%-11.2% |  |
| seat 10 | 666 | 8.1% | 9.1% | -1.1 | 6.2%-10.4% |  |
| seat 11 | 444 | 8.0% | 8.7% | -0.7 | 5.9%-10.9% |  |
| seat 12 | 222 | 7.5% | 8.3% | -0.8 | 4.7%-11.7% |  |

### Win rate by role archetype in matched tables

Matched tables give every seat the same strategy, so differences come from the role (and luck).

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| auditor | 2667 | 11.8% | 12.9% | -1.1 | 10.7%-13.1% |  |
| broker | 2622 | 14.2% | 12.3% | 1.9 | 13.0%-15.6% |  |
| fixer | 2610 | 9.7% | 12.4% | -2.7 | 8.7%-10.9% |  |
| insider | 2627 | 13.5% | 12.4% | 1.1 | 12.2%-14.8% |  |
| opportunist | 2585 | 16.0% | 12.3% | 3.7 | 14.6%-17.4% |  |
| saboteur | 2890 | 10.1% | 12.7% | -2.6 | 9.1%-11.3% |  |

### Win rate by role variant in matched tables

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| auditor | 2001 | 12.8% | 14.1% | -1.3 | 11.4%-14.3% |  |
| broker | 1830 | 13.8% | 13.2% | 0.6 | 12.3%-15.5% |  |
| fixer | 1843 | 10.7% | 13.3% | -2.6 | 9.4%-12.2% |  |
| informant | 784 | 9.2% | 10.1% | -1.0 | 7.3%-11.4% |  |
| insider | 1843 | 15.3% | 13.3% | 2.0 | 13.7%-17.0% |  |
| inspector | 666 | 8.9% | 9.1% | -0.3 | 6.9%-11.3% |  |
| kingmaker | 792 | 15.2% | 10.2% | 5.0 | 12.9%-17.9% | INVESTIGATE |
| mole | 889 | 10.8% | 9.6% | 1.2 | 8.9%-13.0% |  |
| opportunist | 1818 | 19.3% | 13.2% | 6.1 | 17.6%-21.2% | INVESTIGATE |
| saboteur | 2001 | 9.8% | 14.1% | -4.3 | 8.6%-11.2% |  |
| speculator | 767 | 8.0% | 10.1% | -2.2 | 6.3%-10.1% |  |
| underwriter | 767 | 7.3% | 10.2% | -2.9 | 5.7%-9.4% |  |

### Win rate by role archetype (all tables)

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| auditor | 13333 | 9.6% | 12.9% | -3.3 | 9.1%-10.1% |  |
| broker | 13047 | 14.2% | 12.3% | 1.9 | 13.6%-14.8% |  |
| fixer | 13044 | 9.6% | 12.4% | -2.8 | 9.1%-10.1% |  |
| insider | 13032 | 14.2% | 12.4% | 1.9 | 13.6%-14.8% |  |
| opportunist | 13096 | 16.2% | 12.3% | 3.9 | 15.6%-16.9% |  |
| saboteur | 14444 | 11.3% | 12.7% | -1.4 | 10.8%-11.8% |  |

### Win rate by archetype and table size (all tables)

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| auditor @ 4-5p | 2223 | 17.8% | 22.5% | -4.7 | 16.3%-19.5% |  |
| auditor @ 6-8p | 3333 | 8.3% | 14.5% | -6.2 | 7.4%-9.2% | INVESTIGATE |
| auditor @ 9-12p | 7777 | 7.8% | 9.4% | -1.6 | 7.3%-8.4% |  |
| broker @ 4-5p | 1393 | 24.8% | 22.0% | 2.8 | 22.6%-27.2% |  |
| broker @ 6-8p | 4154 | 15.7% | 14.2% | 1.5 | 14.6%-16.8% |  |
| broker @ 9-12p | 7500 | 11.4% | 9.5% | 1.9 | 10.7%-12.1% |  |
| fixer @ 4-5p | 1387 | 20.7% | 22.1% | -1.4 | 18.6%-22.9% |  |
| fixer @ 6-8p | 4166 | 11.3% | 14.2% | -2.9 | 10.4%-12.3% |  |
| fixer @ 9-12p | 7491 | 6.6% | 9.5% | -2.9 | 6.1%-7.2% |  |
| insider @ 4-5p | 1402 | 26.4% | 22.0% | 4.3 | 24.1%-28.7% |  |
| insider @ 6-8p | 4179 | 17.4% | 14.2% | 3.2 | 16.2%-18.5% |  |
| insider @ 9-12p | 7451 | 10.2% | 9.5% | 0.7 | 9.5%-10.9% |  |
| opportunist @ 4-5p | 1375 | 29.7% | 21.9% | 7.8 | 27.4%-32.2% | INVESTIGATE |
| opportunist @ 6-8p | 4166 | 19.8% | 14.2% | 5.6 | 18.7%-21.1% | INVESTIGATE |
| opportunist @ 9-12p | 7555 | 11.8% | 9.5% | 2.3 | 11.1%-12.6% |  |
| saboteur @ 4-5p | 2223 | 18.7% | 22.5% | -3.8 | 17.1%-20.4% |  |
| saboteur @ 6-8p | 3333 | 11.5% | 14.5% | -3.0 | 10.5%-12.6% |  |
| saboteur @ 9-12p | 8888 | 9.4% | 9.6% | -0.3 | 8.8%-10.0% |  |

### Sabotage and detection

- Sabotage uses: 18392; sabotaged operations failed 56.9% of the time vs 37.6% for unsabotaged operations
- Saboteur paid (operation failed with enough other backers): 56.1%
- Sabotage exposed by the end of the match: 67.4%
- Accusations: 10826; correct 41.0%
- Ability uses: broker 16857, forecast 30118, insure 25598, investigate 29187, peek 25579, sabotage 18392

### Hidden objectives

| Objective | Assigned | Completed |
| --- | ---: | ---: |
| backer | 9949 | 69.1% |
| cleanHands | 9994 | 85.9% |
| contrarian | 10042 | 37.7% |
| dealmaker | 10004 | 42.6% |
| highRoller | 9966 | 27.2% |
| investor | 10055 | 47.4% |
| promiseKeeper | 9999 | 24.2% |
| reserve | 9987 | 28.4% |

### Commitment sizes

- 0 credits: 21.9%
- 1 credits: 9.6%
- 2 credits: 15.9%
- 3 credits: 52.6%

### Operation outcomes

- HIGH ABANDONED: 632
- HIGH FAILURE: 9526
- HIGH SUCCESS: 5798
- LOW ABANDONED: 21
- LOW FAILURE: 4297
- LOW SUCCESS: 11678
- MEDIUM ABANDONED: 361
- MEDIUM FAILURE: 6861
- MEDIUM SUCCESS: 8826

### By player count

| Players | Matches | Mean top score | Mean median score | Ties |
| ---: | ---: | ---: | ---: | ---: |
| 4 | 1112 | 13.5 | 9.7 | 11 |
| 5 | 1111 | 13.9 | 9.8 | 11 |
| 6 | 1111 | 14.4 | 10.2 | 21 |
| 7 | 1111 | 14.7 | 10.3 | 25 |
| 8 | 1111 | 15.4 | 10.8 | 23 |
| 9 | 1111 | 15.1 | 10.1 | 16 |
| 10 | 1111 | 15.0 | 9.7 | 16 |
| 11 | 1111 | 15.4 | 10.2 | 27 |
| 12 | 1111 | 15.7 | 10.4 | 34 |
