// The pure rules engine: every function takes state plus inputs and returns new
// state. No clocks, I/O or ambient randomness; see rng.ts for how randomness is
// derived from the server-supplied seed.
import {
  cleanName,
  filterProfanity,
  normalizeText,
  PRESET_MESSAGES,
  REACTIONS,
} from './moderation';
import { rngFor } from './rng';
import { CURRENT_RULES_VERSION, getRules, scenarioById, type RulesConfig } from './rules';
import type {
  ApplyResult,
  Avatar,
  CommandEnvelope,
  Deal,
  DealTerm,
  EngineError,
  ErrorCode,
  GameState,
  LogEntry,
  LogKind,
  MatchSettings,
  Operation,
  OperationPayout,
  Phase,
  PlayerState,
  Tier,
  TimedPhase,
} from './types';
import { AVATARS, TIERS } from './types';
import { finalizeResults } from './score';

export const DEFAULT_SETTINGS: MatchSettings = {
  length: 'standard',
  pace: 'normal',
  beginner: true,
  presetChatOnly: false,
};

export class RuleError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function fail(code: ErrorCode, message: string): never {
  throw new RuleError(code, message);
}

export function rulesOf(state: GameState): RulesConfig {
  return getRules(state.rulesVersion);
}

export function findPlayer(state: GameState, id: string): PlayerState | undefined {
  return state.players.find((p) => p.id === id);
}

function requirePlayer(state: GameState, id: string): PlayerState {
  return findPlayer(state, id) ?? fail('NOT_A_PLAYER', 'You are not seated in this room.');
}

function addLog(
  state: GameState,
  now: number,
  kind: LogKind,
  data: LogEntry['data'] = {},
  to?: string[],
): void {
  const entry: LogEntry = { id: state.nextLogId++, at: now, round: state.round, kind, data };
  if (to) entry.to = to;
  state.log.push(entry);
  // Keep the log bounded; old entries are not needed for play.
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
}

export function isInMatch(phase: Phase): boolean {
  return phase !== 'LOBBY' && phase !== 'RESULTS';
}

// ---- Creation ---------------------------------------------------------------

export interface CreateGameConfig {
  hostId: string;
  hostName: string;
  hostAvatar: Avatar;
  now: number;
  rulesVersion?: string;
  settings?: Partial<MatchSettings>;
}

/** Creates a room in the LOBBY phase with the host seated. The seed is used for the first match. */
export function createGame(config: CreateGameConfig, seed: string): GameState {
  const rulesVersion = config.rulesVersion ?? CURRENT_RULES_VERSION;
  getRules(rulesVersion);
  const name =
    cleanName(config.hostName) ?? fail('INVALID_COMMAND', 'Choose a different nickname.');
  const state: GameState = {
    schema: 1,
    rulesVersion,
    seed,
    matchIndex: 0,
    settings: { ...DEFAULT_SETTINGS, ...config.settings },
    hostId: config.hostId,
    phase: 'LOBBY',
    phaseVersion: 0,
    phaseStartedAt: config.now,
    phaseEndsAt: null,
    matchStartedAt: null,
    matchCapAt: null,
    round: 0,
    totalRounds: 0,
    players: [],
    operations: [],
    commitments: {},
    extraIntel: {},
    deals: [],
    nextDealId: 1,
    chat: [],
    nextChatId: 1,
    log: [],
    nextLogId: 1,
    results: null,
  };
  seatPlayer(state, config.hostId, name, config.hostAvatar, config.now);
  return state;
}

