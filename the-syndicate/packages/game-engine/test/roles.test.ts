import { describe, expect, it } from 'vitest';
import {
  determineWinners,
  getRules,
  legalActions,
  redactViewForPlayer,
  type GameState,
  type ObjectiveId,
} from '../src';
import { archetypeOf, objectiveMet } from '../src/roles';
import { advanceTo, allCommit, cmd, err, expire, ok, started } from './helpers';

const rules = getRules('2.0.0');
const V2 = '2.0.0';

/** A started 2.0.0 match with chosen roles (and full charges) for the first players. */
function withRoles(n: number, roles: Record<string, string>, seed = 'roles-seed'): GameState {
  const state = structuredClone(started(n, seed, {}, V2));
  for (const p of state.players) {
    const role = roles[p.id];
    if (!role) continue;
    p.role = role;
    p.charges = rules.roles?.definitions[role]?.charges ?? 0;
  }
  return state;
}

function setOp(state: GameState, patch: Partial<GameState['operations'][number]>): GameState {
  const s = structuredClone(state);
  Object.assign(s.operations[s.round - 1] as object, patch);
  return s;
}

/** Expires phases until the next round's negotiation. */
function nextNegotiation(state: GameState): GameState {
  const round = state.round;
  let s = state;
  while (!(s.phase === 'NEGOTIATION' && s.round > round)) s = expire(s);
  return s;
}

const ability = (actor: string, extra: Record<string, unknown> = {}) =>
  cmd(actor, { type: 'useAbility', ...extra } as never);

describe('role distribution', () => {
  it('deals a legal composition for every supported player count', () => {
    for (let n = 4; n <= 12; n++) {
      for (let i = 0; i < 25; i++) {
        const state = started(n, `dist-${n}-${i}`, {}, V2);
        const ids = state.players.map((p) => p.role as string);
        const table = rules.roles?.distribution[String(n)];
        expect(ids).toHaveLength(n);
        for (const fixed of table?.fixed ?? []) expect(ids).toContain(fixed);
        const archetypes = state.players.map((p) => archetypeOf(rules, p));
        const count = (a: string) => archetypes.filter((x) => x === a).length;
        expect(count('saboteur')).toBeGreaterThanOrEqual(1);
        expect(count('saboteur')).toBeLessThanOrEqual(2);
        expect(count('auditor')).toBeGreaterThanOrEqual(1);
        for (const a of ['broker', 'insider', 'fixer', 'opportunist', 'auditor'])
          expect(count(a)).toBeLessThanOrEqual(2);
        expect(new Set(ids).size).toBe(n);
        expect(state.players.every((p) => p.objective !== null && p.charges > 0)).toBe(true);
      }
    }
  });

  it('is deterministic per seed and varies across seeds', () => {
    const roles = (seed: string) => started(8, seed, {}, V2).players.map((p) => p.role);
    expect(roles('a')).toEqual(roles('a'));
    const variety = new Set(Array.from({ length: 20 }, (_, i) => roles(`s${i}`).join()));
    expect(variety.size).toBeGreaterThan(10);
  });

  it('gives no roles under rules 1.0.0', () => {
    const state = started(6);
    expect(state.players.every((p) => p.role === null && p.charges === 0)).toBe(true);
    expect(err(advanceTo(state, 'NEGOTIATION'), cmd('p1', { type: 'accuse', target: 'p2' }))).toBe(
      'NOT_ALLOWED_IN_PHASE',
    );
    expect(err(advanceTo(state, 'NEGOTIATION'), ability('p1', { choice: 'current' }))).toBe(
      'NOT_ALLOWED_IN_PHASE',
    );
  });
});

