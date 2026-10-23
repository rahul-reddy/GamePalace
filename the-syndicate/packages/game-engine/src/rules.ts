// Versioned rule sets. A room records the rules version it started with and keeps
// using it until the match ends, so deploying new rules never changes a game in
// progress. Add a new JSON file and registry entry for every rules change; never
// edit a released version in place.
import rules100 from '../../../config/rules-1.0.0.json';
import type { Pace, Tier, TimedPhase } from './types';

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
}

const registry: Record<string, RulesConfig> = {
  '1.0.0': rules100 as RulesConfig,
};

export const CURRENT_RULES_VERSION = '1.0.0';

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
