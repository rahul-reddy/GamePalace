// Automated players. Each strategy sees only its own redacted PlayerView (the same
// information a human gets) and returns the commands it wants to send this phase.
import type { DealTerm, PlayerCommand, PlayerView, Rng } from '@syndicate/game-engine';

export const STRATEGIES = [
  'random',
  'conservative',
  'aggressive',
  'cooperative',
  'opportunist',
  'detective',
  'saboteur',
  'exploiter',
] as const;
export type StrategyName = (typeof STRATEGIES)[number];

export interface BotContext {
  view: PlayerView;
  rng: Rng;
  /** Memory the bot keeps between phases of one match. */
  memory: Record<string, unknown>;
}

/** Best estimate of the current operation's base success chance from public + private intel. */
export function estimateBase(view: PlayerView): number {
  const op = view.operation;
  if (!op) return 0.5;
  const mid = (op.publicLow + op.publicHigh) / 2;
  const spread = (op.publicHigh - op.publicLow) / 2 || 0.15;
  let weightSum = 1 / (spread * spread);
  let sum = mid * weightSum;
  for (const report of view.self.intel) {
    if (report.targetRound !== op.round) continue;
    const w = 1 / (report.margin * report.margin);
    sum += report.estimate * w;
    weightSum += w;
  }
  return sum / weightSum;
}

/** Average total commitment seen in resolved rounds, as a forecast of this round's pool. */
export function expectedTotal(view: PlayerView): number {
  const past = view.history.filter((h) => h.result && h.result.status !== 'ABANDONED');
  if (past.length === 0) return view.players.length * 1.8;
  return past.reduce((s, h) => s + (h.result?.totalCommitted ?? 0), 0) / past.length;
}

/** Expected influence per credit committed, net of the credit-point value lost on failure. */
export function evPerCredit(view: PlayerView, amount: number, othersTotal: number): number {
  const op = view.operation;
  if (!op || amount <= 0) return 0;
  const total = othersTotal + amount;
  const targetMet = total >= op.targetCapital;
  const p = Math.min(
    0.95,
    Math.max(
      0.05,
      estimateBase(view) + op.scenario.successDelta + (targetMet ? view.rules.targetBonus : 0),
    ),
  );
  const share =
    Math.min(view.rules.shareCapPerCredit * amount, (op.pool * amount) / total) / amount;
  const creditValue = 1 / view.rules.creditsPerScorePoint;
  // Credits also fund future rounds; value them a little above their end-of-game score.
  const lossValue = creditValue * 1.6;
  const sitOut = view.rules.sitOutCredits * creditValue;
  return p * share - (1 - p) * lossValue - sitOut / amount;
}

function clampCommit(view: PlayerView, amount: number): number {
  return Math.max(0, Math.min(view.self.maxCommit, Math.round(amount)));
}

function othersIds(view: PlayerView): string[] {
  return view.players.filter((p) => p.id !== view.self.id).map((p) => p.id);
}

function pendingDealReplies(
  view: PlayerView,
  accept: (dealId: string) => boolean,
): PlayerCommand[] {
  return view.deals
    .filter((d) => d.round === view.round && d.responses[view.self.id] === 'pending')
    .map((d) => ({ type: 'respondDeal', dealId: d.id, accept: accept(d.id) }) as PlayerCommand);
}

function strategicCommit(view: PlayerView, threshold: number): number {
  const others = Math.max(
    0,
    expectedTotal(view) * ((view.players.length - 1) / view.players.length),
  );
  let best = 0;
  let bestEv = threshold;
  for (let amount = 1; amount <= view.self.maxCommit; amount++) {
    const ev = evPerCredit(view, amount, others) * amount;
    if (ev > bestEv) {
      best = amount;
      bestEv = ev;
    }
  }
  return best;
}

type PhaseHandler = (ctx: BotContext) => PlayerCommand[];

interface Strategy {
  intelligence?: PhaseHandler;
  negotiation?: PhaseHandler;
  commitment: PhaseHandler;
}

