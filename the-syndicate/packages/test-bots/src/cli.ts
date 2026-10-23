// Balance simulation CLI.
//   tsx packages/test-bots/src/cli.ts --matches 10000 --report reports/balance
//   tsx packages/test-bots/src/cli.ts --matches 600 --check
// Options: --seed <base seed> --rules <version> --workers <n> --report <dir> --check
// --check exits non-zero on any invariant violation, unfinished match or illegal
// move by a strategy that should only play legally. Results are identical for the
// same seed, match count and rules regardless of worker count.
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { CURRENT_RULES_VERSION, rngFor } from '@syndicate/game-engine';
import { simulateMatch } from './runner';
import {
  addResult,
  emptyAggregate,
  mean,
  mergeAggregates,
  rateRows,
  type Aggregate,
} from './stats';
import { STRATEGIES, type StrategyName } from './strategies';

interface Options {
  matches: number;
  seed: string;
  rules: string;
  report: string | null;
  check: boolean;
  workers: number;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    matches: 1000,
    seed: 'syndicate-balance',
    rules: CURRENT_RULES_VERSION,
    report: null,
    check: false,
    workers: Math.max(1, Math.min(8, availableParallelism() - 1)),
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--matches') opts.matches = Number(argv[++i]);
    else if (arg === '--seed') opts.seed = String(argv[++i]);
    else if (arg === '--rules') opts.rules = String(argv[++i]);
    else if (arg === '--report') opts.report = String(argv[++i]);
    else if (arg === '--workers') opts.workers = Number(argv[++i]);
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

function runRange(opts: Options, from: number, to: number): Aggregate {
  const agg = emptyAggregate();
  for (let i = from; i < to; i++) {
    const plan = planMatch(opts.seed, i);
    const result = simulateMatch({
      seed: plan.seed,
      rulesVersion: opts.rules,
      strategies: plan.strategies,
      settings: { length: plan.quick ? 'quick' : 'standard', beginner: false },
      dropoutRate: i % 7 === 3 ? 0.15 : 0,
    });
    addResult(agg, result);
  }
  return agg;
}

export async function runSimulations(opts: Options): Promise<Aggregate> {
  const workers = Math.max(1, Math.min(opts.workers, Math.ceil(opts.matches / 50)));
  if (workers === 1) return runRange(opts, 0, opts.matches);
  const chunk = Math.ceil(opts.matches / workers);
  const parts = await Promise.all(
    Array.from({ length: workers }, (_, w) => {
      const from = w * chunk;
      const to = Math.min(opts.matches, from + chunk);
      return new Promise<Aggregate>((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), {
          workerData: { opts, from, to },
          execArgv: ['--import', 'tsx'],
        });
        worker.once('message', (m: Aggregate) => resolve(m));
        worker.once('error', reject);
        worker.once('exit', (code) => code !== 0 && reject(new Error(`worker exited ${code}`)));
      });
    }),
  );
  return mergeAggregates(parts);
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function ratio(a: number, b: number): string {
  return b === 0 ? 'n/a' : pct(a / b);
}

function table(title: string, map: Aggregate['byStrategy'], note = ''): string {
  const rows = rateRows(map);
  return [
    `### ${title}`,
    '',
    ...(note ? [note, ''] : []),
    '| Group | Seats | Win rate | Expected | Delta (pp) | 95% CI | Flag |',
    '| --- | ---: | ---: | ---: | ---: | --- | --- |',
    ...rows.map(
      (r) =>
        `| ${r.key} | ${r.n} | ${pct(r.winRate)} | ${pct(r.expectedRate)} | ${r.deltaPp.toFixed(1)} | ${pct(r.ci[0])}-${pct(r.ci[1])} | ${r.flagged ? 'INVESTIGATE' : ''} |`,
    ),
    '',
  ].join('\n');
}