describe('role secrecy', () => {
  it('shows each player only their own role and objective until the final reckoning', () => {
    let state = started(6, 'secret-roles', {}, V2);
    for (const p of state.players) {
      const view = redactViewForPlayer(state, p.id);
      expect(view.self.role?.id).toBe(p.role);
      expect(view.self.objective?.id).toBe(p.objective);
      const others = state.players.filter((o) => o.id !== p.id);
      const json = JSON.stringify(view);
      for (const o of others) {
        if (o.role !== p.role) expect(json).not.toContain(`"${o.role}"`);
      }
      expect(view.results).toBeNull();
    }
    while (state.phase !== 'FINAL_RECKONING') state = expire(state);
    const final = redactViewForPlayer(state, 'p1');
    expect(final.results?.reveals.map((r) => r.role).sort()).toEqual(
      state.players.map((p) => p.role).sort(),
    );
  });

  it('keeps ability uses and their bonuses secret until the reckoning', () => {
    let state = withRoles(4, { p1: 'opportunist', p2: 'fixer', p3: 'broker', p4: 'auditor' });
    state = advanceTo(state, 'COMMITMENT');
    state = ok(state, ability('p1', { choice: 'SUCCESS' }));
    state = ok(state, ability('p2', { target: 'p3' }));
    state = allCommit(state, 2);
    for (const id of ['p3', 'p4']) {
      const json = JSON.stringify(redactViewForPlayer(state, id));
      expect(json).not.toContain('forecast');
      expect(json).not.toContain('"bonuses"');
    }
    // The insured player learns who insured them; nobody else does.
    expect(redactViewForPlayer(state, 'p3').log.some((e) => e.kind === 'insured')).toBe(true);
    expect(redactViewForPlayer(state, 'p4').log.some((e) => e.kind === 'insured')).toBe(false);
  });
});

describe('ability timing and limits', () => {
  it('allows one use per round, within charges, in the right phase, before sealing', () => {
    let state = withRoles(4, { p1: 'opportunist', p2: 'insider' });
    state = advanceTo(state, 'INTELLIGENCE');
    expect(err(state, ability('p1', { choice: 'SUCCESS' }))).toBe('NOT_ALLOWED_IN_PHASE');
    state = ok(state, ability('p2', { choice: 'current' }));
    expect(err(state, ability('p2', { choice: 'next' }))).toBe('LIMIT_REACHED');
    expect(legalActions(state, 'p2').some((a) => a.type === 'useAbility')).toBe(false);
    state = advanceTo(state, 'COMMITMENT');
    expect(legalActions(state, 'p1').find((a) => a.type === 'useAbility')).toEqual({
      type: 'useAbility',
      ability: 'forecast',
      charges: 2,
    });
    state = ok(state, cmd('p1', { type: 'commit', amount: 1 }));
    expect(err(state, ability('p1', { choice: 'SUCCESS' }))).toBe('ALREADY_DONE');
  });

  it('runs out of charges', () => {
    let state = withRoles(4, { p1: 'saboteur' });
    state = advanceTo(state, 'COMMITMENT');
    state = ok(state, ability('p1'));
    state = allCommit(state, 1);
    state = advanceTo(state, 'COMMITMENT');
    expect(err(state, ability('p1'))).toBe('LIMIT_REACHED');
  });

  it('refuses abilities from players without one and outside rounds', () => {
    const state = withRoles(4, { p1: 'broker' });
    const s = structuredClone(state);
    (s.players[3] as { role: string | null }).role = null;
    expect(err(advanceTo(s, 'COMMITMENT'), ability('p4'))).toBe('NOT_ALLOWED_IN_PHASE');
    expect(err(state, ability('p1'))).toBe('NOT_ALLOWED_IN_PHASE');
  });
});

describe('insider and informant', () => {
  it('peeks at the current or next operation within the documented margin', () => {
    for (let i = 0; i < 30; i++) {
      let state = withRoles(4, { p1: 'insider' }, `peek-${i}`);
      state = advanceTo(state, 'INTELLIGENCE');
      state = ok(state, ability('p1', { choice: i % 2 ? 'next' : 'current' }));
      const report = state.players[0]?.intel.find((r) => r.source === 'insider');
      const target = state.operations[(report?.targetRound ?? 1) - 1];
      expect(report?.targetRound).toBe(i % 2 ? 2 : 1);
      expect(Math.abs((report?.estimate ?? 0) - (target?.trueBase ?? 0))).toBeLessThanOrEqual(
        (report?.margin ?? 0) + 1e-9,
      );
      expect(redactViewForPlayer(state, 'p1').log.some((e) => e.kind === 'ability_result')).toBe(
        true,
      );
    }
  });

  it('enforces variant restrictions and the final round', () => {
    let state = withRoles(4, { p1: 'informant', p2: 'insider' });
    state = advanceTo(state, 'INTELLIGENCE');
    expect(err(state, ability('p1', { choice: 'next' }))).toBe('INVALID_COMMAND');
    expect(err(state, ability('p1', { choice: 'sideways' }))).toBe('INVALID_COMMAND');
    while (!(state.round === 5 && state.phase === 'INTELLIGENCE')) state = expire(state);
    expect(err(state, ability('p2', { choice: 'next' }))).toBe('INVALID_COMMAND');
    expect(ok(state, ability('p2', { choice: 'current' })).players[1]?.charges).toBe(1);
  });
});