function uniqueName(state: GameState, name: string): string {
  const taken = new Set(state.players.map((p) => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name.slice(0, 13)} ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

function seatPlayer(state: GameState, id: string, name: string, avatar: Avatar, now: number): void {
  const rules = rulesOf(state);
  if (state.players.length >= rules.players.max) fail('ROOM_FULL', 'This room is full.');
  if (findPlayer(state, id)) fail('INVALID_COMMAND', 'Already seated.');
  const seat = state.players.length;
  state.players.push({
    id,
    name: uniqueName(state, name),
    avatar: AVATARS.includes(avatar) ? avatar : 'fox',
    seat,
    connected: true,
    credits: rules.economy.startingCredits,
    influence: 0,
    suspicion: 0,
    ready: false,
    muted: false,
    intel: [],
  });
  addLog(state, now, 'player_joined', { player: id });
}

// ---- Phase machine ----------------------------------------------------------

const ROUND_PHASES: TimedPhase[] = [
  'INTELLIGENCE',
  'NEGOTIATION',
  'COMMITMENT',
  'RESOLUTION',
  'ROUND_SUMMARY',
];

export function phaseDuration(state: GameState, phase: TimedPhase): number {
  const rules = rulesOf(state);
  let ms = rules.timing.phaseMs[phase] * rules.timing.paceMultipliers[state.settings.pace];
  // Beginners get extra time to read during the first round.
  if (state.settings.beginner && (state.round <= 1 || phase === 'ROLE_REVEAL')) ms *= 1.4;
  return Math.round(ms / 1000) * 1000;
}

/** The phase that follows the current one when its deadline passes or everyone is done. */
export function nextPhase(state: GameState, now: number): Phase {
  switch (state.phase) {
    case 'LOBBY':
      return 'ROLE_REVEAL';
    case 'ROLE_REVEAL':
      return 'INTELLIGENCE';
    case 'INTELLIGENCE':
      return 'NEGOTIATION';
    case 'NEGOTIATION':
      return 'COMMITMENT';
    case 'COMMITMENT':
      return 'RESOLUTION';
    case 'RESOLUTION':
      return 'ROUND_SUMMARY';
    case 'ROUND_SUMMARY': {
      const capped = state.matchCapAt !== null && now >= state.matchCapAt;
      return state.round < state.totalRounds && !capped ? 'INTELLIGENCE' : 'FINAL_RECKONING';
    }
    case 'FINAL_RECKONING':
      return 'RESULTS';
    case 'RESULTS':
      return 'RESULTS';
  }
}

/** Moves to the next phase and runs its entry effects. */
export function transitionPhase(state: GameState, now: number): void {
  const from = state.phase;
  const to = nextPhase(state, now);
  if (from === to) return;
  if (from === 'COMMITMENT') applyDefaultCommitments(state, now);
  if (from === 'ROUND_SUMMARY' && to === 'FINAL_RECKONING' && state.round < state.totalRounds) {
    addLog(state, now, 'match_capped', { round: state.round });
  }
  if (to === 'INTELLIGENCE') state.round += 1;
  state.phase = to;
  state.phaseVersion += 1;
  state.phaseStartedAt = now;
  state.phaseEndsAt = to === 'RESULTS' ? null : now + phaseDuration(state, to as TimedPhase);
  for (const p of state.players) p.ready = false;
  addLog(state, now, 'phase', { phase: to });
  switch (to) {
    case 'INTELLIGENCE':
      announceOperation(state, now);
      break;
    case 'RESOLUTION':
      resolveOperation(state, now);
      break;
    case 'FINAL_RECKONING':
      state.results = finalizeResults(state);
      break;
    case 'RESULTS':
      addLog(state, now, 'match_finished', { winners: state.results?.winners.join(',') ?? '' });
      break;
    default:
      break;
  }
}

/** Players whose readiness gates early advancement: everyone currently connected. */
function gatingPlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.connected);
}

function phaseDoneFor(state: GameState, p: PlayerState): boolean {
  if (state.phase === 'COMMITMENT') return state.commitments[state.round]?.[p.id] !== undefined;
  return p.ready;
}

/** Advances early when every connected player has finished the current phase. */
function maybeAdvanceEarly(state: GameState, now: number): void {
  if (!isInMatch(state.phase)) return;
  const gating = gatingPlayers(state);
  if (gating.length === 0) return;
  if (gating.every((p) => phaseDoneFor(state, p))) transitionPhase(state, now);
}

