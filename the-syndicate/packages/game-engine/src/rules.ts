// Versioned rule sets. A room records the rules version it started with and keeps
// using it until the match ends, so deploying new rules never changes a game in
// progress. Add a new JSON file and registry entry for every rules change; never
// edit a released version in place.
import rules100 from '../../../config/rules-1.0.0.json' with { type: 'json' };
import rules200 from '../../../config/rules-2.0.0.json' with { type: 'json' };
import type { AbilityKind, Archetype, ObjectiveId, Pace, Tier, TimedPhase } from './types';

export interface TierRules {
  baseMin: number;
  baseMax: number;
  poolPerPlayer: number;
}

export interface Scenario {
  id: string;
  name: string;
  successDelta: number;
  poolMultiplier: number;
  targetMultiplier: number;
  intelCostDelta: number;
}

export interface RoleDefinition {
  archetype: Archetype;
  name: string;
  ability: AbilityKind;
  charges: number;
  /** Ability parameters; see docs/RULES.md for each ability's meaning. */
  params: Record<string, number | string>;
}

export interface RoleRules {
  definitions: Record<string, RoleDefinition>;
  /** Player count -> fixed roles plus `pick` drawn at random from `from`. */
  distribution: Record<string, { fixed: string[]; pick: number; from: string[] }>;
  maxSabotagePerOperation: number;
}

export interface SuspicionRules {
  max: number;
  freeAllowance: number;
  maxPenalty: number;
  accusationRaise: number;
  maxAccusationRaisePerRound: number;
  exposureRaise: number;
  decayOnSuccess: number;
}

export interface ObjectiveRule {
  id: ObjectiveId;
  bonus: number;
  standard: number;
  quick: number;
}

export interface RulesConfig {
  version: string;
  players: { min: number; max: number };
  economy: {
    startingCredits: number;
    creditCap: number;
    maxCommit: number;
    sitOutCredits: number;
    creditsPerScorePoint: number;
  };
  rounds: { standard: number; quick: number };
  timing: {
    phaseMs: Record<TimedPhase, number>;
    paceMultipliers: Record<Pace, number>;
    matchCapMs: number;
  };
  operations: {
    tiers: Record<Tier, TierRules>;
    publicWindow: number;
    targetCapitalPerPlayer: number;
    targetBonus: number;
    shareCapPerCredit: number;
    minSuccess: number;
    maxSuccess: number;
    names: string[];
    scenarios: Scenario[];
  };
  intel: { basicNoise: number; extraNoise: number; extraCost: number; roundTo: number };
  chat: { maxLength: number; maxPerMinute: number; historyLimit: number };
  deals: { maxOpenPerPlayer: number; maxNoteLength: number };
  /** Present from rules 2.0.0: secret roles, suspicion, accusations and hidden objectives. */
  roles?: RoleRules;
  suspicion?: SuspicionRules;
  accusations?: { perMatch: number; perRound: number; correctBonus: number; wrongPenalty: number };
  objectives?: ObjectiveRule[];
}

const registry: Record<string, RulesConfig> = {
  '1.0.0': rules100 as RulesConfig,
  '2.0.0': rules200 as RulesConfig,
};

export const CURRENT_RULES_VERSION = '2.0.0';

export function getRules(version: string): RulesConfig {
  const rules = registry[version];
  if (!rules) throw new Error(`Unknown rules version ${version}`);
  return rules;
}

export function listRulesVersions(): string[] {
  return Object.keys(registry);
}

export function scenarioById(rules: RulesConfig, id: string): Scenario {
  const scenario = rules.operations.scenarios.find((s) => s.id === id);
  if (!scenario) throw new Error(`Unknown scenario ${id}`);
  return scenario;
}
