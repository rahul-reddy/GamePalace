import { applyCommand, createGame, type CreateGameConfig } from './engine';
import type { CommandEnvelope, GameState } from './types';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/**
 * Parses stored state and upgrades rooms saved by older code in place, so a deploy
 * never breaks a match in progress. Fields added since schema 1 was introduced get
 * the defaults a room created without them would have had.
 */
export function deserialize(text: string): GameState {
  const state = JSON.parse(text) as GameState;
  if (state.schema !== 1) throw new Error(`Unsupported state schema ${String(state.schema)}`);
  state.abilityUses ??= [];
  state.accusations ??= [];
  for (const p of state.players) {
    p.role ??= null;
    p.objective ??= null;
    p.charges ??= 0;
    p.accusationsMade ??= 0;
    p.accusedInRound ??= 0;
  }
  if (state.results) state.results.reveals ??= [];
  return state;
}

export interface ReplayLog {
  create: CreateGameConfig;
  seed: string;
  commands: CommandEnvelope[];
}

/**
 * Re-applies a logged command sequence. Rejected commands are skipped exactly as
 * they were live, so the replay reaches the same state byte for byte.
 */
export function replay(log: ReplayLog): GameState {
  let state = createGame(log.create, log.seed);
  for (const env of log.commands) {
    const result = applyCommand(state, env);
    if (result.ok) state = result.state;
  }
  return state;
}