// ---- Start, operations and intel ---------------------------------------------

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function generateOperations(
  rules: RulesConfig,
  seed: string,
  playerCount: number,
  rounds: number,
  settings: MatchSettings,
): Operation[] {
  const planRng = rngFor(seed, 'plan');
  const tiers: Tier[] = rounds >= 3 ? [...TIERS] : [];
  while (tiers.length < rounds) tiers.push(planRng.pick(TIERS));
  const order = planRng.shuffle(tiers);
  const names = planRng.shuffle(rules.operations.names);
  return order.map((tier, i) => {
    const round = i + 1;
    const rng = rngFor(seed, 'operation', round);
    const t = rules.operations.tiers[tier];
    const scenario =
      settings.beginner && round === 1
        ? scenarioById(rules, 'quiet')
        : rng.pick(rules.operations.scenarios);
    const trueBase = round2(rng.range(t.baseMin, t.baseMax));
    const width = rules.operations.publicWindow;
    const offset = rng.range(0, width);
    const publicLow = round2(Math.max(0, Math.floor((trueBase - offset) * 20) / 20));
    const publicHigh = round2(Math.min(1, Math.ceil((trueBase - offset + width) * 20) / 20));
    return {
      round,
      name: names[i % names.length] ?? `Operation ${round}`,
      tier,
      scenarioId: scenario.id,
      trueBase,
      publicLow,
      publicHigh,
      roll: rng.next(),
      pool: Math.round(t.poolPerPlayer * playerCount * scenario.poolMultiplier),
      targetCapital: Math.ceil(
        rules.operations.targetCapitalPerPlayer * playerCount * scenario.targetMultiplier,
      ),
      result: null,
    };
  });
}

export function currentOperation(state: GameState): Operation | undefined {
  return state.operations[state.round - 1];
}

function noisyEstimate(trueBase: number, noise: number, step: number, u: number): number {
  return round2(clamp(roundTo(trueBase + (u * 2 - 1) * noise, step), 0, 1));
}

function announceOperation(state: GameState, now: number): void {
  const rules = rulesOf(state);
  const op = currentOperation(state);
  if (!op) return;
  addLog(state, now, 'operation_announced', { round: op.round, name: op.name, tier: op.tier });
  for (const p of state.players) {
    const u = rngFor(state.seed, 'rumor', op.round, p.id).next();
    p.intel.push({
      targetRound: op.round,
      receivedRound: op.round,
      source: 'rumor',
      estimate: noisyEstimate(op.trueBase, rules.intel.basicNoise, rules.intel.roundTo, u),
      margin: round2(rules.intel.basicNoise + rules.intel.roundTo / 2),
    });
  }
}

export function intelCost(state: GameState): number {
  const rules = rulesOf(state);
  const op = currentOperation(state);
  const delta = op ? scenarioById(rules, op.scenarioId).intelCostDelta : 0;
  return Math.max(0, rules.intel.extraCost + delta);
}

function startMatch(state: GameState, now: number, seed: string): void {
  const rules = rulesOf(state);
  state.seed = seed;
  state.totalRounds = rules.rounds[state.settings.length];
  state.round = 0;
  state.operations = generateOperations(
    rules,
    seed,
    state.players.length,
    state.totalRounds,
    state.settings,
  );
  state.commitments = {};
  state.extraIntel = {};
  state.deals = [];
  state.results = null;
  state.matchStartedAt = now;
  state.matchCapAt = now + rules.timing.matchCapMs;
  state.players.forEach((p, seat) => {
    p.seat = seat;
    p.credits = rules.economy.startingCredits;
    p.influence = 0;
    p.suspicion = 0;
    p.intel = [];
  });
  addLog(state, now, 'match_started', { players: state.players.length, rounds: state.totalRounds });
  transitionPhase(state, now);
}

// ---- Resolution ---------------------------------------------------------------

