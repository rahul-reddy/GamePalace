// The secrecy boundary. Every byte a client receives about the game comes from
// redactViewForPlayer. It builds the view field by field from an allowlist instead
// of deleting secrets from a copy, so a new secret field in GameState stays private
// unless someone deliberately adds it here.
import { currentOperation, findPlayer, intelCost, isInMatch } from './engine';
import { getRules, scenarioById, type Scenario } from './rules';
import type {
  ChatMessage,
  Deal,
  GameState,
  Highlight,
  IntelReport,
  LogEntry,
  MatchSettings,
  Operation,
  Phase,
  ScoreBreakdown,
  Tier,
  Avatar,
} from './types';

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: Avatar;
  seat: number;
  connected: boolean;
  influence: number;
  suspicion: number;
  ready: boolean;
  muted: boolean;
  /** True once this player's commitment for the current round is sealed (amount stays hidden). */
  sealed: boolean;
}

export interface OperationAudit {
  trueBase: number;
  finalChance: number;
  roll: number;
}

export interface PublicOperationResult {
  status: 'SUCCESS' | 'FAILURE' | 'ABANDONED';
  totalCommitted: number;
  participants: number;
  targetMet: boolean;
  /** Revealed at resolution: what each player actually committed. */
  commitments: Record<string, number>;
  influence: Record<string, number>;
  /** Only during the final reckoning and results. */
  audit: OperationAudit | null;
}

export interface PublicOperation {
  round: number;
  name: string;
  tier: Tier;
  scenario: Scenario;
  publicLow: number;
  publicHigh: number;
  pool: number;
  targetCapital: number;
  result: PublicOperationResult | null;
}

export interface SelfView {
  id: string;
  credits: number;
  intel: IntelReport[];
  /** Sealed commitment for the current round, or null if not yet sealed. */
  committed: number | null;
  boughtIntel: boolean;
  intelCost: number;
  maxCommit: number;
}

export interface ResultsView {
  scores: ScoreBreakdown[];
  winners: string[];
  highlights: Highlight[];
  finalCredits: Record<string, number>;
  /** Revealed only in RESULTS. */
  seed: string | null;
}

export interface RulesSummary {
  version: string;
  minPlayers: number;
  maxPlayers: number;
  maxCommit: number;
  startingCredits: number;
  creditCap: number;
  sitOutCredits: number;
  creditsPerScorePoint: number;
  targetBonus: number;
  shareCapPerCredit: number;
  roundsStandard: number;
  roundsQuick: number;
}

export interface PlayerView {
  rules: RulesSummary;
  matchIndex: number;
  phase: Phase;
  phaseVersion: number;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  round: number;
  totalRounds: number;
  settings: MatchSettings;
  hostId: string;
  players: PublicPlayer[];
  self: SelfView;
  operation: PublicOperation | null;
  history: PublicOperation[];
  deals: Deal[];
  chat: ChatMessage[];
  log: LogEntry[];
  results: ResultsView | null;
}

function publicOperation(state: GameState, op: Operation, revealAudit: boolean): PublicOperation {
  const rules = getRules(state.rulesVersion);
  let result: PublicOperationResult | null = null;
  if (op.result) {
    const commitments: Record<string, number> = {};
    const influence: Record<string, number> = {};
    for (const [id, payout] of Object.entries(op.result.payouts)) {
      commitments[id] = payout.committed;
      influence[id] = payout.influence;
    }
    result = {
      status: op.result.status,
      totalCommitted: op.result.totalCommitted,
      participants: op.result.participants,
      targetMet: op.result.targetMet,
      commitments,
      influence,
      audit: revealAudit
        ? { trueBase: op.trueBase, finalChance: op.result.finalChance, roll: op.roll }
        : null,
    };
  }
  return {
    round: op.round,
    name: op.name,
    tier: op.tier,
    scenario: { ...scenarioById(rules, op.scenarioId) },
    publicLow: op.publicLow,
    publicHigh: op.publicHigh,
    pool: op.pool,
    targetCapital: op.targetCapital,
    result,
  };
}