describe('auditor and inspector', () => {
  it('returns a narrow truthful answer about a resolved round', () => {
    let state = withRoles(5, { p1: 'auditor', p2: 'saboteur', p3: 'inspector', p4: 'opportunist' });
    state = advanceTo(state, 'INTELLIGENCE');
    expect(err(state, ability('p1', { target: 'p2', targetRound: 1 }))).toBe('INVALID_COMMAND');
    state = advanceTo(state, 'COMMITMENT');
    state = ok(state, ability('p2'));
    state = ok(state, ability('p4', { choice: 'FAILURE' }));
    state = allCommit(state, 1);
    state = advanceTo(state, 'INTELLIGENCE');
    expect(err(state, ability('p1', { target: 'p1', targetRound: 1 }))).toBe('UNKNOWN_TARGET');
    const audited = ok(state, ability('p1', { target: 'p2', targetRound: 1 }));
    expect(audited.abilityUses.at(-1)?.effect).toBe('yes');
    const clean = ok(state, ability('p1', { target: 'p4', targetRound: 1 }));
    // The auditor's signal is about sabotage only: a forecast is not sabotage.
    expect(clean.abilityUses.at(-1)?.effect).toBe('no');
    const inspected = ok(state, ability('p3', { target: 'p4', targetRound: 1 }));
    // The inspector's signal is any secret ability.
    expect(inspected.abilityUses.at(-1)?.effect).toBe('yes');
  });
});

describe('fixer and underwriter', () => {
  it('refunds an insured loss (never more than was lost) and earns a premium on success', () => {
    let state = withRoles(4, { p1: 'fixer', p2: 'underwriter' });
    state = advanceTo(state, 'COMMITMENT');
    expect(err(state, ability('p2', { target: 'p2' }))).toBe('INVALID_COMMAND');
    expect(err(state, ability('p1', { target: 'nobody' }))).toBe('UNKNOWN_TARGET');
    state = ok(state, ability('p1', { target: 'p3' }));
    state = ok(state, ability('p2', { target: 'p4' }));
    const fail = allCommit(setOp(state, { roll: 0.99 }), 3);
    expect(fail.operations[0]?.result?.status).toBe('FAILURE');
    expect(fail.players.map((p) => p.credits)).toEqual([7, 7, 10, 9]);
    const win = allCommit(setOp(state, { roll: 0 }), 3);
    const shares = win.operations[0]?.result?.payouts;
    expect(win.players[0]?.influence).toBe((shares?.p1?.influence ?? 0) + 2);
    expect(win.players[1]?.influence).toBe((shares?.p2?.influence ?? 0) + 1);
  });

  it('pays no premium for insuring yourself', () => {
    let state = withRoles(4, { p1: 'fixer' });
    state = advanceTo(state, 'COMMITMENT');
    state = ok(state, ability('p1', { target: 'p1' }));
    const win = allCommit(setOp(state, { roll: 0 }), 2);
    expect(win.players[0]?.influence).toBe(win.operations[0]?.result?.payouts.p1?.influence);
  });
});