function applyDefaultCommitments(state: GameState, now: number): void {
  const round = state.round;
  const commits = (state.commitments[round] ??= {});
  for (const p of state.players) {
    if (commits[p.id] === undefined) {
      commits[p.id] = 0;
      addLog(state, now, 'auto_pass', { player: p.id });
    }
  }
}

/**
 * Splits `pool` integer influence by commitment share with a per-credit cap (largest
 * remainder). `order` breaks exact remainder ties; callers pass a seeded per-round
 * shuffle so no seat is systematically favoured (seat order gave seat 1 a large
 * edge in matched-strategy simulations).
 */
export function splitPool(
  pool: number,
  commitments: { id: string; amount: number; order: number }[],
  capPerCredit: number,
): Record<string, number> {
  const total = commitments.reduce((sum, c) => sum + c.amount, 0);
  const out: Record<string, number> = {};
  if (total <= 0) return out;
  const shares = commitments
    .filter((c) => c.amount > 0)
    .map((c) => {
      const cap = Math.floor(capPerCredit * c.amount);
      const raw = Math.min(cap, (pool * c.amount) / total);
      return { ...c, cap, raw, base: Math.floor(raw) };
    });
  const target = Math.min(
    Math.round(shares.reduce((s, c) => s + c.raw, 0)),
    shares.reduce((s, c) => s + c.cap, 0),
  );
  let remaining = target - shares.reduce((s, c) => s + c.base, 0);
  const byRemainder = [...shares].sort(
    (a, b) => b.raw - b.base - (a.raw - a.base) || b.amount - a.amount || a.order - b.order,
  );
  for (const c of byRemainder) {
    if (remaining <= 0) break;
    if (c.base < c.cap) {
      c.base += 1;
      remaining -= 1;
    }
  }
  for (const c of shares) out[c.id] = c.base;
  return out;
}

export function successChance(state: GameState, op: Operation, totalCommitted: number): number {
  const rules = rulesOf(state);
  const scenario = scenarioById(rules, op.scenarioId);
  const targetMet = totalCommitted >= op.targetCapital;
  return round2(
    clamp(
      op.trueBase + scenario.successDelta + (targetMet ? rules.operations.targetBonus : 0),
      rules.operations.minSuccess,
      rules.operations.maxSuccess,
    ),
  );
}

export function resolveOperation(state: GameState, now: number): void {
  const rules = rulesOf(state);
  const op = currentOperation(state);
  if (!op || op.result) return;
  const commits = state.commitments[op.round] ?? {};
  const tieOrder = rngFor(state.seed, 'remainder', op.round).shuffle(
    state.players.map((p) => p.id),
  );
  const entries = state.players.map((p) => ({
    id: p.id,
    amount: commits[p.id] ?? 0,
    order: tieOrder.indexOf(p.id),
  }));
  const totalCommitted = entries.reduce((s, e) => s + e.amount, 0);
  const participants = entries.filter((e) => e.amount > 0).length;
  const targetMet = totalCommitted >= op.targetCapital;
  const finalChance = successChance(state, op, totalCommitted);
  const status = participants === 0 ? 'ABANDONED' : op.roll < finalChance ? 'SUCCESS' : 'FAILURE';
  const shares =
    status === 'SUCCESS' ? splitPool(op.pool, entries, rules.operations.shareCapPerCredit) : {};
  const payouts: Record<string, OperationPayout> = {};
  for (const p of state.players) {
    const committed = commits[p.id] ?? 0;
    const payout: OperationPayout = {
      committed,
      influence: shares[p.id] ?? 0,
      creditsReturned: status === 'SUCCESS' ? committed : 0,
      creditsLost: status === 'FAILURE' ? committed : 0,
      sitOutCredits: committed === 0 ? rules.economy.sitOutCredits : 0,
    };
    // Commitments were escrowed (deducted) when sealed; only returns are added back.
    p.credits = Math.min(
      rules.economy.creditCap,
      p.credits + payout.creditsReturned + payout.sitOutCredits,
    );
    p.influence += payout.influence;
    payouts[p.id] = payout;
  }
  op.result = { status, totalCommitted, participants, targetMet, finalChance, payouts };
  addLog(state, now, 'operation_resolved', {
    round: op.round,
    status,
    totalCommitted,
    participants,
    targetMet,
  });
  judgeDeals(state, now, commits);
}

