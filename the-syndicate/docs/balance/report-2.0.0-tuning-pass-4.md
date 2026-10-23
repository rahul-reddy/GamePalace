# Balance simulation report

- Rules version: 2.0.0
- Base seed: `syndicate-balance-v2`; matches: 10000 (re-run with the same seed, count and rules to reproduce exactly)
- Finished: 10000; wall time 1729.3 s on 8 worker(s)
- Invariant violations: 0; unexpected rejections: 0
- Ties for first: 1.7% overall, 1.1% in mixed-strategy tables
- Comeback wins (winner outside the top half after round 2): 19.6%
- Mean winning score 14.9, mean median score 10.1, mean first-minus-median gap 4.7
- Commitment decisions with no real choice (0 credits): 1.4%
- Mean credits at end: 6.2

Simulated agents are not humans: these numbers find broken rules and dominant strategies; they do not prove human balance.
The 5-point flag is a diagnostic threshold, not a significance test; compare each delta with its confidence interval.

### Win rate by strategy (all tables)

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| aggressive | 10243 | 18.8% | 12.4% | 6.4 | 18.1%-19.6% | INVESTIGATE |
| conservative | 10495 | 6.0% | 12.5% | -6.6 | 5.5%-6.4% | INVESTIGATE |
| cooperative | 10436 | 8.9% | 12.5% | -3.6 | 8.4%-9.5% |  |
| detective | 10486 | 16.3% | 12.6% | 3.7 | 15.6%-17.1% |  |
| exploiter | 7956 | 9.6% | 12.5% | -2.9 | 8.9%-10.2% |  |
| opportunist | 10260 | 13.2% | 12.4% | 0.8 | 12.6%-13.9% |  |
| random | 10085 | 6.8% | 12.6% | -5.8 | 6.4%-7.3% | INVESTIGATE |
| saboteur | 10035 | 19.9% | 12.4% | 7.5 | 19.2%-20.7% | INVESTIGATE |

### Win rate by seat in matched tables (first-mover check)

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| seat 1 | 2001 | 16.6% | 14.1% | 2.4 | 15.0%-18.3% |  |
| seat 2 | 2001 | 12.4% | 14.1% | -1.8 | 11.0%-13.9% |  |
| seat 3 | 2001 | 14.4% | 14.1% | 0.3 | 12.9%-16.0% |  |
| seat 4 | 2001 | 14.1% | 14.1% | -0.0 | 12.7%-15.7% |  |
| seat 5 | 1777 | 13.7% | 12.7% | 0.9 | 12.2%-15.3% |  |
| seat 6 | 1555 | 11.3% | 11.7% | -0.4 | 9.8%-13.0% |  |
| seat 7 | 1333 | 10.9% | 10.9% | -0.0 | 9.3%-12.7% |  |
| seat 8 | 1111 | 8.5% | 10.2% | -1.7 | 7.0%-10.3% |  |
| seat 9 | 889 | 9.1% | 9.6% | -0.5 | 7.4%-11.2% |  |
| seat 10 | 666 | 8.5% | 9.1% | -0.6 | 6.6%-10.9% |  |
| seat 11 | 444 | 8.5% | 8.7% | -0.2 | 6.3%-11.5% |  |
| seat 12 | 222 | 8.1% | 8.3% | -0.2 | 5.2%-12.5% |  |

### Win rate by role archetype in matched tables

Matched tables give every seat the same strategy, so differences come from the role (and luck).

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| auditor | 2667 | 11.9% | 12.9% | -1.0 | 10.7%-13.1% |  |
| broker | 2622 | 10.6% | 12.3% | -1.7 | 9.5%-11.8% |  |
| fixer | 2610 | 11.0% | 12.4% | -1.4 | 9.8%-12.2% |  |
| insider | 2627 | 16.1% | 12.4% | 3.8 | 14.8%-17.6% |  |
| opportunist | 2585 | 15.8% | 12.3% | 3.5 | 14.5%-17.3% |  |
| saboteur | 2890 | 9.9% | 12.7% | -2.8 | 8.9%-11.1% |  |

### Win rate by role variant in matched tables

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| auditor | 2001 | 13.0% | 14.1% | -1.2 | 11.6%-14.5% |  |
| broker | 1830 | 13.5% | 13.2% | 0.3 | 12.0%-15.2% |  |
| fixer | 1843 | 10.5% | 13.3% | -2.8 | 9.2%-12.0% |  |
| informant | 784 | 20.3% | 10.1% | 10.2 | 17.7%-23.3% | INVESTIGATE |
| insider | 1843 | 14.4% | 13.3% | 1.0 | 12.8%-16.0% |  |
| inspector | 666 | 8.6% | 9.1% | -0.6 | 6.7%-10.9% |  |
| kingmaker | 792 | 3.8% | 10.2% | -6.3 | 2.7%-5.4% | INVESTIGATE |
| mole | 889 | 10.9% | 9.6% | 1.3 | 9.0%-13.1% |  |
| opportunist | 1818 | 19.1% | 13.2% | 5.9 | 17.4%-21.0% | INVESTIGATE |
| saboteur | 2001 | 9.5% | 14.1% | -4.6 | 8.3%-10.9% |  |
| speculator | 767 | 8.0% | 10.1% | -2.2 | 6.3%-10.1% |  |
| underwriter | 767 | 12.1% | 10.2% | 1.9 | 10.0%-14.6% |  |

