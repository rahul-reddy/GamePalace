import { getRules } from '@syndicate/game-engine';
import { archetypeOf, objectiveMet } from '@syndicate/game-engine/roles';
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
  /** Ties counted only in mixed tables (identical bots tie trivially). */
  mixedMatches: number;
  mixedTies: number;
  byRole: Record<string, Rate>;
  byArchetype: Record<string, Rate>;
  /** Matched tables only: every seat plays the same strategy, so role is the main difference. */
  matchedByRole: Record<string, Rate>;
  matchedByArchetype: Record<string, Rate>;
  byPlayerCountArchetype: Record<string, Rate>;
  sabotage: {
    uses: number;
    failedWhenSabotaged: number;
    paid: number;
    exposedByEnd: number;
    opsSabotaged: number;
    opsClean: number;
    cleanFailures: number;
  };
  accusations: { total: number; correct: number };
  objectives: Record<string, { assigned: number; met: number }>;
  abilityUses: Record<string, number>;
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
    mixedMatches: 0,
    mixedTies: 0,
    byRole: {},
    byArchetype: {},
    matchedByRole: {},
    matchedByArchetype: {},
    byPlayerCountArchetype: {},
    sabotage: {
      uses: 0,
      failedWhenSabotaged: 0,
      paid: 0,
      exposedByEnd: 0,
      opsSabotaged: 0,
      opsClean: 0,
      cleanFailures: 0,
    },
    accusations: { total: 0, correct: 0 },
    objectives: {},
    abilityUses: {},
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
  if (!matched) {
    agg.mixedMatches++;
    if (winners.size > 1) agg.mixedTies++;
  }
  const rules = getRules(result.state.rulesVersion);
  const band = n <= 5 ? '4-5' : n <= 8 ? '6-8' : '9-12';
  result.state.players.forEach((p, i) => {
    const strategy = result.strategies[i] as StrategyName;
    const win = winners.has(p.id) ? winShare : 0;
    bump(agg.byStrategy, strategy, win, 1 / n);
    bump(agg.bySeat, `${n}p seat ${p.seat + 1}`, win, 1 / n);
    if (matched) bump(agg.matchedBySeat, `seat ${p.seat + 1}`, win, 1 / n);
    agg.creditsAtEnd.push(p.credits);
    if (p.role) {
      const archetype = archetypeOf(rules, p) ?? 'none';
      bump(agg.byRole, p.role, win, 1 / n);
      bump(agg.byArchetype, archetype, win, 1 / n);
      bump(agg.byPlayerCountArchetype, `${archetype} @ ${band}p`, win, 1 / n);
      if (matched) {
        bump(agg.matchedByRole, p.role, win, 1 / n);
        bump(agg.matchedByArchetype, archetype, win, 1 / n);
      }
    }
    if (p.objective) {
      const o = (agg.objectives[p.objective] ??= { assigned: 0, met: 0 });
      o.assigned++;
      if (objectiveMet(result.state, rules, p)) o.met++;
    }
  });
  const sabotagedRounds = new Set<number>();
  for (const use of result.state.abilityUses) {
    agg.abilityUses[use.ability] = (agg.abilityUses[use.ability] ?? 0) + 1;
    if (use.ability !== 'sabotage') continue;
    agg.sabotage.uses++;
    sabotagedRounds.add(use.round);
    const op = result.state.operations[use.round - 1];
    if (op?.result?.status === 'FAILURE') agg.sabotage.failedWhenSabotaged++;
    if (use.effect === 'paid') agg.sabotage.paid++;
    if (use.exposed) agg.sabotage.exposedByEnd++;
  }
  for (const op of result.state.operations) {
    if (!op.result || op.result.status === 'ABANDONED') continue;
    if (sabotagedRounds.has(op.round)) agg.sabotage.opsSabotaged++;
    else {
      agg.sabotage.opsClean++;
      if (op.result.status === 'FAILURE') agg.sabotage.cleanFailures++;
    }
  }
  for (const acc of result.state.accusations) {
    agg.accusations.total++;
    const target = result.state.players.find((x) => x.id === acc.target);
    if (target && archetypeOf(rules, target) === 'saboteur') agg.accusations.correct++;
  }
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

/** Combines aggregates computed in parallel workers. */
export function mergeAggregates(parts: Aggregate[]): Aggregate {
  const out = emptyAggregate();
  const mergeRates = (into: Record<string, Rate>, from: Record<string, Rate>) => {
    for (const [k, r] of Object.entries(from)) {
      const t = (into[k] ??= { wins: 0, n: 0, expected: 0 });
      t.wins += r.wins;
      t.n += r.n;
      t.expected += r.expected;
    }
  };
  const mergeCounts = (into: Record<string, number>, from: Record<string, number>) => {
    for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
  };
  const rateKeys = [
    'byStrategy',
    'bySeat',
    'matchedBySeat',
    'byRole',
    'byArchetype',
    'matchedByRole',
    'matchedByArchetype',
    'byPlayerCountArchetype',
  ] as const;
  for (const a of parts) {
    out.matches += a.matches;
    out.finished += a.finished;
    out.violations.push(...a.violations.slice(0, Math.max(0, 50 - out.violations.length)));
    out.unexpectedRejections.push(
      ...a.unexpectedRejections.slice(0, Math.max(0, 50 - out.unexpectedRejections.length)),
    );
    out.ties += a.ties;
    out.comebacks += a.comebacks;
    out.comebackEligible += a.comebackEligible;
    out.firstMinusMedian.push(...a.firstMinusMedian);
    out.winningScores.push(...a.winningScores);
    out.medianScores.push(...a.medianScores);
    out.forcedZero += a.forcedZero;
    out.decisions += a.decisions;
    out.mixedMatches += a.mixedMatches;
    out.mixedTies += a.mixedTies;
    for (const key of rateKeys) mergeRates(out[key], a[key]);
    for (const [k, v] of Object.entries(a.byPlayerCount)) {
      const t = (out.byPlayerCount[k] ??= { matches: 0, meanTop: 0, meanMedian: 0, ties: 0 });
      const total = t.matches + v.matches;
      t.meanTop = (t.meanTop * t.matches + v.meanTop * v.matches) / total;
      t.meanMedian = (t.meanMedian * t.matches + v.meanMedian * v.matches) / total;
      t.matches = total;
      t.ties += v.ties;
    }
    mergeCounts(out.commitHistogram, a.commitHistogram);
    mergeCounts(out.outcomes, a.outcomes);
    mergeCounts(out.abilityUses, a.abilityUses);
    out.creditsAtEnd.push(...a.creditsAtEnd);
    for (const k of Object.keys(out.sabotage) as (keyof Aggregate['sabotage'])[]) {
      out.sabotage[k] += a.sabotage[k];
    }
    out.accusations.total += a.accusations.total;
    out.accusations.correct += a.accusations.correct;
    for (const [k, v] of Object.entries(a.objectives)) {
      const t = (out.objectives[k] ??= { assigned: 0, met: 0 });
      t.assigned += v.assigned;
      t.met += v.met;
    }
  }
  return out;
}