function judgeDeals(state: GameState, now: number, commits: Record<string, number>): void {
  for (const deal of state.deals) {
    if (deal.round !== state.round || deal.kept) continue;
    const commitTerm = deal.terms.find((t) => t.kind === 'commit');
    if (!commitTerm || commitTerm.kind !== 'commit') continue;
    const accepted = deal.members.filter((m) => deal.responses[m] === 'accepted');
    if (accepted.length < 2) continue;
    deal.kept = {};
    for (const m of accepted) {
      const kept = (commits[m] ?? 0) >= commitTerm.amount;
      deal.kept[m] = kept;
      if (!kept) {
        addLog(
          state,
          now,
          'deal_broken',
          { deal: deal.id, player: m, promised: commitTerm.amount },
          accepted,
        );
      }
    }
  }
}

// ---- Commands ---------------------------------------------------------------

function requireHost(state: GameState, actor: string): void {
  if (state.hostId !== actor) fail('NOT_HOST', 'Only the host can do that.');
}

function requirePhase(state: GameState, ...phases: Phase[]): void {
  if (!phases.includes(state.phase))
    fail('NOT_ALLOWED_IN_PHASE', 'That is not possible right now.');
}

function transferHostIfNeeded(state: GameState, now: number): void {
  const host = findPlayer(state, state.hostId);
  if (host && host.connected) return;
  const next = state.players.find((p) => p.connected && p.id !== state.hostId);
  if (next) {
    state.hostId = next.id;
    addLog(state, now, 'host_changed', { player: next.id });
  }
}

function removePlayer(state: GameState, id: string, now: number, kind: LogKind): void {
  state.players = state.players.filter((p) => p.id !== id);
  state.players.forEach((p, seat) => (p.seat = seat));
  state.deals = state.deals.filter((d) => !d.members.includes(id));
  addLog(state, now, kind, { player: id });
  if (state.hostId === id && state.players[0]) {
    state.hostId = state.players[0].id;
    addLog(state, now, 'host_changed', { player: state.hostId });
  }
}

function validSettings(input: Partial<MatchSettings>): Partial<MatchSettings> {
  const out: Partial<MatchSettings> = {};
  if (input.length !== undefined) {
    if (input.length !== 'standard' && input.length !== 'quick')
      fail('INVALID_COMMAND', 'Bad length.');
    out.length = input.length;
  }
  if (input.pace !== undefined) {
    if (!['fast', 'normal', 'relaxed'].includes(input.pace)) fail('INVALID_COMMAND', 'Bad pace.');
    out.pace = input.pace;
  }
  if (input.beginner !== undefined) out.beginner = Boolean(input.beginner);
  if (input.presetChatOnly !== undefined) out.presetChatOnly = Boolean(input.presetChatOnly);
  return out;
}

function validDealTerms(rules: RulesConfig, terms: DealTerm[]): DealTerm[] {
  if (!Array.isArray(terms) || terms.length < 1 || terms.length > 3) {
    fail('INVALID_COMMAND', 'A deal needs one to three terms.');
  }
  const kinds = new Set<string>();
  return terms.map((t) => {
    if (kinds.has(t.kind)) fail('INVALID_COMMAND', 'Each term may appear once.');
    kinds.add(t.kind);
    switch (t.kind) {
      case 'commit':
        if (!Number.isInteger(t.amount) || t.amount < 1 || t.amount > rules.economy.maxCommit) {
          fail('INVALID_COMMAND', 'Commit terms must be between 1 and the maximum commitment.');
        }
        return { kind: 'commit', amount: t.amount };
      case 'shareIntel':
      case 'noAccuse':
      case 'backNext':
        return { kind: t.kind };
      default:
        return fail('INVALID_COMMAND', 'Unknown deal term.');
    }
  });
}

