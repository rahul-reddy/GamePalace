import { describe, expect, it } from 'vitest';
import { BOT_STYLES, legalActions, redactViewForPlayer, type GameState } from '../src';
import { cmd, err, lobby, ok, T0 } from './helpers';

function addBot(state: GameState, id: string, actor = 'p1'): GameState {
  return ok(state, { ...cmd(actor, { type: 'addBot' }), newPlayerId: id });
}

describe('practice bots', () => {
  it('lets only the host add bots, outside a match, with a server id, up to the seat limit', () => {
    let state = lobby(2, {}, '2.0.0');
    expect(err(state, { ...cmd('p2', { type: 'addBot' }), newPlayerId: 'b1' })).toBe('NOT_HOST');
    expect(err(state, cmd('p1', { type: 'addBot' }))).toBe('INVALID_COMMAND');
    expect(legalActions(state, 'p1').some((a) => a.type === 'addBot')).toBe(true);
    expect(legalActions(state, 'p2').some((a) => a.type === 'addBot')).toBe(false);
    for (let i = 1; i <= 10; i++) state = addBot(state, `b${i}`);
    expect(state.players).toHaveLength(12);
    expect(err(state, { ...cmd('p1', { type: 'addBot' }), newPlayerId: 'b11' })).toBe('ROOM_FULL');
    expect(legalActions(state, 'p1').some((a) => a.type === 'addBot')).toBe(false);
    const bots = state.players.filter((p) => p.bot);
    expect(bots.every((b) => b.ready && b.connected && b.name.endsWith('(bot)'))).toBe(true);
    expect(new Set(bots.map((b) => b.name)).size).toBe(bots.length);
    expect(bots.map((b) => b.bot)).toEqual(bots.map((_, i) => BOT_STYLES[i % BOT_STYLES.length]));
  });

  it('marks bots publicly without revealing their play style', () => {
    const state = addBot(lobby(1, {}, '2.0.0'), 'b1');
    const view = redactViewForPlayer(state, 'p1');
    expect(view.players.map((p) => p.bot)).toEqual([false, true]);
    expect(JSON.stringify(view.players)).not.toContain(BOT_STYLES[0] as string);
  });

  it('lets one person start a game with three bots, and keeps bots ready across settings and rematch', () => {
    let state = lobby(1, { beginner: false }, '2.0.0');
    for (const id of ['b1', 'b2', 'b3']) state = addBot(state, id);
    state = ok(state, cmd('p1', { type: 'updateSettings', settings: { length: 'quick' } }));
    expect(state.players.filter((p) => p.bot).every((p) => p.ready)).toBe(true);
    state = ok(state, cmd('p1', { type: 'start' }, T0, 'solo-seed'));
    expect(state.phase).toBe('ROLE_REVEAL');
    expect(state.players.every((p) => p.role)).toBe(true);
  });

  it('never advances early on bots alone: a connected person must be done too', () => {
    let state = lobby(1, { beginner: false }, '2.0.0');
    for (const id of ['b1', 'b2', 'b3']) state = addBot(state, id);
    state = ok(state, cmd('p1', { type: 'start' }, T0, 'solo-seed'));
    for (const id of ['b1', 'b2', 'b3'])
      state = ok(state, cmd(id, { type: 'setReady', ready: true }));
    expect(state.phase).toBe('ROLE_REVEAL');
    // The person leaves: bots are all done, but the game waits for the deadline.
    state = ok(state, {
      actor: 'system',
      now: T0,
      command: { type: 'presence', playerId: 'p1', connected: false },
    });
    expect(state.phase).toBe('ROLE_REVEAL');
    state = ok(state, {
      actor: 'system',
      now: T0,
      command: { type: 'presence', playerId: 'p1', connected: true },
    });
    state = ok(state, cmd('p1', { type: 'setReady', ready: true }));
    expect(state.phase).toBe('INTELLIGENCE');
  });

  it('never hands hosting to a bot', () => {
    let state = lobby(2, {}, '2.0.0');
    state = addBot(state, 'b1');
    state = ok(state, {
      actor: 'system',
      now: T0,
      command: { type: 'presence', playerId: 'p1', connected: false },
    });
    expect(state.hostId).toBe('p2');
    let solo = addBot(lobby(1, {}, '2.0.0'), 'b1');
    solo = ok(solo, {
      actor: 'system',
      now: T0,
      command: { type: 'presence', playerId: 'p1', connected: false },
    });
    expect(solo.hostId).toBe('p1');
    let leaving = addBot(addBot(lobby(2, {}, '2.0.0'), 'b1'), 'b2');
    leaving = ok(leaving, cmd('p1', { type: 'leave' }));
    expect(leaving.hostId).toBe('p2');
    const kicked = ok(
      addBot(lobby(1, {}, '2.0.0'), 'b1'),
      cmd('p1', { type: 'kick', target: 'b1' }),
    );
    expect(kicked.players).toHaveLength(1);
  });
});