function visibleTo(entry: LogEntry, playerId: string): boolean {
  return entry.to === undefined || entry.to.includes(playerId);
}

function copyLog(entry: LogEntry): LogEntry {
  // `to` is dropped: recipients of a private entry are not themselves public.
  return {
    id: entry.id,
    at: entry.at,
    round: entry.round,
    kind: entry.kind,
    data: { ...entry.data },
  };
}

/** Builds the only state representation that may be sent to `playerId`. */
export function redactViewForPlayer(state: GameState, playerId: string): PlayerView {
  const rules = getRules(state.rulesVersion);
  const me = findPlayer(state, playerId);
  if (!me) throw new Error('Cannot build a view for a player who is not seated');
  const revealAudit = state.phase === 'FINAL_RECKONING' || state.phase === 'RESULTS';
  const roundCommits = state.commitments[state.round] ?? {};
  const inCommitWindow = state.phase === 'COMMITMENT';
  const op = isInMatch(state.phase) ? currentOperation(state) : undefined;
  const players: PublicPlayer[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    seat: p.seat,
    connected: p.connected,
    influence: p.influence,
    suspicion: p.suspicion,
    ready: p.ready,
    muted: p.muted,
    sealed: inCommitWindow && roundCommits[p.id] !== undefined,
  }));
  const committed = roundCommits[playerId];
  const self: SelfView = {
    id: me.id,
    credits: me.credits,
    intel: me.intel.map((i) => ({ ...i })),
    committed: committed === undefined ? null : committed,
    boughtIntel: (state.extraIntel[state.round] ?? []).includes(playerId),
    intelCost: op ? intelCost(state) : rules.intel.extraCost,
    maxCommit: Math.min(rules.economy.maxCommit, me.credits),
  };
  let results: ResultsView | null = null;
  if (state.results && revealAudit) {
    results = {
      scores: state.results.scores.map((s) => ({ ...s })),
      winners: [...state.results.winners],
      highlights: state.results.highlights.map((h) => ({ ...h })),
      finalCredits: Object.fromEntries(state.players.map((p) => [p.id, p.credits])),
      seed: state.phase === 'RESULTS' ? state.results.seed : null,
    };
  }
  return {
    rules: {
      version: rules.version,
      minPlayers: rules.players.min,
      maxPlayers: rules.players.max,
      maxCommit: rules.economy.maxCommit,
      startingCredits: rules.economy.startingCredits,
      creditCap: rules.economy.creditCap,
      sitOutCredits: rules.economy.sitOutCredits,
      creditsPerScorePoint: rules.economy.creditsPerScorePoint,
      targetBonus: rules.operations.targetBonus,
      shareCapPerCredit: rules.operations.shareCapPerCredit,
      roundsStandard: rules.rounds.standard,
      roundsQuick: rules.rounds.quick,
    },
    matchIndex: state.matchIndex,
    phase: state.phase,
    phaseVersion: state.phaseVersion,
    phaseStartedAt: state.phaseStartedAt,
    phaseEndsAt: state.phaseEndsAt,
    round: state.round,
    totalRounds: state.totalRounds,
    settings: { ...state.settings },
    hostId: state.hostId,
    players,
    self,
    operation: op ? publicOperation(state, op, revealAudit) : null,
    history: state.operations
      .filter((o) => o.result && o.round !== op?.round)
      .map((o) => publicOperation(state, o, revealAudit)),
    deals: state.deals.filter((d) => d.members.includes(playerId)).map((d) => structuredClone(d)),
    chat: state.chat.map((m) => ({ ...m })),
    log: state.log
      .filter((e) => visibleTo(e, playerId))
      .slice(-80)
      .map(copyLog),
    results,
  };
}
