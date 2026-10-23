import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createGame,
  determineWinners,
  generateOperations,
  getRules,
  legalActions,
  listRulesVersions,
  nextPhase,
  phaseDuration,
  scenarioById,
  splitPool,
  successChance,
  tick,
  type GameState,
} from '../src';
import { advanceTo, allCommit, cmd, err, expire, lobby, ok, started, T0, tickTo } from './helpers';

const rules = getRules('1.0.0');

describe('lobby', () => {
  it('seats the host and up to 12 players', () => {
    const state = lobby(12);
    expect(state.players).toHaveLength(12);
    expect(state.players.map((p) => p.seat)).toEqual([...Array(12).keys()]);
    expect(
      err(state, {
        actor: 'system',
        now: T0,
        command: { type: 'join', playerId: 'p13', name: 'X', avatar: 'fox' },
      }),
    ).toBe('ROOM_FULL');
  });

  it('cleans names, de-duplicates them and refuses offensive ones', () => {
    let state = lobby(1);
    state = ok(state, {
      actor: 'system',
      now: T0,
      command: { type: 'join', playerId: 'p2', name: '  ada\u0000  ', avatar: 'owl' },
    });
    expect(state.players[1]?.name).toBe('ada 2');
    expect(
      err(state, {
        actor: 'system',
        now: T0,
        command: { type: 'join', playerId: 'p3', name: 'fuckface', avatar: 'owl' },
      }),
    ).toBe('INVALID_COMMAND');
    expect(
      err(state, {
        actor: 'system',
        now: T0,
        command: { type: 'join', playerId: 'p3', name: '   ', avatar: 'owl' },
      }),
    ).toBe('INVALID_COMMAND');
    expect(
      err(state, {
        actor: 'system',
        now: T0,
        command: { type: 'join', playerId: 'p2', name: 'Again', avatar: 'owl' },
      }),
    ).toBe('INVALID_COMMAND');
    expect(() =>
      createGame({ hostId: 'h', hostName: '', hostAvatar: 'fox', now: T0 }, 's'),
    ).toThrow();
  });

  it('falls back to a valid avatar', () => {
    const state = ok(lobby(1), {
      actor: 'system',
      now: T0,
      command: { type: 'join', playerId: 'p2', name: 'Bo', avatar: 'dragon' as never },
    });
    expect(state.players[1]?.avatar).toBe('fox');
  });

  it('only lets the host start, with enough ready players and a server seed', () => {
    let state = lobby(3);
    expect(err(state, cmd('p2', { type: 'start' }, T0, 's'))).toBe('NOT_HOST');
    expect(err(state, cmd('p1', { type: 'start' }, T0, 's'))).toBe('NOT_ENOUGH_PLAYERS');
    state = lobby(4);
    expect(err(state, cmd('p1', { type: 'start' }, T0, 's'))).toBe('NOT_READY');
    for (const id of ['p2', 'p3', 'p4'])
      state = ok(state, cmd(id, { type: 'setReady', ready: true }));
    expect(err(state, cmd('p1', { type: 'start' }))).toBe('INVALID_COMMAND');
    expect(legalActions(state, 'p1').some((a) => a.type === 'start')).toBe(true);
    expect(legalActions(state, 'p2').some((a) => a.type === 'start')).toBe(false);
    state = ok(state, cmd('p1', { type: 'start' }, T0, 'seed'));
    expect(state.phase).toBe('ROLE_REVEAL');
    expect(state.totalRounds).toBe(5);
    expect(state.operations).toHaveLength(5);
    expect(
      state.players.every((p) => p.credits === 10 && p.influence === 0 && p.suspicion === 0),
    ).toBe(true);
  });

  it('rejects joining once the match has started', () => {
    const state = started(4);
    expect(
      err(state, {
        actor: 'system',
        now: T0,
        command: { type: 'join', playerId: 'p9', name: 'Late', avatar: 'fox' },
      }),
    ).toBe('NOT_ALLOWED_IN_PHASE');
  });

  it('lets the host change settings, which clears readiness', () => {
    let state = lobby(4);
    state = ok(state, cmd('p2', { type: 'setReady', ready: true }));
    expect(err(state, cmd('p2', { type: 'updateSettings', settings: { length: 'quick' } }))).toBe(
      'NOT_HOST',
    );
    state = ok(
      state,
      cmd('p1', {
        type: 'updateSettings',
        settings: { length: 'quick', pace: 'relaxed', presetChatOnly: true, beginner: true },
      }),
    );
    expect(state.settings).toEqual({
      length: 'quick',
      pace: 'relaxed',
      presetChatOnly: true,
      beginner: true,
    });
    expect(state.players[1]?.ready).toBe(false);
    expect(
      err(state, cmd('p1', { type: 'updateSettings', settings: { length: 'epic' as never } })),
    ).toBe('INVALID_COMMAND');
    expect(
      err(state, cmd('p1', { type: 'updateSettings', settings: { pace: 'warp' as never } })),
    ).toBe('INVALID_COMMAND');
    const quick = started(4, 's', { length: 'quick' });
    expect(quick.totalRounds).toBe(3);
    expect(new Set(quick.operations.map((o) => o.tier)).size).toBe(3);
    expect(
      err(quick, cmd('p1', { type: 'updateSettings', settings: { length: 'standard' } })),
    ).toBe('NOT_ALLOWED_IN_PHASE');
  });

  it('kicks and lets players leave only outside a match, transferring host', () => {
    let state = lobby(5);
    expect(err(state, cmd('p2', { type: 'kick', target: 'p3' }))).toBe('NOT_HOST');
    expect(err(state, cmd('p1', { type: 'kick', target: 'p1' }))).toBe('INVALID_COMMAND');
    expect(err(state, cmd('p1', { type: 'kick', target: 'zz' }))).toBe('UNKNOWN_TARGET');
    state = ok(state, cmd('p1', { type: 'kick', target: 'p3' }));
    expect(state.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p4', 'p5']);
    expect(state.players.map((p) => p.seat)).toEqual([0, 1, 2, 3]);
    state = ok(state, cmd('p1', { type: 'leave' }));
    expect(state.hostId).toBe('p2');
    const inMatch = started(4);
    expect(err(inMatch, cmd('p1', { type: 'kick', target: 'p2' }))).toBe('NOT_ALLOWED_IN_PHASE');
    const left = ok(inMatch, cmd('p3', { type: 'leave' }));
    expect(left.players).toHaveLength(4);
    expect(left.players[2]?.connected).toBe(false);
  });

  it('transfers host when the host disconnects outside a match', () => {
    let state = lobby(4);
    state = ok(state, {
      actor: 'system',
      now: T0,
      command: { type: 'presence', playerId: 'p1', connected: false },
    });
    expect(state.hostId).toBe('p2');
    // Repeated presence is a no-op.
    const same = ok(state, {
      actor: 'system',
      now: T0,
      command: { type: 'presence', playerId: 'p1', connected: false },
    });
    expect(same).toEqual(state);
    const unknown = ok(state, {
      actor: 'system',
      now: T0,
      command: { type: 'presence', playerId: 'nobody', connected: true },
    });
    expect(unknown).toEqual(state);
  });

  it('separates player and system commands', () => {
    const state = lobby(4);
    expect(err(state, cmd('p1', { type: 'tick' } as never))).toBe('INVALID_COMMAND');
    expect(
      err(state, { actor: 'system', now: T0, command: { type: 'setReady', ready: true } }),
    ).toBe('INVALID_COMMAND');
    expect(err(state, cmd('stranger', { type: 'setReady', ready: true }))).toBe('NOT_A_PLAYER');
    expect(err(state, cmd('p1', { type: 'teleport' } as never))).toBe('INVALID_COMMAND');
    expect(err(state, { actor: 'system', now: T0, command: { type: 'warp' } as never })).toBe(
      'INVALID_COMMAND',
    );
  });

  it('never mutates its input', () => {
    const state = lobby(4);
    const before = JSON.stringify(state);
    applyCommand(state, cmd('p2', { type: 'setReady', ready: true }));
    applyCommand(state, cmd('p1', { type: 'kick', target: 'p2' }));
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('phase machine', () => {
  it('walks every phase in order and ends with results when nobody acts', () => {
    let state = started(4);
    const seen = [state.phase];
    while (state.phase !== 'RESULTS') {
      state = expire(state);
      seen.push(state.phase);
    }
    const round = ['INTELLIGENCE', 'NEGOTIATION', 'COMMITMENT', 'RESOLUTION', 'ROUND_SUMMARY'];
    expect(seen).toEqual([
      'ROLE_REVEAL',
      ...Array(5).fill(round).flat(),
      'FINAL_RECKONING',
      'RESULTS',
    ]);
    // Nobody committed: every operation was abandoned and everyone sat out five times.
    expect(state.operations.every((o) => o.result?.status === 'ABANDONED')).toBe(true);
    expect(state.players.every((p) => p.credits === 15)).toBe(true);
    expect(state.results?.scores.every((s) => s.total === 5 && s.rank === 1)).toBe(true);
    expect(state.results?.winners).toHaveLength(4);
    expect(state.log.filter((e) => e.kind === 'auto_pass')).toHaveLength(20);
    expect(nextPhase(state, T0)).toBe('RESULTS');
    expect(tick(state, Number.MAX_SAFE_INTEGER)).toEqual(state);
  });

  it('does not advance before the deadline and advances exactly once after it', () => {
    const state = started(4);
    const deadline = state.phaseEndsAt as number;
    expect(tickTo(state, deadline - 1)).toEqual(state);
    const next = tickTo(state, deadline + 10 * 60_000);
    expect(next.phase).toBe('INTELLIGENCE');
    expect(next.phaseStartedAt).toBe(deadline + 10 * 60_000);
    expect(next.phaseVersion).toBe(state.phaseVersion + 1);
  });

  it('advances early when every connected player is done', () => {
    let state = started(4);
    for (const id of ['p1', 'p2', 'p3'])
      state = ok(state, cmd(id, { type: 'setReady', ready: true }));
    expect(state.phase).toBe('ROLE_REVEAL');
    state = ok(state, {
      actor: 'system',
      now: T0 + 5,
      command: { type: 'presence', playerId: 'p4', connected: false },
    });
    expect(state.phase).toBe('INTELLIGENCE');
    expect(state.log.some((e) => e.kind === 'player_disconnected')).toBe(true);
    // Readiness resets per phase.
    expect(state.players.every((p) => !p.ready)).toBe(true);
  });

  it('does not advance early when nobody is connected', () => {
    let state = started(4);
    for (const p of state.players) {
      state = ok(state, {
        actor: 'system',
        now: T0,
        command: { type: 'presence', playerId: p.id, connected: false },
      });
    }
    expect(state.phase).toBe('ROLE_REVEAL');
    state = ok(state, {
      actor: 'system',
      now: T0,
      command: { type: 'presence', playerId: 'p2', connected: true },
    });
    expect(state.log.some((e) => e.kind === 'player_reconnected')).toBe(true);
  });

  it('commitment phase advances when everyone connected has sealed', () => {
    let state = advanceTo(started(4), 'COMMITMENT');
    expect(err(state, cmd('p1', { type: 'setReady', ready: true }))).toBe('NOT_ALLOWED_IN_PHASE');
    state = allCommit(state, 1);
    expect(state.phase).toBe('RESOLUTION');
  });

  it('scales phase durations by pace and beginner mode', () => {
    const normal = started(4);
    const relaxed = started(4, 's', { pace: 'relaxed' });
    const beginner = started(4, 's', { beginner: true });
    expect(phaseDuration(normal, 'NEGOTIATION')).toBe(75_000);
    expect(phaseDuration(relaxed, 'NEGOTIATION')).toBe(113_000);
    expect(phaseDuration(beginner, 'ROLE_REVEAL')).toBe(35_000);
    const fast = started(4, 's', { pace: 'fast' });
    expect(phaseDuration(fast, 'COMMITMENT')).toBe(19_000);
  });

  it('cuts to the final reckoning after a round once the match cap passes', () => {
    let state = advanceTo(started(4), 'ROUND_SUMMARY');
    state = { ...state, matchCapAt: state.phaseStartedAt };
    state = expire(state);
    expect(state.phase).toBe('FINAL_RECKONING');
    expect(state.log.some((e) => e.kind === 'match_capped')).toBe(true);
    expect(state.results).not.toBeNull();
  });

  it('keeps a full standard match within the duration cap at every pace', () => {
    for (const pace of ['fast', 'normal', 'relaxed'] as const) {
      for (const beginner of [false, true]) {
        let state = started(12, 'cap', { pace, beginner });
        const start = state.matchStartedAt as number;
        while (state.phase !== 'RESULTS') state = expire(state);
        expect(state.log.some((e) => e.kind === 'match_capped')).toBe(false);
        expect(state.phaseStartedAt - start).toBeLessThan(rules.timing.matchCapMs);
      }
    }
  });
});

function withOperation(
  state: GameState,
  patch: Partial<GameState['operations'][number]>,
): GameState {
  const s = structuredClone(state);
  const op = s.operations[s.round - 1];
  if (!op) throw new Error('no operation');
  Object.assign(op, patch);
  return s;
}

describe('commitments and resolution', () => {
  it('validates sealed commitments and escrows credits', () => {
    let state = advanceTo(started(4), 'COMMITMENT');
    expect(err(state, cmd('p1', { type: 'commit', amount: 4 }))).toBe('INVALID_COMMAND');
    expect(err(state, cmd('p1', { type: 'commit', amount: -1 }))).toBe('INVALID_COMMAND');
    expect(err(state, cmd('p1', { type: 'commit', amount: 1.5 }))).toBe('INVALID_COMMAND');
    state = ok(state, cmd('p1', { type: 'commit', amount: 3 }));
    expect(state.players[0]?.credits).toBe(7);
    expect(err(state, cmd('p1', { type: 'commit', amount: 1 }))).toBe('ALREADY_DONE');
    expect(legalActions(state, 'p1').some((a) => a.type === 'commit')).toBe(false);
    const poor = structuredClone(state);
    (poor.players[1] as { credits: number }).credits = 1;
    expect(err(poor, cmd('p2', { type: 'commit', amount: 2 }))).toBe('INSUFFICIENT_CREDITS');
    expect(legalActions(poor, 'p2').find((a) => a.type === 'commit')).toEqual({
      type: 'commit',
      min: 0,
      max: 1,
    });
  });

  it('rejects commitments outside the commitment phase, including late ones', () => {
    const intel = advanceTo(started(4), 'INTELLIGENCE');
    expect(err(intel, cmd('p1', { type: 'commit', amount: 1 }))).toBe('NOT_ALLOWED_IN_PHASE');
    const resolved = expire(advanceTo(started(4), 'COMMITMENT'));
    expect(resolved.phase).toBe('RESOLUTION');
    expect(err(resolved, cmd('p1', { type: 'commit', amount: 1 }))).toBe('NOT_ALLOWED_IN_PHASE');
  });

  it('pays shares of the pool on success and returns commitments', () => {
    let state = advanceTo(started(4), 'COMMITMENT');
    state = withOperation(state, {
      roll: 0,
      trueBase: 0.5,
      scenarioId: 'quiet',
      pool: 12,
      targetCapital: 6,
    });
    state = allCommit(state, (id) => (id === 'p1' ? 3 : id === 'p2' ? 1 : 0));
    const op = state.operations[0];
    expect(op?.result?.status).toBe('SUCCESS');
    expect(op?.result?.targetMet).toBe(false);
    // p1 has 3 of 4 committed credits: 9 of 12 influence, but capped at 2.5 per credit -> 7.
    expect(op?.result?.payouts.p1?.influence).toBe(7);
    expect(op?.result?.payouts.p2?.influence).toBe(2);
    expect(state.players.map((p) => p.credits)).toEqual([10, 10, 11, 11]);
    expect(state.players.map((p) => p.influence)).toEqual([7, 2, 0, 0]);
  });

  it('loses only committed credits on failure, never below zero', () => {
    let state = advanceTo(started(4), 'COMMITMENT');
    state = withOperation(state, { roll: 0.99, trueBase: 0.5 });
    const poor = structuredClone(state);
    (poor.players[0] as { credits: number }).credits = 2;
    const after = allCommit(poor, (id) => (id === 'p1' ? 2 : 3));
    expect(after.operations[0]?.result?.status).toBe('FAILURE');
    expect(after.players.map((p) => p.credits)).toEqual([0, 7, 7, 7]);
    expect(after.players.every((p) => p.influence === 0)).toBe(true);
    expect(after.operations[0]?.result?.payouts.p1?.creditsLost).toBe(2);
  });

  it('caps credits at the maximum', () => {
    let state = advanceTo(started(4), 'COMMITMENT');
    state = withOperation(state, { roll: 0 });
    (state.players[0] as { credits: number }).credits = 30;
    state = allCommit(state, (id) => (id === 'p1' ? 0 : 1));
    expect(state.players[0]?.credits).toBe(30);
  });

  it('adds the coordination bonus when the target is met', () => {
    let state = advanceTo(started(4), 'COMMITMENT');
    state = withOperation(state, { trueBase: 0.5, scenarioId: 'quiet', targetCapital: 6 });
    const op = state.operations[0];
    if (!op) throw new Error('missing op');
    expect(successChance(state, op, 5)).toBe(0.5);
    expect(successChance(state, op, 6)).toBe(0.6);
    const extreme = { ...op, trueBase: 0.99 };
    expect(successChance(state, extreme, 6)).toBe(rules.operations.maxSuccess);
    const doomed = { ...op, trueBase: 0, scenarioId: 'patrols' };
    expect(successChance(state, doomed, 0)).toBe(rules.operations.minSuccess);
  });

  it('resolves each operation exactly once', () => {
    let state = advanceTo(started(4), 'COMMITMENT');
    state = allCommit(state, 2);
    const result = JSON.stringify(state.operations[0]?.result);
    state = expire(state);
    state = expire(state);
    expect(JSON.stringify(state.operations[0]?.result)).toBe(result);
    expect(state.phase).toBe('INTELLIGENCE');
    expect(state.round).toBe(2);
  });
});

describe('splitPool', () => {
  const entries = [
    { id: 'a', amount: 1, order: 2 },
    { id: 'b', amount: 1, order: 0 },
    { id: 'c', amount: 1, order: 1 },
  ];

  it('never pays more than the pool or the per-credit cap', () => {
    expect(splitPool(10, entries, 2.5)).toEqual({ a: 2, b: 2, c: 2 });
    expect(splitPool(5, entries, 2.5)).toEqual({ a: 1, b: 2, c: 2 });
    expect(splitPool(4, [{ id: 'solo', amount: 3, order: 0 }], 2.5)).toEqual({ solo: 4 });
    expect(splitPool(40, [{ id: 'solo', amount: 3, order: 0 }], 2.5)).toEqual({ solo: 7 });
    expect(splitPool(10, [{ id: 'x', amount: 0, order: 0 }], 2.5)).toEqual({});
  });

  it('breaks remainder ties by the supplied order, not by seat', () => {
    expect(splitPool(4, entries, 2.5)).toEqual({ a: 1, b: 2, c: 1 });
    const reordered = entries.map((e) => ({ ...e, order: 2 - e.order }));
    expect(splitPool(4, reordered, 2.5)).toEqual({ a: 2, b: 1, c: 1 });
  });
});

describe('operations', () => {
  it('generates bounded, varied operations whose public window contains the truth', () => {
    for (let i = 0; i < 200; i++) {
      const ops = generateOperations(rules, `gen-${i}`, 4 + (i % 9), 5, {
        length: 'standard',
        pace: 'normal',
        beginner: i % 2 === 0,
        presetChatOnly: false,
      });
      expect(new Set(ops.map((o) => o.tier)).size).toBe(3);
      for (const op of ops) {
        const t = rules.operations.tiers[op.tier];
        expect(op.trueBase).toBeGreaterThanOrEqual(t.baseMin);
        expect(op.trueBase).toBeLessThanOrEqual(t.baseMax);
        expect(op.publicLow).toBeLessThanOrEqual(op.trueBase);
        expect(op.publicHigh).toBeGreaterThanOrEqual(op.trueBase);
        expect(op.roll).toBeGreaterThanOrEqual(0);
        expect(op.roll).toBeLessThan(1);
        expect(op.pool).toBeGreaterThan(0);
        expect(scenarioById(rules, op.scenarioId).id).toBe(op.scenarioId);
      }
      if (i % 2 === 0) expect(ops[0]?.scenarioId).toBe('quiet');
    }
  });

  it('is deterministic per seed and different across seeds', () => {
    const settings = {
      length: 'standard',
      pace: 'normal',
      beginner: false,
      presetChatOnly: false,
    } as const;
    expect(generateOperations(rules, 'a', 6, 5, settings)).toEqual(
      generateOperations(rules, 'a', 6, 5, settings),
    );
    expect(generateOperations(rules, 'a', 6, 5, settings)).not.toEqual(
      generateOperations(rules, 'b', 6, 5, settings),
    );
  });

  it('knows its rule versions', () => {
    expect(listRulesVersions()).toContain('1.0.0');
    expect(() => getRules('0.0.1')).toThrow();
    expect(() => scenarioById(rules, 'nope')).toThrow();
  });
});

describe('intel', () => {
  it('gives everyone an imperfect rumor within its documented margin', () => {
    for (let i = 0; i < 50; i++) {
      const state = advanceTo(started(6, `intel-${i}`), 'INTELLIGENCE');
      const op = state.operations[0];
      for (const p of state.players) {
        const report = p.intel.find((r) => r.targetRound === 1);
        expect(report?.source).toBe('rumor');
        expect(Math.abs((report?.estimate ?? 0) - (op?.trueBase ?? 0))).toBeLessThanOrEqual(
          (report?.margin ?? 0) + 1e-9,
        );
      }
    }
  });

  it('sells one contact report per round', () => {
    let state = advanceTo(started(4), 'INTELLIGENCE');
    const cost = state.operations[0]?.scenarioId === 'loose-lips' ? 0 : 1;
    state = ok(state, cmd('p1', { type: 'buyIntel' }));
    expect(state.players[0]?.credits).toBe(10 - cost);
    expect(state.players[0]?.intel.filter((r) => r.source === 'contact')).toHaveLength(1);
    expect(err(state, cmd('p1', { type: 'buyIntel' }))).toBe('LIMIT_REACHED');
    const broke = structuredClone(state);
    (broke.players[1] as { credits: number }).credits = 0;
    (broke.operations[0] as { scenarioId: string }).scenarioId = 'quiet';
    expect(err(broke, cmd('p2', { type: 'buyIntel' }))).toBe('INSUFFICIENT_CREDITS');
    const commit = advanceTo(state, 'COMMITMENT');
    expect(err(commit, cmd('p2', { type: 'buyIntel' }))).toBe('NOT_ALLOWED_IN_PHASE');
  });
});

describe('deals', () => {
  it('validates proposals', () => {
    const state = advanceTo(started(4), 'NEGOTIATION');
    const deal = (invitees: string[], terms: unknown[], note = '') =>
      cmd('p1', { type: 'proposeDeal', invitees, terms: terms as never, note });
    expect(err(state, deal([], [{ kind: 'commit', amount: 2 }]))).toBe('INVALID_COMMAND');
    expect(err(state, deal(['p1'], [{ kind: 'commit', amount: 2 }]))).toBe('INVALID_COMMAND');
    expect(err(state, deal(['ghost'], [{ kind: 'commit', amount: 2 }]))).toBe('UNKNOWN_TARGET');
    expect(err(state, deal(['p2'], []))).toBe('INVALID_COMMAND');
    expect(err(state, deal(['p2'], [{ kind: 'commit', amount: 4 }]))).toBe('INVALID_COMMAND');
    expect(err(state, deal(['p2'], [{ kind: 'shareIntel' }, { kind: 'shareIntel' }]))).toBe(
      'INVALID_COMMAND',
    );
    expect(err(state, deal(['p2'], [{ kind: 'bribe' }]))).toBe('INVALID_COMMAND');
    expect(
      err(
        state,
        deal(
          ['p2'],
          [
            { kind: 'noAccuse' },
            { kind: 'backNext' },
            { kind: 'shareIntel' },
            { kind: 'commit', amount: 1 },
          ],
        ),
      ),
    ).toBe('INVALID_COMMAND');
    let s = state;
    for (let i = 0; i < 3; i++) s = ok(s, deal(['p2'], [{ kind: 'noAccuse' }], 'you are a shit'));
    expect(s.deals[0]?.note).toBe('you are a ****');
    expect(err(s, deal(['p2'], [{ kind: 'noAccuse' }]))).toBe('LIMIT_REACHED');
    const commit = advanceTo(state, 'COMMITMENT');
    expect(err(commit, deal(['p2'], [{ kind: 'noAccuse' }]))).toBe('NOT_ALLOWED_IN_PHASE');
    const presetOnly = advanceTo(started(4, 's', { presetChatOnly: true }), 'NEGOTIATION');
    expect(err(presetOnly, deal(['p2'], [{ kind: 'noAccuse' }], 'hi'))).toBe('CHAT_RESTRICTED');
  });

  it('records answers and judges broken commit promises after resolution', () => {
    let state = advanceTo(started(4), 'NEGOTIATION');
    state = ok(
      state,
      cmd('p1', {
        type: 'proposeDeal',
        invitees: ['p2', 'p3'],
        terms: [{ kind: 'commit', amount: 2 }],
        note: '',
      }),
    );
    const id = state.deals[0]?.id as string;
    expect(err(state, cmd('p4', { type: 'respondDeal', dealId: id, accept: true }))).toBe(
      'UNKNOWN_TARGET',
    );
    state = ok(state, cmd('p2', { type: 'respondDeal', dealId: id, accept: true }));
    expect(err(state, cmd('p2', { type: 'respondDeal', dealId: id, accept: false }))).toBe(
      'ALREADY_DONE',
    );
    state = ok(state, cmd('p3', { type: 'respondDeal', dealId: id, accept: false }));
    expect(state.deals[0]?.responses).toEqual({ p1: 'accepted', p2: 'accepted', p3: 'declined' });
    state = advanceTo(state, 'COMMITMENT');
    state = allCommit(state, (pid) => (pid === 'p2' ? 0 : 2));
    expect(state.deals[0]?.kept).toEqual({ p1: true, p2: false });
    const broken = state.log.filter((e) => e.kind === 'deal_broken');
    expect(broken).toHaveLength(1);
    expect(broken[0]?.to).toEqual(['p1', 'p2']);
  });

  it('does not judge deals that nobody accepted or without commit terms', () => {
    let state = advanceTo(started(4), 'NEGOTIATION');
    state = ok(
      state,
      cmd('p1', {
        type: 'proposeDeal',
        invitees: ['p2'],
        terms: [{ kind: 'commit', amount: 2 }],
        note: '',
      }),
    );
    state = ok(
      state,
      cmd('p1', {
        type: 'proposeDeal',
        invitees: ['p3'],
        terms: [{ kind: 'shareIntel' }],
        note: '',
      }),
    );
    state = ok(
      state,
      cmd('p3', { type: 'respondDeal', dealId: state.deals[1]?.id as string, accept: true }),
    );
    state = allCommit(advanceTo(state, 'COMMITMENT'), 0);
    expect(state.deals.every((d) => d.kept === null)).toBe(true);
    expect(
      err(
        state,
        cmd('p2', { type: 'respondDeal', dealId: state.deals[0]?.id as string, accept: true }),
      ),
    ).toBe('NOT_ALLOWED_IN_PHASE');
  });

  it('drops deals of players who leave the lobby', () => {
    let state = advanceTo(started(4), 'NEGOTIATION');
    state = ok(
      state,
      cmd('p1', { type: 'proposeDeal', invitees: ['p2'], terms: [{ kind: 'noAccuse' }], note: '' }),
    );
    while (state.phase !== 'RESULTS') state = expire(state);
    state = ok(state, cmd('p2', { type: 'leave' }));
    expect(state.deals).toHaveLength(0);
  });
});

describe('chat and moderation', () => {
  it('accepts presets, reactions and filtered text', () => {
    let state = lobby(4);
    state = ok(state, cmd('p1', { type: 'chat', kind: 'preset', text: 'deal' }));
    state = ok(state, cmd('p1', { type: 'chat', kind: 'reaction', text: '🤝' }));
    state = ok(state, cmd('p1', { type: 'chat', kind: 'text', text: 'what the fuck <script>' }));
    expect(state.chat.map((m) => m.text)).toEqual([
      'Want to make a deal?',
      '🤝',
      'what the **** <script>',
    ]);
    expect(err(state, cmd('p1', { type: 'chat', kind: 'preset', text: 'nope' }))).toBe(
      'INVALID_COMMAND',
    );
    expect(err(state, cmd('p1', { type: 'chat', kind: 'reaction', text: '💩' }))).toBe(
      'INVALID_COMMAND',
    );
    expect(err(state, cmd('p1', { type: 'chat', kind: 'text', text: '   ' }))).toBe(
      'INVALID_COMMAND',
    );
    expect(err(state, cmd('p1', { type: 'chat', kind: 'shout' as never, text: 'x' }))).toBe(
      'INVALID_COMMAND',
    );
    const long = ok(state, cmd('p2', { type: 'chat', kind: 'text', text: 'x'.repeat(500) }));
    expect(long.chat.at(-1)?.text).toHaveLength(rules.chat.maxLength);
  });

  it('rate limits, mutes and enforces preset-only rooms', () => {
    let state = lobby(4);
    for (let i = 0; i < rules.chat.maxPerMinute; i++)
      state = ok(state, cmd('p2', { type: 'chat', kind: 'reaction', text: '👍' }, T0 + i));
    expect(err(state, cmd('p2', { type: 'chat', kind: 'reaction', text: '👍' }, T0 + 100))).toBe(
      'LIMIT_REACHED',
    );
    state = ok(state, cmd('p2', { type: 'chat', kind: 'reaction', text: '👍' }, T0 + 61_000));
    expect(err(state, cmd('p2', { type: 'mute', target: 'p3', muted: true }))).toBe('NOT_HOST');
    expect(err(state, cmd('p1', { type: 'mute', target: 'p1', muted: true }))).toBe(
      'INVALID_COMMAND',
    );
    expect(err(state, cmd('p1', { type: 'mute', target: 'p9', muted: true }))).toBe(
      'UNKNOWN_TARGET',
    );
    state = ok(state, cmd('p1', { type: 'mute', target: 'p3', muted: true }));
    expect(err(state, cmd('p3', { type: 'chat', kind: 'preset', text: 'deal' }))).toBe('MUTED');
    expect(legalActions(state, 'p3').some((a) => a.type === 'chat')).toBe(false);
    state = ok(state, cmd('p1', { type: 'updateSettings', settings: { presetChatOnly: true } }));
    expect(err(state, cmd('p4', { type: 'chat', kind: 'text', text: 'hello' }))).toBe(
      'CHAT_RESTRICTED',
    );
    for (let i = 0; i < rules.chat.historyLimit + 5; i++) {
      state = ok(
        state,
        cmd(
          `p${(i % 2) + 1}`,
          { type: 'chat', kind: 'reaction', text: '👍' },
          T0 + 1_000_000 + i * 10_000,
        ),
      );
    }
    expect(state.chat).toHaveLength(rules.chat.historyLimit);
  });
});

describe('scoring and rematch', () => {
  it('ranks by score, then influence, lower suspicion and credits; equal players share the rank', () => {
    const state = started(4);
    const s = structuredClone(state);
    const set = (i: number, influence: number, credits: number, suspicion = 0) => {
      Object.assign(s.players[i] as object, { influence, credits, suspicion });
    };
    set(0, 10, 3); // 11
    set(1, 9, 6); // 11, less influence
    set(2, 10, 3, 1); // 11, more suspicion
    set(3, 10, 5); // 11, more credits -> first
    const ranked = determineWinners(s);
    expect(ranked.map((r) => r.playerId)).toEqual(['p4', 'p1', 'p3', 'p2']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    set(3, 10, 3);
    const tied = determineWinners(s);
    expect(
      tied
        .filter((r) => r.winner)
        .map((r) => r.playerId)
        .sort(),
    ).toEqual(['p1', 'p4']);
    expect(tied.find((r) => r.playerId === 'p3')?.rank).toBe(3);
  });

  it('rematches into a fresh lobby and plays again', () => {
    let state = started(4);
    state = advanceTo(state, 'COMMITMENT');
    state = allCommit(state, 3);
    while (state.phase !== 'RESULTS') state = expire(state);
    expect(state.results?.seed).toBe('test-seed');
    expect(err(state, cmd('p2', { type: 'rematch' }))).toBe('NOT_HOST');
    expect(err(advanceTo(started(4), 'NEGOTIATION'), cmd('p1', { type: 'rematch' }))).toBe(
      'NOT_ALLOWED_IN_PHASE',
    );
    state = ok(state, {
      actor: 'system',
      now: T0,
      command: { type: 'join', playerId: 'p5', name: 'Newcomer', avatar: 'cat' },
    });
    state = ok(state, cmd('p1', { type: 'rematch' }));
    expect(state.phase).toBe('LOBBY');
    expect(state.matchIndex).toBe(1);
    expect(state.operations).toHaveLength(0);
    expect(state.results).toBeNull();
    expect(state.players.every((p) => p.credits === 10 && p.influence === 0 && !p.ready)).toBe(
      true,
    );
    for (let i = 2; i <= 5; i++) state = ok(state, cmd(`p${i}`, { type: 'setReady', ready: true }));
    state = ok(state, cmd('p1', { type: 'start' }, T0, 'second-seed'));
    expect(state.phase).toBe('ROLE_REVEAL');
    expect(state.seed).toBe('second-seed');
    expect(state.operations).toHaveLength(5);
  });

  it('offers rematch and settings to the host in results', () => {
    let state = started(4);
    while (state.phase !== 'RESULTS') state = expire(state);
    const types = legalActions(state, 'p1').map((a) => a.type);
    expect(types).toContain('rematch');
    expect(types).toContain('updateSettings');
    expect(legalActions(state, 'nobody')).toEqual([]);
  });
});
