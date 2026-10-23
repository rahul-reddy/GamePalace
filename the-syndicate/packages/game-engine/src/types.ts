// State, command and view types for THE SYNDICATE. GameState is the authoritative
// server-side record and contains secrets; clients only ever receive a PlayerView
// produced by redactViewForPlayer.

export const PHASES = [
  'LOBBY',
  'ROLE_REVEAL',
  'INTELLIGENCE',
  'NEGOTIATION',
  'COMMITMENT',
  'RESOLUTION',
  'ROUND_SUMMARY',
  'FINAL_RECKONING',
  'RESULTS',
] as const;
export type Phase = (typeof PHASES)[number];
export type TimedPhase = Exclude<Phase, 'LOBBY' | 'RESULTS'>;

export const TIERS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type Tier = (typeof TIERS)[number];

export type Pace = 'fast' | 'normal' | 'relaxed';
export type MatchLength = 'standard' | 'quick';

export interface MatchSettings {
  length: MatchLength;
  pace: Pace;
  /** Beginner mode adds guided explanations in the client and slows the first round. */
  beginner: boolean;
  /** Only preset messages and reactions are allowed in chat. */
  presetChatOnly: boolean;
}

export const AVATARS = [
  'fox',
  'owl',
  'raven',
  'wolf',
  'cat',
  'stag',
  'viper',
  'moth',
  'hare',
  'bear',
  'lynx',
  'crane',
] as const;
export type Avatar = (typeof AVATARS)[number];

export const ARCHETYPES = [
  'broker',
  'insider',
  'fixer',
  'auditor',
  'saboteur',
  'opportunist',
] as const;
export type Archetype = (typeof ARCHETYPES)[number];
export type AbilityKind = 'broker' | 'peek' | 'insure' | 'investigate' | 'sabotage' | 'forecast';
export const OBJECTIVES = [
  'backer',
  'highRoller',
  'reserve',
  'dealmaker',
  'cleanHands',
  'promiseKeeper',
  'contrarian',
  'investor',
] as const;
export type ObjectiveId = (typeof OBJECTIVES)[number];

export interface IntelReport {
  /** Round the estimate is about. */
  targetRound: number;
  /** Round in which the report was received. */
  receivedRound: number;
  source: 'rumor' | 'contact' | 'insider';
  /** Estimated base success chance, rounded. */
  estimate: number;
  /** Documented maximum error of this source (true value lies within estimate +/- this, before rounding). */
  margin: number;
}

export interface PlayerState {
  id: string;
  name: string;
  avatar: Avatar;
  seat: number;
  connected: boolean;
  /** Private. */
  credits: number;
  /** Public. */
  influence: number;
  /** Public. */
  suspicion: number;
  /** Phase readiness ("done") in the current phase; lobby readiness before start. */
  ready: boolean;
  muted: boolean;
  /** Private intel reports. */
  intel: IntelReport[];
  /** Secret role id (rules with roles only), null otherwise. */
  role: string | null;
  /** Secret hidden objective (rules with roles only). */
  objective: ObjectiveId | null;
  /** Remaining uses of the role ability. */
  charges: number;
  accusationsMade: number;
  /** Last round in which accusations raised this player's suspicion. */
  accusedInRound: number;
}

/** A use of a role ability. Secret until the final reckoning (except what it publicly causes). */
export interface AbilityUse {
  round: number;
  player: string;
  ability: AbilityKind;
  target: string | null;
  /** peek: 'current' | 'next'; forecast: 'SUCCESS' | 'FAILURE'. */
  choice: string | null;
  /** investigate: the round investigated. */
  targetRound: number | null;
  /** Filled at resolution where relevant (e.g. "refunded 3", "correct"). */
  effect: string | null;
  /** sabotage only: exposure checks performed so far, and whether it has been exposed. */
  checks: number;
  exposed: boolean;
}

export interface Accusation {
  round: number;
  accuser: string;
  target: string;
}

export interface OperationPayout {
  committed: number;
  influence: number;
  creditsReturned: number;
  creditsLost: number;
  sitOutCredits: number;
  /** Credits refunded by a Fixer's insurance (secret until the final reckoning). */
  insuranceRefund?: number;
}

export interface OperationResult {
  status: 'SUCCESS' | 'FAILURE' | 'ABANDONED';
  totalCommitted: number;
  participants: number;
  targetMet: boolean;
  /** Final success chance after every modifier. Secret until the final reckoning. */
  finalChance: number;
  /** Success-chance points removed by sabotage (capped). Secret until the final reckoning. */
  sabotage?: number;
  payouts: Record<string, OperationPayout>;
  /** Influence from role abilities this round (secret until the final reckoning). */
  bonuses?: Record<string, { source: string; amount: number }[]>;
}

export interface Operation {
  round: number;
  name: string;
  tier: Tier;
  scenarioId: string;
  /** Secret: true base success chance. */
  trueBase: number;
  /** Public window that contains trueBase. */
  publicLow: number;
  publicHigh: number;
  /** Secret: the pre-drawn roll; success when roll < finalChance. */
  roll: number;
  /** Public: influence shared among participants on success. */
  pool: number;
  /** Public: total commitment that earns the coordination bonus. */
  targetCapital: number;
  result: OperationResult | null;
}

export type DealTerm =
  | { kind: 'commit'; amount: number }
  | { kind: 'shareIntel' }
  | { kind: 'noAccuse' }
  | { kind: 'backNext' };

export type DealResponse = 'pending' | 'accepted' | 'declined';

