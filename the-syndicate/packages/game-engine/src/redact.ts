// The secrecy boundary. Every byte a client receives about the game comes from
// redactViewForPlayer. It builds the view field by field from an allowlist instead
// of deleting secrets from a copy, so a new secret field in GameState stays private
// unless someone deliberately adds it here.
import { currentOperation, findPlayer, intelCost, isInMatch } from './engine';
import { getRules, scenarioById, type Scenario } from './rules';
import { roleOf } from './roles';
import type {
  AbilityKind,
  AbilityUse,
  Accusation,
  Archetype,
  ChatMessage,
  ObjectiveId,
  RoleReveal,
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
  /** Public once a sabotage by this player has been exposed. */
  exposed: boolean;
}

export interface OperationAudit {
  trueBase: number;
  finalChance: number;
  roll: number;
  /** Points removed by sabotage, revealed with the roles. */
  sabotage: number;
  /** Ability bonuses and insurance refunds, revealed with the roles. */
  bonuses: Record<string, { source: string; amount: number }[]>;
  refunds: Record<string, number>;
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

export interface RoleView {
  id: string;
  name: string;
  archetype: Archetype;
  ability: AbilityKind;
  charges: number;
  maxCharges: number;
  params: Record<string, number | string>;
}

export interface ObjectiveView {
  id: ObjectiveId;
  bonus: number;
  threshold: number;
}

export interface SelfView {
  id: string;
  role: RoleView | null;
  objective: ObjectiveView | null;
  /** True once this player used their ability in the current round. */
  abilityUsedThisRound: boolean;
  accusationsLeft: number;
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
  /** Every player's secret role and objective, and every ability use. */
  reveals: RoleReveal[];
  abilityUses: AbilityUse[];
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
  /** Public role definitions for the in-game reference (who holds which stays secret). */
  roleCatalog: Omit<RoleView, 'charges'>[];
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
  /** Public: who accused whom, and when. */
  accusations: Accusation[];
  results: ResultsView | null;
  /** Rule features enabled for this room. */
  features: { roles: boolean };
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
        ? {
            trueBase: op.trueBase,
            finalChance: op.result.finalChance,
            roll: op.roll,
            sabotage: op.result.sabotage ?? 0,
            bonuses: structuredClone(op.result.bonuses ?? {}),
            refunds: Object.fromEntries(
              Object.entries(op.result.payouts)
                .filter(([, p]) => p.insuranceRefund)
                .map(([id, p]) => [id, p.insuranceRefund as number]),
            ),
          }
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
    exposed: state.abilityUses.some((u) => u.player === p.id && u.exposed),
  }));
  const committed = roundCommits[playerId];
  const def = roleOf(rules, me);
  const objectiveRule = rules.objectives?.find((o) => o.id === me.objective);
  const self: SelfView = {
    id: me.id,
    role:
      def && me.role
        ? {
            id: me.role,
            name: def.name,
            archetype: def.archetype,
            ability: def.ability,
            charges: me.charges,
            maxCharges: def.charges,
            params: { ...def.params },
          }
        : null,
    objective:
      objectiveRule && me.objective
        ? {
            id: me.objective,
            bonus: objectiveRule.bonus,
            threshold:
              state.settings.length === 'quick' ? objectiveRule.quick : objectiveRule.standard,
          }
        : null,
    abilityUsedThisRound: state.abilityUses.some(
      (u) => u.player === playerId && u.round === state.round,
    ),
    accusationsLeft: rules.accusations
      ? Math.max(0, rules.accusations.perMatch - me.accusationsMade)
      : 0,
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
      reveals: state.results.reveals.map((r) => ({ ...r })),
      abilityUses: state.abilityUses.map((u) => ({ ...u })),
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
      roleCatalog: Object.entries(rules.roles?.definitions ?? {}).map(([id, d]) => ({
        id,
        name: d.name,
        archetype: d.archetype,
        ability: d.ability,
        maxCharges: d.charges,
        params: { ...d.params },
      })),
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
    accusations: state.accusations.map((a) => ({ ...a })),
    results,
    features: { roles: rules.roles !== undefined },
  };
}