const strategies: Record<StrategyName, Strategy> = {
  random: {
    intelligence: ({ view, rng }) =>
      rng.next() < 0.3 && view.self.credits >= view.self.intelCost ? [{ type: 'buyIntel' }] : [],
    negotiation: ({ view, rng }) => {
      const out: PlayerCommand[] = pendingDealReplies(view, () => rng.next() < 0.5);
      if (rng.next() < 0.2) {
        out.push({
          type: 'proposeDeal',
          invitees: [rng.pick(othersIds(view))],
          terms: [{ kind: 'commit', amount: rng.int(1, 3) }],
          note: '',
        });
      }
      if (rng.next() < 0.3) out.push({ type: 'chat', kind: 'reaction', text: '🤔' });
      return out;
    },
    commitment: ({ view, rng }) => [{ type: 'commit', amount: rng.int(0, view.self.maxCommit) }],
  },
  conservative: {
    negotiation: ({ view }) => pendingDealReplies(view, () => false),
    commitment: ({ view }) => {
      const p = estimateBase(view) + (view.operation?.scenario.successDelta ?? 0);
      return [{ type: 'commit', amount: p >= 0.6 ? clampCommit(view, 1) : 0 }];
    },
  },
  aggressive: {
    negotiation: ({ view }) => pendingDealReplies(view, () => true),
    commitment: ({ view }) => [{ type: 'commit', amount: view.self.maxCommit }],
  },
  cooperative: {
    negotiation: ({ view, memory }) => {
      const out = pendingDealReplies(view, () => true);
      if (memory.proposedRound !== view.round && view.round % 2 === 1) {
        memory.proposedRound = view.round;
        const terms: DealTerm[] = [{ kind: 'commit', amount: 2 }, { kind: 'shareIntel' }];
        out.push({ type: 'proposeDeal', invitees: othersIds(view), terms, note: '' });
        out.push({ type: 'chat', kind: 'preset', text: 'target' });
      }
      return out;
    },
    commitment: ({ view }) => {
      const accepted = view.deals.some(
        (d) =>
          d.round === view.round &&
          d.members.filter((m) => d.responses[m] === 'accepted').length >= 2,
      );
      const p = estimateBase(view) + (view.operation?.scenario.successDelta ?? 0);
      const amount = accepted ? 2 : p >= 0.45 ? 2 : 1;
      return [{ type: 'commit', amount: clampCommit(view, amount) }];
    },
  },
  opportunist: {
    intelligence: ({ view }) => {
      const op = view.operation;
      const uncertain = op ? op.publicHigh - op.publicLow >= 0.2 : false;
      return uncertain && view.self.credits >= 6 && view.self.credits >= view.self.intelCost
        ? [{ type: 'buyIntel' }]
        : [];
    },
    negotiation: ({ view }) => pendingDealReplies(view, () => true),
    commitment: ({ view }) => [{ type: 'commit', amount: strategicCommit(view, 0.15) }],
  },
  detective: {
    intelligence: ({ view }) =>
      view.self.credits >= 8 && view.self.credits >= view.self.intelCost
        ? [{ type: 'buyIntel' }]
        : [],
    negotiation: ({ view }) => {
      // Accepts deals only from players who have never broken one with it.
      const broken = new Set(
        view.log.filter((e) => e.kind === 'deal_broken').map((e) => String(e.data.player)),
      );
      return pendingDealReplies(view, (id) => {
        const deal = view.deals.find((d) => d.id === id);
        return deal ? !broken.has(deal.proposer) : false;
      });
    },
    commitment: ({ view }) => [{ type: 'commit', amount: strategicCommit(view, 0.05) }],
  },
  saboteur: {
    // Without roles this plays as a promise-breaker: it invites commitments and commits little.
    negotiation: ({ view, memory }) => {
      const out = pendingDealReplies(view, () => true);
      if (memory.proposedRound !== view.round) {
        memory.proposedRound = view.round;
        out.push({
          type: 'proposeDeal',
          invitees: othersIds(view),
          terms: [{ kind: 'commit', amount: 3 }],
          note: '',
        });
      }
      return out;
    },
    commitment: ({ view }) => [{ type: 'commit', amount: strategicCommit(view, 0.4) }],
  },
  exploiter: {
    intelligence: () => [
      // Illegal probes: the runner checks every one of these is rejected.
      { type: 'commit', amount: 3 },
      { type: 'start' },
      { type: 'buyIntel' },
      { type: 'buyIntel' },
    ],
    negotiation: ({ view }) => [
      {
        type: 'proposeDeal',
        invitees: [view.self.id],
        terms: [{ kind: 'commit', amount: 1 }],
        note: '',
      },
      {
        type: 'proposeDeal',
        invitees: ['nobody'],
        terms: [{ kind: 'commit', amount: 1 }],
        note: '',
      },
      {
        type: 'proposeDeal',
        invitees: othersIds(view),
        terms: [{ kind: 'commit', amount: 9 }],
        note: '',
      },
      { type: 'respondDeal', dealId: 'd999', accept: true },
      { type: 'rematch' },
    ],
    commitment: ({ view }) => [
      { type: 'commit', amount: view.self.credits + 5 },
      { type: 'commit', amount: -1 },
      { type: 'commit', amount: 1.5 },
      { type: 'commit', amount: strategicCommit(view, 0.1) },
      { type: 'commit', amount: 1 },
    ],
  },
};