function recentChatCount(state: GameState, playerId: string, now: number): number {
  return state.chat.filter((m) => m.from === playerId && now - m.at < 60_000).length;
}

function applyPlayerCommand(state: GameState, env: CommandEnvelope): void {
  const { actor, now } = env;
  const rules = rulesOf(state);
  const command = env.command;
  const me = requirePlayer(state, actor);
  switch (command.type) {
    case 'setReady': {
      if (state.phase === 'COMMITMENT') fail('NOT_ALLOWED_IN_PHASE', 'Seal a commitment instead.');
      requirePhase(
        state,
        'LOBBY',
        'ROLE_REVEAL',
        'INTELLIGENCE',
        'NEGOTIATION',
        'RESOLUTION',
        'ROUND_SUMMARY',
        'FINAL_RECKONING',
      );
      me.ready = Boolean(command.ready);
      maybeAdvanceEarly(state, now);
      return;
    }
    case 'updateSettings': {
      requireHost(state, actor);
      requirePhase(state, 'LOBBY', 'RESULTS');
      state.settings = { ...state.settings, ...validSettings(command.settings) };
      // Settings changes invalidate earlier readiness so nobody starts under rules they did not see.
      for (const p of state.players) if (p.id !== actor) p.ready = false;
      return;
    }
    case 'start': {
      requireHost(state, actor);
      requirePhase(state, 'LOBBY');
      if (state.players.length < rules.players.min) {
        fail('NOT_ENOUGH_PLAYERS', `At least ${rules.players.min} players are needed.`);
      }
      me.ready = true;
      if (!state.players.every((p) => p.ready)) fail('NOT_READY', 'Everyone must be ready.');
      if (!env.seed) fail('INVALID_COMMAND', 'Missing server seed.');
      startMatch(state, now, env.seed);
      return;
    }
    case 'kick': {
      requireHost(state, actor);
      requirePhase(state, 'LOBBY', 'RESULTS');
      if (command.target === actor) fail('INVALID_COMMAND', 'You cannot kick yourself.');
      if (!findPlayer(state, command.target)) fail('UNKNOWN_TARGET', 'No such player.');
      removePlayer(state, command.target, now, 'player_kicked');
      return;
    }
    case 'mute': {
      requireHost(state, actor);
      const target = findPlayer(state, command.target) ?? fail('UNKNOWN_TARGET', 'No such player.');
      if (target.id === actor) fail('INVALID_COMMAND', 'You cannot mute yourself.');
      target.muted = Boolean(command.muted);
      return;
    }
    case 'leave': {
      if (isInMatch(state.phase)) {
        // Seats are never removed mid-match: the player is auto-passed until they return.
        me.connected = false;
        addLog(state, now, 'player_disconnected', { player: actor });
        maybeAdvanceEarly(state, now);
      } else {
        removePlayer(state, actor, now, 'player_left');
      }
      return;
    }
    case 'buyIntel': {
      requirePhase(state, 'INTELLIGENCE', 'NEGOTIATION');
      const bought = (state.extraIntel[state.round] ??= []);
      if (bought.includes(actor))
        fail('LIMIT_REACHED', 'You already used your contact this round.');
      const cost = intelCost(state);
      if (me.credits < cost) fail('INSUFFICIENT_CREDITS', 'Not enough credits.');
      const op = currentOperation(state);
      if (!op) fail('NOT_ALLOWED_IN_PHASE', 'No operation is active.');
      me.credits -= cost;
      bought.push(actor);
      const u = rngFor(state.seed, 'contact', op.round, actor).next();
      me.intel.push({
        targetRound: op.round,
        receivedRound: op.round,
        source: 'contact',
        estimate: noisyEstimate(op.trueBase, rules.intel.extraNoise, rules.intel.roundTo, u),
        margin: round2(rules.intel.extraNoise + rules.intel.roundTo / 2),
      });
      addLog(state, now, 'intel_bought', { player: actor, cost }, [actor]);
      return;
    }
    case 'commit': {
      requirePhase(state, 'COMMITMENT');
      const commits = (state.commitments[state.round] ??= {});
      if (commits[actor] !== undefined) fail('ALREADY_DONE', 'Your commitment is already sealed.');
      const amount = command.amount;
      if (!Number.isInteger(amount) || amount < 0 || amount > rules.economy.maxCommit) {
        fail('INVALID_COMMAND', `Commit between 0 and ${rules.economy.maxCommit} credits.`);
      }
      if (amount > me.credits) fail('INSUFFICIENT_CREDITS', 'Not enough credits.');
      me.credits -= amount;
      commits[actor] = amount;
      addLog(state, now, 'commitment_sealed', { player: actor });
      maybeAdvanceEarly(state, now);
      return;
    }
    case 'proposeDeal': {
      requirePhase(state, 'INTELLIGENCE', 'NEGOTIATION');
      const invitees = [...new Set(command.invitees)];
      if (invitees.length < 1 || invitees.includes(actor)) {
        fail('INVALID_COMMAND', 'Invite at least one other player.');
      }
      for (const id of invitees)
        if (!findPlayer(state, id)) fail('UNKNOWN_TARGET', 'No such player.');
      const mine = state.deals.filter((d) => d.round === state.round && d.proposer === actor);
      if (mine.length >= rules.deals.maxOpenPerPlayer) {
        fail('LIMIT_REACHED', 'You have proposed the maximum number of deals this round.');
      }
      const terms = validDealTerms(rules, command.terms);
      const note = filterProfanity(normalizeText(command.note ?? '')).slice(
        0,
        rules.deals.maxNoteLength,
      );
      if (state.settings.presetChatOnly && note)
        fail('CHAT_RESTRICTED', 'Notes are off in this room.');
      const members = [actor, ...invitees];
      const deal: Deal = {
        id: `d${state.nextDealId++}`,
        round: state.round,
        proposer: actor,
        members,
        terms,
        note,
        responses: Object.fromEntries(
          members.map((m) => [m, m === actor ? 'accepted' : 'pending']),
        ),
        createdAt: now,
        kept: null,
      };
      state.deals.push(deal);
      addLog(state, now, 'deal_proposed', { deal: deal.id, player: actor }, members);
      return;
    }
    case 'respondDeal': {
      requirePhase(state, 'INTELLIGENCE', 'NEGOTIATION', 'COMMITMENT');
      const deal = state.deals.find((d) => d.id === command.dealId);
      if (!deal || !deal.members.includes(actor) || deal.round !== state.round) {
        fail('UNKNOWN_TARGET', 'No such deal.');
      }
      if (deal.responses[actor] !== 'pending') fail('ALREADY_DONE', 'You already answered.');
      deal.responses[actor] = command.accept ? 'accepted' : 'declined';
      addLog(
        state,
        now,
        'deal_answered',
        { deal: deal.id, player: actor, accepted: command.accept },
        deal.members,
      );
      return;
    }
    case 'chat': {
      if (me.muted) fail('MUTED', 'The host has muted you.');
      if (recentChatCount(state, actor, now) >= rules.chat.maxPerMinute) {
        fail('LIMIT_REACHED', 'Slow down: too many messages.');
      }
      let text: string;
      if (command.kind === 'preset') {
        text = PRESET_MESSAGES[command.text] ?? fail('INVALID_COMMAND', 'Unknown preset.');
      } else if (command.kind === 'reaction') {
        if (!(REACTIONS as readonly string[]).includes(command.text)) {
          fail('INVALID_COMMAND', 'Unknown reaction.');
        }
        text = command.text;
      } else if (command.kind === 'text') {
        if (state.settings.presetChatOnly)
          fail('CHAT_RESTRICTED', 'This room uses preset chat only.');
        text = filterProfanity(normalizeText(command.text)).slice(0, rules.chat.maxLength);
        if (!text) fail('INVALID_COMMAND', 'Empty message.');
      } else {
        return fail('INVALID_COMMAND', 'Unknown message kind.');
      }
      state.chat.push({ id: state.nextChatId++, at: now, from: actor, kind: command.kind, text });
      if (state.chat.length > rules.chat.historyLimit) {
        state.chat.splice(0, state.chat.length - rules.chat.historyLimit);
      }
      return;
    }
    case 'rematch': {
      requireHost(state, actor);
      requirePhase(state, 'RESULTS');
      resetToLobby(state, now);
      return;
    }
    default:
      fail('INVALID_COMMAND', 'Unknown command.');
  }
}