describe('saboteur and mole', () => {
  it('lowers the success chance within the cap and is paid when the operation fails', () => {
    let state = withRoles(10, { p1: 'saboteur', p2: 'mole' });
    state = advanceTo(state, 'COMMITMENT');
    state = setOp(state, { trueBase: 0.6, scenarioId: 'quiet', roll: 0.5, targetCapital: 99 });
    state = ok(state, ability('p1'));
    state = ok(state, ability('p2'));
    state = allCommit(state, (id) => (id === 'p1' || id === 'p2' ? 0 : 1));
    const result = state.operations[0]?.result;
    // 0.20 + 0.12 = 0.32, capped at 0.30.
    expect(result?.finalChance).toBeCloseTo(0.3, 5);
    expect(result?.status).toBe('FAILURE');
    expect(state.players[0]?.influence).toBe(3);
    expect(state.players[1]?.influence).toBe(2);
  });

  it('is not paid without at least two other backers, or when the operation succeeds', () => {
    let state = withRoles(4, { p1: 'saboteur' });
    state = advanceTo(state, 'COMMITMENT');
    state = ok(state, ability('p1'));
    const lonely = allCommit(setOp(state, { roll: 0.99 }), (id) => (id === 'p2' ? 2 : 0));
    expect(lonely.players[0]?.influence).toBe(0);
    const survived = allCommit(setOp(state, { roll: 0 }), (id) => (id === 'p1' ? 0 : 1));
    expect(survived.players[0]?.influence).toBe(0);
  });

  it('gets exposed with rising probability, raising suspicion publicly', () => {
    let exposedEver = 0;
    const firstCheck: boolean[] = [];
    for (let i = 0; i < 60; i++) {
      let state = withRoles(4, { p1: 'saboteur' }, `expose-${i}`);
      state = advanceTo(state, 'COMMITMENT');
      state = ok(state, ability('p1'));
      state = allCommit(state, 0);
      state = expire(state);
      firstCheck.push(state.abilityUses[0]?.exposed === true);
      while (state.phase !== 'FINAL_RECKONING')
        state = state.phase === 'COMMITMENT' ? allCommit(state, 0) : expire(state);
      const use = state.abilityUses[0];
      expect(use?.checks).toBeLessThanOrEqual(5);
      if (!use?.exposed) expect(use?.checks).toBe(5);
      if (use?.exposed) {
        exposedEver++;
        expect(state.log.some((e) => e.kind === 'exposed' && e.to === undefined)).toBe(true);
        expect(state.players[0]?.suspicion).toBeGreaterThanOrEqual(2);
      }
    }
    const firstRate = firstCheck.filter(Boolean).length / 60;
    // First check 20%, then 35/50/65/80%: rare at once, likely by the end, never certain.
    expect(firstRate).toBeGreaterThan(0.05);
    expect(firstRate).toBeLessThan(0.4);
    expect(exposedEver).toBeGreaterThan(40);
    expect(exposedEver).toBeLessThan(60);
  });
});

describe('broker and kingmaker', () => {
  it('pays the broker only for a joint success with enough other backers', () => {
    let state = withRoles(5, { p1: 'broker', p2: 'kingmaker' });
    state = advanceTo(state, 'COMMITMENT');
    state = ok(state, ability('p1'));
    const win = allCommit(setOp(state, { roll: 0 }), 1);
    expect(win.players[0]?.influence).toBe(
      (win.operations[0]?.result?.payouts.p1?.influence ?? 0) + 3,
    );
    const tooFew = allCommit(setOp(state, { roll: 0 }), (id) =>
      id === 'p1' || id === 'p2' ? 1 : 0,
    );
    expect(tooFew.players[0]?.influence).toBe(tooFew.operations[0]?.result?.payouts.p1?.influence);
    expect(tooFew.abilityUses[0]?.effect).toBe('not met');
    const king = allCommit(ok(setOp(state, { roll: 0 }), ability('p2')), 1);
    const share = (id: string) => king.operations[0]?.result?.payouts[id]?.influence ?? 0;
    expect(king.players[1]?.influence).toBe(share('p2') + 3);
    expect(king.players[2]?.influence).toBe(share('p3') + 1);
  });
});

describe('opportunist', () => {
  it('earns the reward for a correct forecast and keeps the charge if nobody backs the operation', () => {
    let state = withRoles(4, { p1: 'opportunist' });
    state = advanceTo(state, 'COMMITMENT');
    expect(err(state, ability('p1', { choice: 'MAYBE' }))).toBe('INVALID_COMMAND');
    state = ok(state, ability('p1', { choice: 'FAILURE' }));
    const right = allCommit(setOp(state, { roll: 0.99 }), 1);
    expect(right.players[0]?.influence).toBe(2);
    const wrong = allCommit(setOp(state, { roll: 0 }), 1);
    expect(wrong.players[0]?.influence).toBe(wrong.operations[0]?.result?.payouts.p1?.influence);
    const voided = allCommit(state, 0);
    expect(voided.players[0]?.charges).toBe(2);
    expect(voided.abilityUses[0]?.effect).toBe('void');
  });
});

