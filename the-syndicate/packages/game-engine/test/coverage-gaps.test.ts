import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  checkInvariants,
  cleanName,
  containsProfanity,
  finalizeResults,
  legalActions,
  rngFor,
  type GameState,
  type PlayerCommand,
} from '../src';
import { advanceTo, allCommit, cmd, expire, ok, started } from './helpers';

describe('checkInvariants', () => {
  const base = () => advanceTo(started(4), 'COMMITMENT');

  it('accepts a legal step', () => {
    const prev = base();
    const next = ok(prev, cmd('p1', { type: 'commit', amount: 2 }));
    expect(checkInvariants(prev, next)).toEqual([]);
  });

  it('detects every class of violation', () => {
    const prev = base();
    const bad = structuredClone(prev);
    Object.assign(bad.players[0] as object, { credits: 31 });
    Object.assign(bad.players[1] as object, { credits: -1 });
    Object.assign(bad.players[2] as object, { influence: -2 });
    bad.phase = 'RESULTS';
    bad.commitments[1] = { p1: 4 };
    expect(checkInvariants(prev, bad)).toEqual([
      'credits out of range for p1: 31',
      'credits out of range for p2: -1',
      'bad influence p3: -2',
      'influence decreased for p3',
      'illegal transition COMMITMENT -> RESULTS',
      'bad commitment round 1 p1: 4',
    ]);
  });

  it('detects double resolution and overpayment', () => {
    const resolved = allCommit(base(), 1);
    const op = resolved.operations[0];
    if (!op?.result) throw new Error('unresolved');
    const changed = structuredClone(resolved);
    const cop = changed.operations[0];
    if (!cop?.result) throw new Error('unresolved');
    cop.result.totalCommitted += 1;
    expect(checkInvariants(resolved, changed)).toContain('operation 1 resolved twice');
    const overpaid = structuredClone(resolved);
    const oop = overpaid.operations[0];
    if (!oop?.result) throw new Error('unresolved');
    oop.result.status = 'FAILURE';
    for (const payout of Object.values(oop.result.payouts)) payout.influence = 0;
    (oop.result.payouts.p1 as { influence: number }).influence = oop.pool + 1;
    const found = checkInvariants(
      structuredClone({ ...resolved, operations: [] }) as GameState,
      overpaid,
    );
    expect(found).toContain(`operation 1 paid ${oop.pool + 1} > pool ${oop.pool}`);
    expect(found).toContain('operation 1 paid on failure');
  });
});

describe('legalActions agrees with applyCommand', () => {
  const probes: PlayerCommand[] = [
    { type: 'setReady', ready: true },
    { type: 'buyIntel' },
    { type: 'commit', amount: 0 },
    { type: 'proposeDeal', invitees: ['p2'], terms: [{ kind: 'noAccuse' }], note: '' },
    { type: 'chat', kind: 'reaction', text: '👍' },
    { type: 'rematch' },
    { type: 'start' },
    { type: 'updateSettings', settings: {} },
  ];

  it('lists an action exactly when a representative command is accepted', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 40 }),
        fc.constantFrom('p1', 'p2', 'p3'),
        (steps, actor) => {
          let state = started(4, `legal-${steps}`);
          for (let i = 0; i < steps && state.phase !== 'RESULTS'; i++) state = expire(state);
          const types = new Set(legalActions(state, actor).map((a) => a.type));
          for (const probe of probes) {
            if (probe.type === 'proposeDeal' && actor === 'p2') continue;
            const accepted = applyCommand(
              state,
              cmd(actor, probe, state.phaseStartedAt + 1, 'seed'),
            ).ok;
            expect([probe.type, accepted]).toEqual([probe.type, types.has(probe.type)]);
          }
        },
      ),
      { numRuns: 80 },
    );
  });

  it('lists pending deals to answer', () => {
    let state = advanceTo(started(4), 'NEGOTIATION');
    state = ok(
      state,
      cmd('p1', { type: 'proposeDeal', invitees: ['p2'], terms: [{ kind: 'noAccuse' }], note: '' }),
    );
    expect(legalActions(state, 'p2').find((a) => a.type === 'respondDeal')).toEqual({
      type: 'respondDeal',
      dealIds: [state.deals[0]?.id],
    });
    expect(legalActions(state, 'p3').some((a) => a.type === 'respondDeal')).toBe(false);
    const commit = advanceTo(state, 'COMMITMENT');
    expect(legalActions(commit, 'p2').some((a) => a.type === 'respondDeal')).toBe(true);
  });
});

describe('results highlights', () => {
  it('names broken promises, loyal partners, bold bets and caution', () => {
    let state = advanceTo(started(4), 'NEGOTIATION');
    state = ok(
      state,
      cmd('p1', {
        type: 'proposeDeal',
        invitees: ['p2', 'p3'],
        terms: [{ kind: 'commit', amount: 3 }],
        note: '',
      }),
    );
    const id = state.deals[0]?.id as string;
    state = ok(state, cmd('p2', { type: 'respondDeal', dealId: id, accept: true }));
    state = ok(state, cmd('p3', { type: 'respondDeal', dealId: id, accept: true }));
    state = advanceTo(state, 'COMMITMENT');
    const high = structuredClone(state);
    (high.operations[0] as { tier: string; roll: number }).tier = 'HIGH';
    (high.operations[0] as { roll: number }).roll = 0;
    state = allCommit(high, (pid) => (pid === 'p3' ? 0 : 3));
    const results = finalizeResults(state);
    const kinds = Object.fromEntries(results.highlights.map((h) => [h.kind, h.playerId]));
    expect(kinds.broken_promise).toBe('p3');
    expect(kinds.loyal_partner).toBeDefined();
    expect(kinds.boldest_bet).toBeDefined();
    expect(kinds.best_investor).toBeDefined();
    expect(kinds.cautious).toBeDefined();
    expect(kinds.biggest_score).toBe(results.winners[0]);
  });
});

describe('rng and moderation details', () => {
  it('draws within bounds and refuses empty picks', () => {
    const rng = rngFor('x');
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(2, 4);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(4);
      const r = rng.range(0.5, 0.6);
      expect(r).toBeGreaterThanOrEqual(0.5);
      expect(r).toBeLessThan(0.6);
    }
    expect(() => rng.pick([])).toThrow();
    expect(rng.shuffle([1, 2, 3]).sort()).toEqual([1, 2, 3]);
    expect(rngFor('a', 1).next()).toBe(rngFor('a', 1).next());
    expect(rngFor('a', 1).next()).not.toBe(rngFor('a', 2).next());
  });

  it('filters evasions without flagging ordinary words', () => {
    for (const bad of ['FUCK', 'fuuuck', 'f*u*c*k', 'sh1t', 'b1tches', 'asshole', 'dicks']) {
      expect([bad, containsProfanity(bad.replace(/\*/g, ''))]).toEqual([bad, true]);
    }
    for (const fine of [
      'spicy',
      'peacock',
      'Dickens',
      'night',
      'scrap',
      'assess',
      'class',
      'Sussex',
    ]) {
      expect([fine, containsProfanity(fine)]).toEqual([fine, false]);
    }
    expect(cleanName('<b>Raven</b>')).toBe('<b>Raven</b>');
    expect(cleanName('a'.repeat(40))).toHaveLength(16);
    expect(cleanName('​​')).toBeNull();
  });
});
