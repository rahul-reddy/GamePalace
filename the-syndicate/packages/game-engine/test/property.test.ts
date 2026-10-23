import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  checkInvariants,
  deserialize,
  replay,
  serialize,
  type CommandEnvelope,
  type DealTerm,
  type GameState,
  type PlayerCommand,
} from '../src';
import { cmd, lobby, started, T0 } from './helpers';

const anyCommand = (
  n: number,
): fc.Arbitrary<{ actor: string; command: PlayerCommand; dt: number }> =>
  fc.record({
    actor: fc.integer({ min: 1, max: n + 1 }).map((i) => `p${i}`),
    dt: fc.integer({ min: 0, max: 90_000 }),
    command: fc.oneof(
      fc.record({ type: fc.constant('setReady' as const), ready: fc.boolean() }),
      fc.record({ type: fc.constant('commit' as const), amount: fc.integer({ min: -2, max: 6 }) }),
      fc.constant({ type: 'buyIntel' as const }),
      fc.record({
        type: fc.constant('proposeDeal' as const),
        invitees: fc.array(
          fc.integer({ min: 1, max: n + 1 }).map((i) => `p${i}`),
          { maxLength: 3 },
        ),
        terms: fc.constant<DealTerm[]>([{ kind: 'commit', amount: 2 }]),
        note: fc.string({ maxLength: 100 }),
      }),
      fc.record({
        type: fc.constant('respondDeal' as const),
        dealId: fc.constantFrom('d1', 'd2', 'd3'),
        accept: fc.boolean(),
      }),
      fc.record({
        type: fc.constant('chat' as const),
        kind: fc.constant('text' as const),
        text: fc.string({ maxLength: 200 }),
      }),
      fc.constant({ type: 'rematch' as const }),
      fc.constant({ type: 'start' as const }),
      fc.constant({ type: 'leave' as const }),
    ),
  });

function run(
  n: number,
  seed: string,
  ops: { actor: string; command: PlayerCommand; dt: number }[],
) {
  let state = started(n, seed);
  let now = T0;
  const log: CommandEnvelope[] = [];
  const violations: string[] = [];
  const push = (env: CommandEnvelope) => {
    log.push(env);
    const result = applyCommand(state, env);
    if (result.ok) {
      violations.push(...checkInvariants(state, result.state));
      state = result.state;
    }
  };
  for (const op of ops) {
    now += op.dt;
    push({ actor: 'system', now, command: { type: 'tick' } });
    push({ actor: op.actor, now, command: op.command, seed: `${seed}-${now}` });
  }
  return { state, log, violations };
}

describe('engine properties', () => {
  it('keeps credits, influence, commitments and phases valid under arbitrary command sequences', () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 4, max: 12 })
          .chain((n) => fc.tuple(fc.constant(n), fc.array(anyCommand(n), { maxLength: 120 }))),
        fc.string({ maxLength: 8 }),
        ([n, ops], seed) => {
          const { violations } = run(n, `s-${seed}`, ops);
          expect(violations).toEqual([]);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('replays a logged command sequence to the identical state', () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 4, max: 8 })
          .chain((n) => fc.tuple(fc.constant(n), fc.array(anyCommand(n), { maxLength: 80 }))),
        ([n, ops]) => {
          const initial = lobby(n);
          // Rebuild the setup commands so the replay starts from createGame.
          const setup: CommandEnvelope[] = [];
          for (let i = 2; i <= n; i++) {
            setup.push({
              actor: 'system',
              now: T0,
              command: { type: 'join', playerId: `p${i}`, name: `Player ${i}`, avatar: 'owl' },
            });
          }
          for (let i = 2; i <= n; i++) setup.push(cmd(`p${i}`, { type: 'setReady', ready: true }));
          setup.push(cmd('p1', { type: 'start' }, T0, 'replay-seed'));
          const live = run(n, 'replay-seed', ops);
          const replayed = replay({
            create: {
              hostId: 'p1',
              hostName: 'Ada',
              hostAvatar: 'fox',
              now: T0,
              rulesVersion: '1.0.0',
              settings: { beginner: false },
            },
            seed: 'lobby-seed',
            commands: [...setup, ...live.log],
          });
          expect(initial.players).toHaveLength(n);
          expect(serialize(replayed)).toBe(serialize(live.state));
        },
      ),
      { numRuns: 60 },
    );
  });

  it('round-trips through serialization', () => {
    const state = started(6);
    expect(deserialize(serialize(state))).toEqual(state);
    expect(() => deserialize(JSON.stringify({ ...state, schema: 2 }))).toThrow();
  });

  it('applies duplicate submissions of the same commitment only once', () => {
    let state: GameState = started(4);
    while (state.phase !== 'COMMITMENT') {
      state = applyCommand(state, {
        actor: 'system',
        now: (state.phaseEndsAt ?? T0) + 1,
        command: { type: 'tick' },
      }).ok
        ? (
            applyCommand(state, {
              actor: 'system',
              now: (state.phaseEndsAt ?? T0) + 1,
              command: { type: 'tick' },
            }) as { state: GameState }
          ).state
        : state;
    }
    const env = cmd('p1', { type: 'commit', amount: 3 });
    const first = applyCommand(state, env);
    expect(first.ok).toBe(true);
    const second = applyCommand((first as { state: GameState }).state, env);
    expect(second.ok).toBe(false);
    expect((first as { state: GameState }).state.players[0]?.credits).toBe(7);
  });
});
