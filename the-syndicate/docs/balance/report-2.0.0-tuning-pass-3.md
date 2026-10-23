# Balance simulation report

- Rules version: 2.0.0
- Base seed: `syndicate-balance-v2`; matches: 10000 (re-run with the same seed, count and rules to reproduce exactly)
- Finished: 10000; wall time 1831.8 s on 8 worker(s)
- Invariant violations: 0; unexpected rejections: 0
- Ties for first: 1.9% overall, 1.3% in mixed-strategy tables
- Comeback wins (winner outside the top half after round 2): 20.1%
- Mean winning score 14.9, mean median score 10.2, mean first-minus-median gap 4.7
- Commitment decisions with no real choice (0 credits): 1.4%
- Mean credits at end: 6.2

Simulated agents are not humans: these numbers find broken rules and dominant strategies; they do not prove human balance.
The 5-point flag is a diagnostic threshold, not a significance test; compare each delta with its confidence interval.

### Win rate by strategy (all tables)

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| aggressive | 10243 | 18.7% | 12.4% | 6.3 | 17.9%-19.5% | INVESTIGATE |
| conservative | 10495 | 6.1% | 12.5% | -6.5 | 5.6%-6.5% | INVESTIGATE |
| cooperative | 10436 | 8.6% | 12.5% | -3.9 | 8.1%-9.2% |  |
| detective | 10486 | 16.5% | 12.6% | 3.9 | 15.8%-17.3% |  |
| exploiter | 7956 | 9.6% | 12.5% | -2.9 | 9.0%-10.3% |  |
| opportunist | 10260 | 13.2% | 12.4% | 0.7 | 12.5%-13.8% |  |
| random | 10085 | 7.1% | 12.6% | -5.5 | 6.6%-7.6% | INVESTIGATE |
| saboteur | 10035 | 19.8% | 12.4% | 7.3 | 19.0%-20.6% | INVESTIGATE |

### Win rate by seat in matched tables (first-mover check)

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| seat 1 | 2001 | 15.7% | 14.1% | 1.6 | 14.2%-17.4% |  |
| seat 2 | 2001 | 13.1% | 14.1% | -1.0 | 11.7%-14.6% |  |
| seat 3 | 2001 | 14.8% | 14.1% | 0.7 | 13.3%-16.4% |  |
| seat 4 | 2001 | 13.2% | 14.1% | -1.0 | 11.8%-14.7% |  |
| seat 5 | 1777 | 13.3% | 12.7% | 0.6 | 11.8%-15.0% |  |
| seat 6 | 1555 | 12.6% | 11.7% | 0.9 | 11.0%-14.3% |  |
| seat 7 | 1333 | 10.3% | 10.9% | -0.6 | 8.7%-12.0% |  |
| seat 8 | 1111 | 9.6% | 10.2% | -0.6 | 8.0%-11.4% |  |
| seat 9 | 889 | 8.9% | 9.6% | -0.7 | 7.2%-10.9% |  |
| seat 10 | 666 | 9.3% | 9.1% | 0.2 | 7.3%-11.8% |  |
| seat 11 | 444 | 8.0% | 8.7% | -0.8 | 5.8%-10.9% |  |
| seat 12 | 222 | 6.1% | 8.3% | -2.3 | 3.6%-10.0% |  |

### Win rate by role archetype in matched tables

Matched tables give every seat the same strategy, so differences come from the role (and luck).

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| auditor | 2667 | 12.1% | 12.9% | -0.7 | 11.0%-13.4% |  |
| broker | 2622 | 14.4% | 12.3% | 2.1 | 13.1%-15.8% |  |
| fixer | 2610 | 9.6% | 12.4% | -2.8 | 8.5%-10.8% |  |
| insider | 2627 | 13.0% | 12.4% | 0.6 | 11.8%-14.4% |  |
| opportunist | 2585 | 16.0% | 12.3% | 3.7 | 14.6%-17.4% |  |
| saboteur | 2890 | 10.2% | 12.7% | -2.6 | 9.1%-11.3% |  |

### Win rate by role variant in matched tables

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| auditor | 2001 | 13.2% | 14.1% | -1.0 | 11.8%-14.7% |  |
| broker | 1830 | 13.6% | 13.2% | 0.3 | 12.1%-15.2% |  |
| fixer | 1843 | 11.3% | 13.3% | -2.1 | 9.9%-12.8% |  |
| informant | 784 | 5.4% | 10.1% | -4.8 | 4.0%-7.2% |  |
| insider | 1843 | 16.3% | 13.3% | 2.9 | 14.7%-18.0% |  |
| inspector | 666 | 9.1% | 9.1% | -0.1 | 7.1%-11.5% |  |
| kingmaker | 792 | 16.4% | 10.2% | 6.3 | 14.0%-19.2% | INVESTIGATE |
| mole | 889 | 11.6% | 9.6% | 1.9 | 9.6%-13.8% |  |
| opportunist | 1818 | 19.6% | 13.2% | 6.4 | 17.8%-21.5% | INVESTIGATE |
| saboteur | 2001 | 9.6% | 14.1% | -4.6 | 8.3%-10.9% |  |
| speculator | 767 | 7.5% | 10.1% | -2.7 | 5.8%-9.5% |  |
| underwriter | 767 | 5.5% | 10.2% | -4.7 | 4.1%-7.3% |  |