describe('accusations and suspicion', () => {
  it('limits accusations, bounds pile-ons and scores them at the end', () => {
    let state = withRoles(5, {
      p1: 'auditor',
      p2: 'saboteur',
      p3: 'broker',
      p4: 'fixer',
      p5: 'insider',
    });
    state = advanceTo(state, 'NEGOTIATION');
    expect(err(state, cmd('p1', { type: 'accuse', target: 'p1' }))).toBe('UNKNOWN_TARGET');
    state = ok(state, cmd('p1', { type: 'accuse', target: 'p2' }));
    expect(err(state, cmd('p1', { type: 'accuse', target: 'p3' }))).toBe('LIMIT_REACHED');
    state = ok(state, cmd('p3', { type: 'accuse', target: 'p2' }));
    state = ok(state, cmd('p4', { type: 'accuse', target: 'p5' }));
    // Two accusations against p2 in one round raise suspicion only once.
    expect(state.players[1]?.suspicion).toBe(1);
    expect(redactViewForPlayer(state, 'p5').accusations).toHaveLength(3);
    expect(state.log.filter((e) => e.kind === 'accusation' && e.to === undefined)).toHaveLength(3);
    state = nextNegotiation(state);
    state = ok(state, cmd('p4', { type: 'accuse', target: 'p5' }));
    state = nextNegotiation(state);
    expect(err(state, cmd('p4', { type: 'accuse', target: 'p5' }))).toBe('LIMIT_REACHED');
    expect(err(advanceTo(state, 'COMMITMENT'), cmd('p1', { type: 'accuse', target: 'p2' }))).toBe(
      'NOT_ALLOWED_IN_PHASE',
    );
    while (state.phase !== 'FINAL_RECKONING') state = expire(state);
    const reveal = (id: string) => state.results?.reveals.find((r) => r.playerId === id);
    expect(reveal('p1')?.accusationBonus).toBe(4); // auditor: 2 + 2
    expect(reveal('p3')?.accusationBonus).toBe(2);
    expect(reveal('p4')?.accusationPenalty).toBe(2);
    expect(reveal('p5')?.suspicionPenalty).toBe(0); // suspicion 2 is within the free allowance
    const score = state.results?.scores.find((s) => s.playerId === 'p4');
    expect(score?.penalties).toBe(2);
  });

  it('caps suspicion penalties and lets successful backing reduce suspicion', () => {
    let state = withRoles(4, { p1: 'auditor' });
    state.players[1]!.suspicion = 6;
    state = advanceTo(state, 'COMMITMENT');
    state = allCommit(setOp(state, { roll: 0 }), 1);
    state = expire(state);
    expect(state.players[1]?.suspicion).toBe(5);
    while (state.phase !== 'FINAL_RECKONING')
      state = state.phase === 'COMMITMENT' ? allCommit(state, 0) : expire(state);
    const p2 = state.results?.reveals.find((r) => r.playerId === 'p2');
    expect(p2?.suspicionPenalty).toBe(3);
  });

  it('treats accusing a deal partner as breaking a no-accusation deal', () => {
    let state = withRoles(4, { p1: 'auditor' });
    state = advanceTo(state, 'NEGOTIATION');
    state = ok(
      state,
      cmd('p1', { type: 'proposeDeal', invitees: ['p2'], terms: [{ kind: 'noAccuse' }], note: '' }),
    );
    state = ok(
      state,
      cmd('p2', { type: 'respondDeal', dealId: state.deals[0]?.id as string, accept: true }),
    );
    state = ok(state, cmd('p2', { type: 'accuse', target: 'p1' }));
    state = allCommit(advanceTo(state, 'COMMITMENT'), 0);
    expect(state.deals[0]?.kept).toEqual({ p1: true, p2: false });
  });
});

describe('hidden objectives', () => {
  function finished(
    objective: ObjectiveId,
    plan: (round: number) => number,
    extra?: (s: GameState) => GameState,
  ): { met: boolean; state: GameState } {
    let state = withRoles(4, {}, `obj-${objective}`);
    state.players[0]!.objective = objective;
    while (state.phase !== 'FINAL_RECKONING') {
      if (state.phase === 'NEGOTIATION' && extra) state = extra(state);
      if (state.phase === 'COMMITMENT') {
        const round = state.round;
        state = allCommit(state, (id) =>
          id === 'p1' ? Math.min(plan(round), state.players[0]?.credits ?? 0) : 1,
        );
      } else state = expire(state);
    }
    return { met: objectiveMet(state, rules, state.players[0] as never), state };
  }

  it('evaluates every objective from the match record', () => {
    expect(finished('backer', () => 1).met).toBe(true);
    expect(finished('backer', () => 0).met).toBe(false);
    expect(finished('reserve', () => 0).met).toBe(true);
    expect(finished('cleanHands', () => 0).met).toBe(true);
    expect(finished('contrarian', () => 3).met).toBe(false);
    expect(typeof finished('highRoller', () => 3).met).toBe('boolean');
    expect(typeof finished('investor', () => 3).met).toBe('boolean');
    const deals = (s: GameState) => {
      if (s.round > 1) return s;
      let t = ok(
        s,
        cmd('p1', {
          type: 'proposeDeal',
          invitees: ['p2', 'p3', 'p4'],
          terms: [{ kind: 'commit', amount: 1 }],
          note: '',
        }),
      );
      for (const id of ['p2', 'p3', 'p4'])
        t = ok(t, cmd(id, { type: 'respondDeal', dealId: t.deals[0]?.id as string, accept: true }));
      return t;
    };
    expect(finished('dealmaker', () => 1, deals).met).toBe(true);
    expect(finished('promiseKeeper', () => 1, deals).met).toBe(false); // only one promise
    const { state } = finished('reserve', () => 0);
    const scores = determineWinners(state);
    const p1 = scores.find((s) => s.playerId === 'p1');
    expect(p1?.objectiveBonus).toBe(2);
    expect(p1?.total).toBe(
      (p1?.influence ?? 0) + (p1?.creditPoints ?? 0) + 2 - (p1?.penalties ?? 0),
    );
  });
});