export interface Deal {
  id: string;
  round: number;
  proposer: string;
  /** Everyone in the deal including the proposer. */
  members: string[];
  terms: DealTerm[];
  note: string;
  responses: Record<string, DealResponse>;
  createdAt: number;
  /** Filled after resolution for 'commit' terms: did each accepted member keep it? */
  kept: Record<string, boolean> | null;
}

export interface ChatMessage {
  id: number;
  at: number;
  from: string;
  kind: 'text' | 'preset' | 'reaction';
  text: string;
}

export type LogKind =
  | 'player_joined'
  | 'player_left'
  | 'player_kicked'
  | 'host_changed'
  | 'match_started'
  | 'phase'
  | 'operation_announced'
  | 'intel_received'
  | 'intel_bought'
  | 'deal_proposed'
  | 'deal_answered'
  | 'commitment_sealed'
  | 'operation_resolved'
  | 'deal_broken'
  | 'player_disconnected'
  | 'player_reconnected'
  | 'auto_pass'
  | 'match_capped'
  | 'match_finished'
  | 'rematch'
  | 'ability_used'
  | 'ability_result'
  | 'insured'
  | 'accusation'
  | 'exposed'
  | 'bonus';

export interface LogEntry {
  id: number;
  at: number;
  round: number;
  kind: LogKind;
  /** Undefined means public. Otherwise only these players may see the entry. */
  to?: string[];
  data: Record<string, string | number | boolean | null>;
}

export interface ScoreBreakdown {
  playerId: string;
  influence: number;
  creditPoints: number;
  objectiveBonus: number;
  /** Correct accusations of a saboteur, awarded at the final reckoning. */
  accusationBonus: number;
  /** Suspicion penalty plus wrong-accusation penalties. */
  penalties: number;
  total: number;
  rank: number;
  winner: boolean;
}

export interface RoleReveal {
  playerId: string;
  role: string | null;
  objective: ObjectiveId | null;
  objectiveMet: boolean;
  accusationBonus: number;
  accusationPenalty: number;
  suspicionPenalty: number;
  /** Ability costs: fines for exposed sabotage and wrong forecasts. */
  abilityPenalty: number;
}

export interface FinalResults {
  scores: ScoreBreakdown[];
  reveals: RoleReveal[];
  winners: string[];
  /** The match seed, revealed so the outcomes can be audited against the rules. */
  seed: string;
  highlights: Highlight[];
}

export interface Highlight {
  kind:
    | 'biggest_score'
    | 'best_investor'
    | 'boldest_bet'
    | 'broken_promise'
    | 'loyal_partner'
    | 'cautious';
  playerId: string;
  value: number;
}

export interface GameState {
  schema: 1;
  rulesVersion: string;
  /** Secret until RESULTS. */
  seed: string;
  matchIndex: number;
  settings: MatchSettings;
  hostId: string;
  phase: Phase;
  /** Incremented on every phase change; commands may carry it to detect stale submissions. */
  phaseVersion: number;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  matchStartedAt: number | null;
  matchCapAt: number | null;
  round: number;
  totalRounds: number;
  players: PlayerState[];
  operations: Operation[];
  /** Secret until each round's resolution: round -> playerId -> credits committed. */
  commitments: Record<number, Record<string, number>>;
  /** round -> playerIds who bought extra intel (private to each buyer). */
  extraIntel: Record<number, string[]>;
  deals: Deal[];
  nextDealId: number;
  chat: ChatMessage[];
  nextChatId: number;
  log: LogEntry[];
  nextLogId: number;
  results: FinalResults | null;
  abilityUses: AbilityUse[];
  accusations: Accusation[];
}

// ---- Commands -------------------------------------------------------------

export type PlayerCommand =
  | { type: 'setReady'; ready: boolean }
  | { type: 'updateSettings'; settings: Partial<MatchSettings> }
  | { type: 'start' }
  | { type: 'kick'; target: string }
  | { type: 'mute'; target: string; muted: boolean }
  | { type: 'leave' }
  | { type: 'buyIntel' }
  | { type: 'commit'; amount: number }
  | { type: 'proposeDeal'; invitees: string[]; terms: DealTerm[]; note: string }
  | { type: 'respondDeal'; dealId: string; accept: boolean }
  | { type: 'chat'; kind: 'text' | 'preset' | 'reaction'; text: string }
  | { type: 'useAbility'; target?: string; choice?: string; targetRound?: number }
  | { type: 'accuse'; target: string }
  | { type: 'rematch' };

/** Commands only the server itself may issue. */
export type SystemCommand =
  | { type: 'join'; playerId: string; name: string; avatar: Avatar }
  | { type: 'presence'; playerId: string; connected: boolean }
  | { type: 'tick' };

export interface CommandEnvelope {
  /** Player id, or 'system' for server-issued commands. */
  actor: string;
  /** Server time in ms. The engine never reads a clock. */
  now: number;
  command: PlayerCommand | SystemCommand;
  /** Fresh secret seed supplied by the server for 'start' and 'rematch'. */
  seed?: string;
}

export type ErrorCode =
  | 'INVALID_COMMAND'
  | 'NOT_ALLOWED_IN_PHASE'
  | 'NOT_HOST'
  | 'NOT_A_PLAYER'
  | 'ROOM_FULL'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_READY'
  | 'MATCH_IN_PROGRESS'
  | 'INSUFFICIENT_CREDITS'
  | 'ALREADY_DONE'
  | 'LIMIT_REACHED'
  | 'UNKNOWN_TARGET'
  | 'MUTED'
  | 'CHAT_RESTRICTED';

export interface EngineError {
  code: ErrorCode;
  message: string;
}

export type ApplyResult = { ok: true; state: GameState } | { ok: false; error: EngineError };