function resetToLobby(state: GameState, now: number): void {
  const rules = rulesOf(state);
  state.matchIndex += 1;
  state.phase = 'LOBBY';
  state.phaseVersion += 1;
  state.phaseStartedAt = now;
  state.phaseEndsAt = null;
  state.matchStartedAt = null;
  state.matchCapAt = null;
  state.round = 0;
  state.totalRounds = 0;
  state.operations = [];
  state.commitments = {};
  state.extraIntel = {};
  state.deals = [];
  state.results = null;
  // A rematch keeps the rules version the room was created with.
  for (const p of state.players) {
    p.ready = false;
    p.credits = rules.economy.startingCredits;
    p.influence = 0;
    p.suspicion = 0;
    p.intel = [];
  }
  addLog(state, now, 'rematch', { match: state.matchIndex });
}

function applySystemCommand(state: GameState, env: CommandEnvelope): void {
  const { now } = env;
  const command = env.command;
  switch (command.type) {
    case 'join': {
      requirePhase(state, 'LOBBY', 'RESULTS');
      const name =
        cleanName(command.name) ?? fail('INVALID_COMMAND', 'Choose a different nickname.');
      seatPlayer(state, command.playerId, name, command.avatar, now);
      return;
    }
    case 'presence': {
      const p = findPlayer(state, command.playerId);
      if (!p || p.connected === command.connected) return;
      p.connected = command.connected;
      if (isInMatch(state.phase)) {
        addLog(state, now, command.connected ? 'player_reconnected' : 'player_disconnected', {
          player: p.id,
        });
        if (!command.connected) maybeAdvanceEarly(state, now);
      } else if (!command.connected) {
        transferHostIfNeeded(state, now);
      }
      return;
    }
    case 'tick': {
      if (state.phaseEndsAt !== null && now >= state.phaseEndsAt) transitionPhase(state, now);
      return;
    }
    default:
      fail('INVALID_COMMAND', 'Unknown system command.');
  }
}

const SYSTEM_COMMANDS = new Set(['join', 'presence', 'tick']);

/**
 * Applies one command. Never mutates the input state. Invalid commands return an
 * error and leave the state unchanged.
 */
export function applyCommand(state: GameState, env: CommandEnvelope): ApplyResult {
  const next = structuredClone(state);
  try {
    if (SYSTEM_COMMANDS.has(env.command.type)) {
      if (env.actor !== 'system') fail('INVALID_COMMAND', 'Not allowed.');
      applySystemCommand(next, env);
    } else {
      if (env.actor === 'system') fail('INVALID_COMMAND', 'Players only.');
      applyPlayerCommand(next, env);
    }
    return { ok: true, state: next };
  } catch (err) {
    if (err instanceof RuleError) {
      const error: EngineError = { code: err.code, message: err.message };
      return { ok: false, error };
    }
    throw err;
  }
}

/** Advances time-driven transitions; safe to call at any time. */
export function tick(state: GameState, now: number): GameState {
  const result = applyCommand(state, { actor: 'system', now, command: { type: 'tick' } });
  return result.ok ? result.state : state;
}

export { ROUND_PHASES };
