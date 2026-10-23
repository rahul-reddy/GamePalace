import type { SimResult } from './runner';
import type { StrategyName } from './strategies';

export interface Rate {
  /** Winner credit (a k-way tie gives each winner 1/k). */
  wins: number;
  /** Seats observed. */
  n: number;
  /** Expected wins if every seat were equally likely to win (sum of 1/players). */
  expected: number;
}

export function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(centre - margin) / denom, (centre + margin) / denom];
}

function bump(map: Record<string, Rate>, key: string, win: number, expected: number): void {
  const r = (map[key] ??= { wins: 0, n: 0, expected: 0 });
  r.wins += win;
  r.n += 1;
  r.expected += expected;
}

export interface Aggregate {
  matches: number;
  finished: number;
  violations: string[];
  unexpectedRejections: string[];
  ties: number;
  comebacks: number;
  comebackEligible: number;
  firstMinusMedian: number[];
  winningScores: number[];
  medianScores: number[];
  forcedZero: number;
  decisions: number;
  byStrategy: Record<string, Rate>;
  bySeat: Record<string, Rate>;
  byPlayerCount: Record<
    string,
    { matches: number; meanTop: number; meanMedian: number; ties: number }
  >;
  /** Matched tables: every seat plays the same strategy, so only seat/luck differ. */
  matchedBySeat: Record<string, Rate>;
  commitHistogram: Record<string, number>;
  outcomes: Record<string, number>;
  creditsAtEnd: number[];
}

export function emptyAggregate(): Aggregate {
  return {
    matches: 0,
    finished: 0,
    violations: [],
    unexpectedRejections: [],
    ties: 0,
    comebacks: 0,
    comebackEligible: 0,
    firstMinusMedian: [],
    winningScores: [],
    medianScores: [],
    forcedZero: 0,
    decisions: 0,
    byStrategy: {},
    bySeat: {},
    byPlayerCount: {},
    matchedBySeat: {},
    commitHistogram: {},
    outcomes: {},
    creditsAtEnd: [],
  };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

export function addResult(agg: Aggregate, result: SimResult): void {
  agg.matches++;
  const results = result.state.results;
  for (const v of result.violations)
    if (agg.violations.length < 50) agg.violations.push(`${result.seed}: ${v}`);
  for (const r of result.unexpectedRejections) {
    if (agg.unexpectedRejections.length < 50) agg.unexpectedRejections.push(`${result.seed}: ${r}`);
  }
  agg.forcedZero += result.forcedZero;
  agg.decisions += result.decisions;
  if (!results || result.state.phase !== 'RESULTS') return;
  agg.finished++;
  const n = result.strategies.length;
  const winners = new Set(results.winners);
  const winShare = 1 / winners.size;
  if (winners.size > 1) agg.ties++;
  const totals = results.scores.map((s) => s.total);
  const top = Math.max(...totals);
  const med = median(totals);
  agg.firstMinusMedian.push(top - med);
  agg.winningScores.push(top);
  agg.medianScores.push(med);
  const pc = (agg.byPlayerCount[String(n)] ??= { matches: 0, meanTop: 0, meanMedian: 0, ties: 0 });
  pc.matches++;
  pc.meanTop += (top - pc.meanTop) / pc.matches;
  pc.meanMedian += (med - pc.meanMedian) / pc.matches;
  if (winners.size > 1) pc.ties++;
  const matched = new Set(result.strategies).size === 1;
  result.state.players.forEach((p, i) => {
    const strategy = result.strategies[i] as StrategyName;
    const win = winners.has(p.id) ? winShare : 0;
    bump(agg.byStrategy, strategy, win, 1 / n);
    bump(agg.bySeat, `${n}p seat ${p.seat + 1}`, win, 1 / n);
    if (matched) bump(agg.matchedBySeat, `seat ${p.seat + 1}`, win, 1 / n);
    agg.creditsAtEnd.push(p.credits);
  });
  if (result.standingsAfterRound2.length > 0) {
    agg.comebackEligible++;
    const topHalf = new Set(result.standingsAfterRound2.slice(0, Math.ceil(n / 2)));
    if ([...winners].some((w) => !topHalf.has(w))) agg.comebacks++;
  }
  for (const op of result.state.operations) {
    if (!op.result) continue;
    agg.outcomes[`${op.tier} ${op.result.status}`] =
      (agg.outcomes[`${op.tier} ${op.result.status}`] ?? 0) + 1;
    for (const payout of Object.values(op.result.payouts)) {
      const key = String(payout.committed);
      agg.commitHistogram[key] = (agg.commitHistogram[key] ?? 0) + 1;
    }
  }
}

export interface RateRow {
  key: string;
  n: number;
  winRate: number;
  expectedRate: number;
  deltaPp: number;
  ci: [number, number];
  flagged: boolean;
}

/** Rows for a rate table, flagging deviations above `thresholdPp` percentage points. */
export function rateRows(map: Record<string, Rate>, thresholdPp = 5): RateRow[] {
  return Object.entries(map)
    .map(([key, r]) => {
      const winRate = r.wins / r.n;
      const expectedRate = r.expected / r.n;
      const deltaPp = (winRate - expectedRate) * 100;
      return {
        key,
        n: r.n,
        winRate,
        expectedRate,
        deltaPp,
        ci: wilson(r.wins, r.n),
        flagged: Math.abs(deltaPp) > thresholdPp,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }));
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}