### Win rate by role archetype (all tables)

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| auditor | 13333 | 9.8% | 12.9% | -3.1 | 9.3%-10.3% |  |
| broker | 13047 | 14.8% | 12.3% | 2.5 | 14.2%-15.4% |  |
| fixer | 13044 | 9.2% | 12.4% | -3.2 | 8.7%-9.7% |  |
| insider | 13032 | 13.8% | 12.4% | 1.4 | 13.2%-14.4% |  |
| opportunist | 13096 | 16.4% | 12.3% | 4.1 | 15.8%-17.1% |  |
| saboteur | 14444 | 11.2% | 12.7% | -1.5 | 10.7%-11.7% |  |

### Win rate by archetype and table size (all tables)

| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| auditor @ 4-5p | 2223 | 17.5% | 22.5% | -5.0 | 16.0%-19.1% |  |
| auditor @ 6-8p | 3333 | 8.7% | 14.5% | -5.8 | 7.8%-9.7% | INVESTIGATE |
| auditor @ 9-12p | 7777 | 8.0% | 9.4% | -1.4 | 7.5%-8.7% |  |
| broker @ 4-5p | 1393 | 25.2% | 22.0% | 3.2 | 23.0%-27.5% |  |
| broker @ 6-8p | 4154 | 16.7% | 14.2% | 2.5 | 15.6%-17.8% |  |
| broker @ 9-12p | 7500 | 11.9% | 9.5% | 2.3 | 11.2%-12.6% |  |
| fixer @ 4-5p | 1387 | 20.7% | 22.1% | -1.4 | 18.7%-22.9% |  |
| fixer @ 6-8p | 4166 | 11.0% | 14.2% | -3.2 | 10.1%-12.0% |  |
| fixer @ 9-12p | 7491 | 6.1% | 9.5% | -3.5 | 5.5%-6.6% |  |
| insider @ 4-5p | 1402 | 26.4% | 22.0% | 4.4 | 24.2%-28.8% |  |
| insider @ 6-8p | 4179 | 17.1% | 14.2% | 2.9 | 16.0%-18.2% |  |
| insider @ 9-12p | 7451 | 9.5% | 9.5% | -0.0 | 8.9%-10.2% |  |
| opportunist @ 4-5p | 1375 | 31.5% | 21.9% | 9.6 | 29.1%-34.0% | INVESTIGATE |
| opportunist @ 6-8p | 4166 | 19.4% | 14.2% | 5.2 | 18.2%-20.6% | INVESTIGATE |
| opportunist @ 9-12p | 7555 | 12.1% | 9.5% | 2.6 | 11.4%-12.8% |  |
| saboteur @ 4-5p | 2223 | 17.7% | 22.5% | -4.8 | 16.1%-19.3% |  |
| saboteur @ 6-8p | 3333 | 11.1% | 14.5% | -3.4 | 10.1%-12.2% |  |
| saboteur @ 9-12p | 8888 | 9.6% | 9.6% | -0.0 | 9.0%-10.2% |  |

### Sabotage and detection

- Sabotage uses: 18392; sabotaged operations failed 56.9% of the time vs 37.6% for unsabotaged operations
- Saboteur paid (operation failed with enough other backers): 56.1%
- Sabotage exposed by the end of the match: 67.4%
- Accusations: 10886; correct 40.7%
- Ability uses: broker 16857, forecast 30118, insure 28986, investigate 29186, peek 29113, sabotage 18392

### Hidden objectives

| Objective | Assigned | Completed |
| --- | ---: | ---: |
| backer | 9949 | 85.7% |
| cleanHands | 9994 | 85.9% |
| contrarian | 10042 | 12.9% |
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
| 4 | 1112 | 13.6 | 9.9 | 12 |
| 5 | 1111 | 14.0 | 9.9 | 15 |
| 6 | 1111 | 14.5 | 10.3 | 23 |
| 7 | 1111 | 14.8 | 10.3 | 24 |
| 8 | 1111 | 15.5 | 10.8 | 21 |
| 9 | 1111 | 15.2 | 10.2 | 18 |
| 10 | 1111 | 15.1 | 9.8 | 17 |
| 11 | 1111 | 15.5 | 10.2 | 24 |
| 12 | 1111 | 15.8 | 10.4 | 38 |