export function renderReport(agg: Aggregate, opts: Options, ms: number): string {
  const commitTotal = Object.values(agg.commitHistogram).reduce((s, v) => s + v, 0);
  const sab = agg.sabotage;
  const lines = [
    `# Balance simulation report`,
    '',
    `- Rules version: ${opts.rules}`,
    `- Base seed: \`${opts.seed}\`; matches: ${agg.matches} (re-run with the same seed, count and rules to reproduce exactly)`,
    `- Finished: ${agg.finished}; wall time ${(ms / 1000).toFixed(1)} s on ${opts.workers} worker(s)`,
    `- Invariant violations: ${agg.violations.length}; unexpected rejections: ${agg.unexpectedRejections.length}`,
    `- Ties for first: ${ratio(agg.ties, agg.finished)} overall, ${ratio(agg.mixedTies, agg.mixedMatches)} in mixed-strategy tables`,
    `- Comeback wins (winner outside the top half after round 2): ${ratio(agg.comebacks, agg.comebackEligible)}`,
    `- Mean winning score ${mean(agg.winningScores).toFixed(1)}, mean median score ${mean(agg.medianScores).toFixed(1)}, mean first-minus-median gap ${mean(agg.firstMinusMedian).toFixed(1)}`,
    `- Commitment decisions with no real choice (0 credits): ${ratio(agg.forcedZero, agg.decisions)}`,
    `- Mean credits at end: ${mean(agg.creditsAtEnd).toFixed(1)}`,
    '',
    'Simulated agents are not humans: these numbers find broken rules and dominant strategies; they do not prove human balance.',
    'The 5-point flag is a diagnostic threshold, not a significance test; compare each delta with its confidence interval.',
    '',
    table('Win rate by strategy (all tables)', agg.byStrategy),
    table('Win rate by seat in matched tables (first-mover check)', agg.matchedBySeat),
  ];
  if (Object.keys(agg.byRole).length) {
    lines.push(
      table(
        'Win rate by role archetype in matched tables',
        agg.matchedByArchetype,
        'Matched tables give every seat the same strategy, so differences come from the role (and luck).',
      ),
      table('Win rate by role variant in matched tables', agg.matchedByRole),
      table('Win rate by role archetype (all tables)', agg.byArchetype),
      table('Win rate by archetype and table size (all tables)', agg.byPlayerCountArchetype),
      '### Sabotage and detection',
      '',
      `- Sabotage uses: ${sab.uses}; sabotaged operations failed ${ratio(sab.failedWhenSabotaged, sab.uses)} of the time vs ${ratio(sab.cleanFailures, sab.opsClean)} for unsabotaged operations`,
      `- Saboteur paid (operation failed with enough other backers): ${ratio(sab.paid, sab.uses)}`,
      `- Sabotage exposed by the end of the match: ${ratio(sab.exposedByEnd, sab.uses)}`,
      `- Accusations: ${agg.accusations.total}; correct ${ratio(agg.accusations.correct, agg.accusations.total)}`,
      `- Ability uses: ${Object.entries(agg.abilityUses)
        .sort()
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')}`,
      '',
      '### Hidden objectives',
      '',
      '| Objective | Assigned | Completed |',
      '| --- | ---: | ---: |',
      ...Object.entries(agg.objectives)
        .sort()
        .map(([k, v]) => `| ${k} | ${v.assigned} | ${ratio(v.met, v.assigned)} |`),
      '',
    );
  }
  lines.push(
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
  );
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

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const agg = await runSimulations(opts);
  const report = renderReport(agg, opts, Date.now() - started);
  if (opts.report) {
    mkdirSync(opts.report, { recursive: true });
    writeFileSync(join(opts.report, 'report.md'), report);
    const {
      creditsAtEnd: _c,
      firstMinusMedian: _f,
      winningScores: _w,
      medianScores: _m,
      ...compact
    } = agg;
    writeFileSync(join(opts.report, 'aggregate.json'), JSON.stringify(compact, null, 2));
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

if (!isMainThread) {
  const { opts, from, to } = workerData as { opts: Options; from: number; to: number };
  parentPort?.postMessage(runRange(opts, from, to));
} else if (process.argv[1]?.endsWith('cli.ts')) {
  await main();
}
