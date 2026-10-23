import {
  applyCommand,
  createGame,
  type CommandEnvelope,
  type GameState,
  type MatchSettings,
  type PlayerCommand,
} from '../src';

export const T0 = 1_700_000_000_000;

export function ok(state: GameState, env: CommandEnvelope): GameState {
  const result = applyCommand(state, env);
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
  return result.state;
}

export function err(state: GameState, env: CommandEnvelope): string {
  const result = applyCommand(state, env);
  if (result.ok) throw new Error(`expected ${env.command.type} to be rejected`);
  return result.error.code;
}

export function cmd(
  actor: string,
  command: PlayerCommand,
  now = T0,
  seed?: string,
): CommandEnvelope {
  return seed ? { actor, now, command, seed } : { actor, now, command };
}

export function lobby(n: number, settings: Partial<MatchSettings> = {}): GameState {
  let state = createGame(
    {
      hostId: 'p1',
      hostName: 'Ada',
      hostAvatar: 'fox',
      now: T0,
      settings: { beginner: false, ...settings },
    },
    'lobby-seed',
  );
  for (let i = 2; i <= n; i++) {
    state = ok(state, {
      actor: 'system',
      now: T0,
      command: { type: 'join', playerId: `p${i}`, name: `Player ${i}`, avatar: 'owl' },
    });
  }
  return state;
}

/** A started match in ROLE_REVEAL with `n` players. */
export function started(
  n: number,
  seed = 'test-seed',
  settings: Partial<MatchSettings> = {},
): GameState {
  let state = lobby(n, settings);
  for (let i = 2; i <= n; i++) state = ok(state, cmd(`p${i}`, { type: 'setReady', ready: true }));
  return ok(state, cmd('p1', { type: 'start' }, T0, seed));
}

export function tickTo(state: GameState, now: number): GameState {
  return ok(state, { actor: 'system', now, command: { type: 'tick' } });
}

/** Lets the current phase's deadline pass. */
export function expire(state: GameState): GameState {
  return tickTo(state, (state.phaseEndsAt ?? T0) + 1);
}

/** Expires phases until `phase` is reached. */
export function advanceTo(state: GameState, phase: GameState['phase']): GameState {
  let s = state;
  for (let guard = 0; s.phase !== phase; guard++) {
    if (guard > 100) throw new Error(`never reached ${phase}`);
    s = expire(s);
  }
  return s;
}

export function allCommit(state: GameState, amount: number | ((id: string) => number)): GameState {
  let s = state;
  for (const p of state.players) {
    if (s.phase !== 'COMMITMENT') break;
    if (s.commitments[s.round]?.[p.id] !== undefined) continue;
    const a = typeof amount === 'number' ? amount : amount(p.id);
    s = ok(s, cmd(p.id, { type: 'commit', amount: a }, s.phaseStartedAt + 1));
  }
  return s;
}
