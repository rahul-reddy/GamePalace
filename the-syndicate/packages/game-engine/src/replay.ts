import { applyCommand, createGame, type CreateGameConfig } from './engine';
import type { CommandEnvelope, GameState } from './types';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(text: string): GameState {
  const state = JSON.parse(text) as GameState;
  if (state.schema !== 1) throw new Error(`Unsupported state schema ${String(state.schema)}`);
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