/** Players this bot has reason to believe are saboteurs: exposed, or flagged by its own audit. */
function d_accepted(view: PlayerView, id: string): boolean {
  return view.deals.some((d) => d.round === view.round && d.responses[id] === 'accepted');
}

function suspects(view: PlayerView, memory: Record<string, unknown>): string[] {
  const exposed = view.players.filter((p) => p.exposed).map((p) => p.id);
  const audited = view.log
    .filter(
      (e) =>
        e.kind === 'ability_result' && e.data.ability === 'investigate' && e.data.result === true,
    )
    .map((e) => String(e.data.target));
  const remembered = (memory.suspects as string[] | undefined) ?? [];
  // Exposed players are public knowledge; accusing them is refused and earns nothing.
  return [...new Set([...audited, ...remembered])].filter(
    (id) => id !== view.self.id && !exposed.includes(id),
  );
}

/**
 * Role play shared by every strategy: when and how to use the secret ability, and
 * whom to accuse. `style` tunes how eagerly the strategy acts on it.
 */
function roleCommands(strategy: StrategyName, ctx: BotContext): PlayerCommand[] {
  const { view, rng, memory } = ctx;
  const role = view.self.role;
  const out: PlayerCommand[] = [];
  const op = view.operation;
  const p = estimateBase(view) + (op?.scenario.successDelta ?? 0);
  const others = othersIds(view);
  const canUse = role && role.charges > 0 && !view.self.abilityUsedThisRound;
  const random = strategy === 'random';
  if (view.phase === 'INTELLIGENCE' && canUse) {
    if (role.ability === 'peek' && (random ? rng.next() < 0.5 : true)) {
      const next =
        Number(role.params.allowNext) === 1 && view.round < view.totalRounds && rng.next() < 0.3;
      out.push({ type: 'useAbility', choice: next ? 'next' : 'current' });
    }
    if (role.ability === 'investigate' && view.round > 1 && role.params.scope === 'history') {
      // Background check: prefer players who sat out a failed operation.
      const checked = (memory.checked as string[] | undefined) ?? [];
      const failedSitters = view.history
        .filter((h) => h.result?.status === 'FAILURE')
        .flatMap((h) => others.filter((id) => (h.result?.commitments[id] ?? 0) === 0));
      const ranked = [...new Set([...failedSitters, ...rng.shuffle(others)])].filter(
        (id) => !checked.includes(id),
      );
      if (ranked.length) {
        memory.checked = [...checked, ranked[0] as string];
        out.push({ type: 'useAbility', target: ranked[0] as string });
      }
    } else if (role.ability === 'investigate' && view.round > 1) {
      // Investigate a backer of the most recent failed operation, or anyone at random.
      const failed = [...view.history].reverse().find((h) => h.result?.status === 'FAILURE');
      // Saboteurs tend to keep their own credits out of the operation they spoil.
      const satOut = failed
        ? others.filter((id) => (failed.result?.commitments[id] ?? 0) === 0)
        : [];
      const pool = satOut.length ? satOut : others;
      const checked = (memory.checked as string[] | undefined) ?? [];
      const candidates = pool.filter(
        (id) => !checked.includes(`${id}:${failed?.round ?? view.round - 1}`),
      );
      if (candidates.length) {
        const target = rng.pick(candidates);
        const round = failed?.round ?? view.round - 1;
        memory.checked = [...checked, `${target}:${round}`];
        out.push({ type: 'useAbility', target, targetRound: round });
      }
    }
  }
  if (view.phase === 'NEGOTIATION' && view.self.accusationsLeft > 0 && view.features.roles) {
    const already = new Set(
      view.accusations.filter((a) => a.accuser === view.self.id).map((a) => a.target),
    );
    const targets = suspects(view, memory).filter((id) => !already.has(id));
    const eager = strategy === 'detective' || strategy === 'exploiter';
    if (targets.length && (eager || rng.next() < 0.6))
      out.push({ type: 'accuse', target: targets[0] as string });
    else if (strategy === 'random' && rng.next() < 0.1)
      out.push({ type: 'accuse', target: rng.pick(others) });
  }
  if (view.phase === 'COMMITMENT' && canUse && op) {
    switch (role.ability) {
      case 'sabotage': {
        const eager = strategy === 'saboteur' || strategy === 'aggressive';
        const timing = view.round >= 2 || eager;
        if (timing && (eager || rng.next() < 0.55 || view.round === view.totalRounds)) {
          memory.sabotaged = view.round;
          out.push({ type: 'useAbility' });
        }
        break;
      }
      case 'insure': {
        // Insure a likely backer to earn the premium on success; insure yourself on long shots.
        const self = Number(role.params.allowSelf) === 1;
        const partner = view.deals
          .find((d) => d.round === view.round && d.responses[view.self.id] === 'accepted')
          ?.members.find((m) => m !== view.self.id && d_accepted(view, m));
        const backers = view.history.at(-1)?.result?.commitments ?? {};
        const likely = others.filter((id) => (backers[id] ?? 0) > 0);
        const other = partner ?? (likely.length ? rng.pick(likely) : rng.pick(others));
        const target = self && p < 0.45 ? view.self.id : other;
        if (random ? rng.next() < 0.5 : p < 0.7 || view.round === view.totalRounds)
          out.push({ type: 'useAbility', target });
        break;
      }
      case 'broker':
        if (p >= 0.45 || view.round === view.totalRounds) out.push({ type: 'useAbility' });
        break;
      case 'forecast': {
        const confident = Math.abs(p - 0.5) > 0.1 || view.round >= view.totalRounds - 1;
        if (confident || random)
          out.push({ type: 'useAbility', choice: p >= 0.5 ? 'SUCCESS' : 'FAILURE' });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

export function botCommands(strategy: StrategyName, ctx: BotContext): PlayerCommand[] {
  const s = strategies[strategy];
  const roleFirst = roleCommands(strategy, ctx);
  let own: PlayerCommand[];
  switch (ctx.view.phase) {
    case 'INTELLIGENCE':
      own = s.intelligence?.(ctx) ?? [];
      break;
    case 'NEGOTIATION':
      own = s.negotiation?.(ctx) ?? [];
      break;
    case 'COMMITMENT': {
      own = s.commitment(ctx);
      // Saboteurs keep their own credits out of the operation they sabotage.
      if (ctx.memory.sabotaged === ctx.view.round) {
        own = own.map((c) => (c.type === 'commit' ? { type: 'commit', amount: 0 } : c));
      }
      break;
    }
    default:
      own = [];
  }
  // Abilities in the commitment phase must come before sealing.
  return [...roleFirst, ...own];
}