### Win rate by role archetype (all tables)

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| auditor | 13333 | 9.4% | 12.9% | -3.4 | 9.0%-10.0% |  |
| broker | 13047 | 11.1% | 12.3% | -1.2 | 10.6%-11.7% |  |
| fixer | 13044 | 11.1% | 12.4% | -1.3 | 10.6%-11.6% |  |
| insider | 13032 | 16.5% | 12.4% | 4.1 | 15.8%-17.1% |  |
| opportunist | 13096 | 16.0% | 12.3% | 3.7 | 15.4%-16.7% |  |
| saboteur | 14444 | 11.0% | 12.7% | -1.7 | 10.5%-11.6% |  |

### Win rate by archetype and table size (all tables)

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| auditor @ 4-5p | 2223 | 17.8% | 22.5% | -4.7 | 16.3%-19.5% |  |
| auditor @ 6-8p | 3333 | 8.2% | 14.5% | -6.3 | 7.3%-9.1% | INVESTIGATE |
| auditor @ 9-12p | 7777 | 7.6% | 9.4% | -1.8 | 7.0%-8.2% |  |
| broker @ 4-5p | 1393 | 24.8% | 22.0% | 2.8 | 22.6%-27.2% |  |
| broker @ 6-8p | 4154 | 13.5% | 14.2% | -0.7 | 12.5%-14.6% |  |
| broker @ 9-12p | 7500 | 7.3% | 9.5% | -2.2 | 6.7%-7.9% |  |
| fixer @ 4-5p | 1387 | 20.7% | 22.1% | -1.4 | 18.6%-22.9% |  |
| fixer @ 6-8p | 4166 | 12.3% | 14.2% | -1.9 | 11.4%-13.4% |  |
| fixer @ 9-12p | 7491 | 8.6% | 9.5% | -0.9 | 8.0%-9.3% |  |
| insider @ 4-5p | 1402 | 26.4% | 22.0% | 4.3 | 24.1%-28.7% |  |
| insider @ 6-8p | 4179 | 19.1% | 14.2% | 4.9 | 18.0%-20.3% |  |
| insider @ 9-12p | 7451 | 13.1% | 9.5% | 3.6 | 12.4%-13.9% |  |
| opportunist @ 4-5p | 1375 | 29.7% | 21.9% | 7.8 | 27.4%-32.2% | INVESTIGATE |
| opportunist @ 6-8p | 4166 | 19.5% | 14.2% | 5.3 | 18.3%-20.7% | INVESTIGATE |
| opportunist @ 9-12p | 7555 | 11.6% | 9.5% | 2.1 | 10.9%-12.4% |  |
| saboteur @ 4-5p | 2223 | 18.7% | 22.5% | -3.8 | 17.1%-20.4% |  |
| saboteur @ 6-8p | 3333 | 11.3% | 14.5% | -3.2 | 10.2%-12.4% |  |
| saboteur @ 9-12p | 8888 | 9.0% | 9.6% | -0.6 | 8.5%-9.6% |  |

### Sabotage and detection

- Sabotage uses: 18392; sabotaged operations failed 56.9% of the time vs 37.6% for unsabotaged operations
- Saboteur paid (operation failed with enough other backers): 56.1%
- Sabotage exposed by the end of the match: 67.4%
- Accusations: 10886; correct 40.7%
- Ability uses: broker 16857, forecast 30118, insure 28986, investigate 29186, peek 29113, sabotage 18392

### Hidden objectives

| Objective | Assigned | Completed |
| --- | ---: | ---: |
| backer | 9949 | 69.2% |
| cleanHands | 9994 | 85.9% |
| contrarian | 10042 | 37.6% |
| dealmaker | 10004 | 42.6% |
| highRoller | 9966 | 27.2% |
| investor | 10055 | 47.4% |
| promiseKeeper | 9999 | 24.3% |
| reserve | 9987 | 28.6% |

### Commitment sizes

- 0 credits: 21.8%
- 1 credits: 9.6%
- 2 credits: 15.9%
- 3 credits: 52.6%

### Operation outcomes

- HIGH ABANDONED: 633
- HIGH FAILURE: 9526
- HIGH SUCCESS: 5797
- LOW ABANDONED: 20
- LOW FAILURE: 4294
- LOW SUCCESS: 11682
- MEDIUM ABANDONED: 364
- MEDIUM FAILURE: 6860
- MEDIUM SUCCESS: 8824

### By player count

| Players | Matches | Mean top score | Mean median score | Ties |
| ---: | ---: | ---: | ---: | ---: |
| 4 | 1112 | 13.5 | 9.7 | 11 |
| 5 | 1111 | 13.9 | 9.8 | 11 |
| 6 | 1111 | 14.4 | 10.2 | 21 |
| 7 | 1111 | 14.8 | 10.3 | 25 |
| 8 | 1111 | 15.6 | 10.8 | 17 |
| 9 | 1111 | 15.1 | 10.1 | 20 |
| 10 | 1111 | 15.0 | 9.8 | 14 |
| 11 | 1111 | 15.5 | 10.2 | 24 |
| 12 | 1111 | 15.9 | 10.4 | 22 |