describe('tuned costs and bonuses (rules 2.0.0)', () => {
  it('pays the insider a tip for backing an operation it read that succeeds', () => {
    let state = withRoles(4, { p1: 'insider', p2: 'informant' });
    state = advanceTo(state, 'INTELLIGENCE');
    state = ok(state, ability('p1', { choice: 'current' }));
    state = ok(state, ability('p2', { choice: 'current' }));
    state = advanceTo(state, 'COMMITMENT');
    const win = allCommit(setOp(state, { roll: 0 }), (id) => (id === 'p2' ? 0 : 1));
    const share = (id: string) => win.operations[0]?.result?.payouts[id]?.influence ?? 0;
    expect(win.players[0]?.influence).toBe(share('p1') + 2);
    // The informant read it too but did not back it: no tip.
    expect(win.players[1]?.influence).toBe(share('p2'));
    const loss = allCommit(setOp(state, { roll: 0.99 }), 1);
    expect(loss.players[0]?.influence).toBe(0);
  });

  it('charges a point for each wrong opportunist forecast and fines exposed sabotage', () => {
    let state = withRoles(4, { p1: 'opportunist', p2: 'saboteur' }, 'fines');
    state = advanceTo(state, 'COMMITMENT');
    state = ok(state, ability('p1', { choice: 'SUCCESS' }));
    state = ok(state, ability('p2'));
    state = allCommit(setOp(state, { roll: 0.99 }), (id) => (id === 'p2' ? 0 : 1));
    state.abilityUses.find((u) => u.ability === 'sabotage')!.exposed = true;
    while (state.phase !== 'FINAL_RECKONING')
      state = state.phase === 'COMMITMENT' ? allCommit(state, 0) : expire(state);
    const reveal = (id: string) => state.results?.reveals.find((r) => r.playerId === id);
    expect(reveal('p1')?.abilityPenalty).toBe(1);
    expect(reveal('p2')?.abilityPenalty).toBe(2);
    const score = state.results?.scores.find((s) => s.playerId === 'p2');
    expect(score?.penalties).toBeGreaterThanOrEqual(2);
  });

  it('refuses accusations against a player who is already exposed', () => {
    let state = withRoles(4, { p1: 'auditor', p2: 'saboteur' });
    state = advanceTo(state, 'COMMITMENT');
    state = ok(state, ability('p2'));
    state = allCommit(state, 1);
    state.abilityUses[0]!.exposed = true;
    state = advanceTo(state, 'NEGOTIATION');
    expect(redactViewForPlayer(state, 'p3').players[1]?.exposed).toBe(true);
    expect(err(state, cmd('p1', { type: 'accuse', target: 'p2' }))).toBe('INVALID_COMMAND');
  });

  it('runs the auditor background check over every resolved operation', () => {
    let state = withRoles(4, { p1: 'auditor', p2: 'saboteur' });
    state = advanceTo(state, 'INTELLIGENCE');
    expect(err(state, ability('p1', { target: 'p2' }))).toBe('INVALID_COMMAND');
    state = advanceTo(state, 'COMMITMENT');
    state = ok(state, ability('p2'));
    state = allCommit(state, 1);
    for (let r = 0; r < 2; r++) state = nextNegotiation(state);
    const checked = ok(state, ability('p1', { target: 'p2' }));
    expect(checked.abilityUses.at(-1)?.effect).toBe('yes');
    expect(checked.abilityUses.at(-1)?.targetRound).toBeNull();
  });
});
