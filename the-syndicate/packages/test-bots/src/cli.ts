// Balance simulation CLI.
//   tsx packages/test-bots/src/cli.ts --matches 10000 --report reports/balance
//   tsx packages/test-bots/src/cli.ts --matches 600 --check
// --check exits non-zero on any invariant violation, unfinished match or illegal
// move by a strategy that should only play legally.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CURRENT_RULES_VERSION, rngFor } from '@syndicate/game-engine';
import { simulateMatch } from './runner';
import { addResult, emptyAggregate, mean, rateRows, type Aggregate } from './stats';
import { STRATEGIES, type StrategyName } from './strategies';

interface Options {
  matches: number;
  seed: string;
  report: string | null;
  check: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { matches: 1000, seed: 'syndicate-balance', report: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--matches') opts.matches = Number(argv[++i]);
    else if (arg === '--seed') opts.seed = String(argv[++i]);
    else if (arg === '--report') opts.report = String(argv[++i]);
    else if (arg === '--check') opts.check = true;
  }
  if (!Number.isInteger(opts.matches) || opts.matches < 1)
    throw new Error('--matches must be a positive integer');
  return opts;
}

/** Deterministic match plan: player counts cycle 4..12; a fifth of tables are matched (one strategy). */
export function planMatch(
  seed: string,
  index: number,
): { seed: string; strategies: StrategyName[]; quick: boolean } {
  const rng = rngFor(seed, 'plan', index);
  const players = 4 + (index % 9);
  const matchSeed = `${seed}-${index}`;
  const quick = index % 10 === 9;
  if (index % 5 === 0) {
    const s = rng.pick(STRATEGIES.filter((x) => x !== 'exploiter'));
    return { seed: matchSeed, strategies: Array.from({ length: players }, () => s), quick };
  }
  return {
    seed: matchSeed,
    strategies: Array.from({ length: players }, () => rng.pick(STRATEGIES)),
    quick,
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function table(title: string, map: Aggregate['byStrategy']): string {
  const rows = rateRows(map);
  const lines = [
    `### ${title}`,
    '',
    '| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |',
    '| --- | ---: | ---: | ---: | ---: | --- | --- |',
    ...rows.map(
      (r) =>
        `| ${r.key} | ${r.n} | ${pct(r.winRate)} | ${pct(r.expectedRate)} | ${r.deltaPp.toFixed(1)} | ${pct(r.ci[0])}-${pct(r.ci[1])} | ${r.flagged ? 'INVESTIGATE' : ''} |`,
    ),
    '',
  ];
  return lines.join('\n');
}

export function renderReport(agg: Aggregate, opts: Options, ms: number): string {
  const commitTotal = Object.values(agg.commitHistogram).reduce((s, v) => s + v, 0);
  const lines = [
    `# Balance simulation report`,
    '',
    `- Rules version: ${CURRENT_RULES_VERSION}`,
    `- Base seed: \`${opts.seed}\` (re-run with the same seed and match count to reproduce exactly)`,
    `- Matches simulated: ${agg.matches}; finished: ${agg.finished}; wall time ${(ms / 1000).toFixed(1)} s`,
    `- Invariant violations: ${agg.violations.length}; unexpected rejections: ${agg.unexpectedRejections.length}`,
    `- Ties for first: ${pct(agg.ties / Math.max(1, agg.finished))}`,
    `- Comeback wins (winner outside the top half after round 2): ${pct(agg.comebacks / Math.max(1, agg.comebackEligible))}`,
    `- Mean winning score ${mean(agg.winningScores).toFixed(1)}, mean median score ${mean(agg.medianScores).toFixed(1)}, mean first-minus-median gap ${mean(agg.firstMinusMedian).toFixed(1)}`,
    `- Commitment decisions with no real choice (0 credits): ${pct(agg.forcedZero / Math.max(1, agg.decisions))}`,
    `- Mean credits at end: ${mean(agg.creditsAtEnd).toFixed(1)}`,
    '',
    'Simulated agents are not humans: these numbers find broken rules and dominant strategies, they do not prove human balance.',
    '',
    table('Win rate by strategy (mixed and matched tables)', agg.byStrategy),
    table('Win rate by seat in matched tables (first-mover check)', agg.matchedBySeat),
    '### Commitment sizes',
    '',
    ...Object.entries(agg.commitHistogram)
      .sort()
      .map(([k, v]) => `- ${k} credits: ${pct(v / Math.max(1, commitTotal))}`),
    '',
    '### Operation outcomes',
    '',
    ...Object.entries(agg.outcomes)
      .sort()
      .map(([k, v]) => `- ${k}: ${v}`),
    '',
    '### By player count',
    '',
    '| Players | Matches | Mean top score | Mean median score | Ties |',
    '| ---: | ---: | ---: | ---: | ---: |',
    ...Object.entries(agg.byPlayerCount)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(
        ([k, v]) =>
          `| ${k} | ${v.matches} | ${v.meanTop.toFixed(1)} | ${v.meanMedian.toFixed(1)} | ${v.ties} |`,
      ),
    '',
  ];
  if (agg.violations.length)
    lines.push('### Violations', '', ...agg.violations.map((v) => `- ${v}`), '');
  if (agg.unexpectedRejections.length) {
    lines.push(
      '### Unexpected rejections',
      '',
      ...agg.unexpectedRejections.map((v) => `- ${v}`),
      '',
    );
  }
  return lines.join('\n');
}

export function runSimulations(opts: Options): Aggregate {
  const agg = emptyAggregate();
  for (let i = 0; i < opts.matches; i++) {
    const plan = planMatch(opts.seed, i);
    const result = simulateMatch({
      seed: plan.seed,
      strategies: plan.strategies,
      settings: { length: plan.quick ? 'quick' : 'standard', beginner: false },
      dropoutRate: i % 7 === 3 ? 0.15 : 0,
    });
    addResult(agg, result);
  }
  return agg;
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const agg = runSimulations(opts);
  const report = renderReport(agg, opts, Date.now() - started);
  if (opts.report) {
    mkdirSync(opts.report, { recursive: true });
    writeFileSync(join(opts.report, 'report.md'), report);
    writeFileSync(join(opts.report, 'aggregate.json'), JSON.stringify(agg, null, 2));
  }
  console.log(report);
  if (opts.check) {
    const unfinished = agg.matches - agg.finished;
    if (agg.violations.length || agg.unexpectedRejections.length || unfinished) {
      console.error(
        `sim:check FAILED: ${agg.violations.length} violations, ${agg.unexpectedRejections.length} unexpected rejections, ${unfinished} unfinished`,
      );
      process.exit(1);
    }
    console.log('sim:check passed.');
  }
}

if (process.argv[1]?.endsWith('cli.ts')) main();
