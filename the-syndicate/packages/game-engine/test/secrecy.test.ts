import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyCommand, redactViewForPlayer, type GameState } from '../src';
import { advanceTo, allCommit, cmd, expire, ok, started } from './helpers';

/** Every key path in a JSON value, e.g. "players.0.name". */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => [
    `${prefix}${k}`,
    ...keyPaths(v, `${prefix}${k}.`),
  ]);
}

/** Asserts the view for `viewer` reveals nothing it should not in the current phase. */
function assertNoLeaks(state: GameState, viewer: string): void {
  const view = redactViewForPlayer(state, viewer);
  const json = JSON.stringify(view);
  const paths = keyPaths(view);
  const finalPhase = state.phase === 'FINAL_RECKONING' || state.phase === 'RESULTS';
  // Other players' private resources never appear outside the final results.
  expect(paths.filter((p) => /^players\.\d+\.(credits|intel)$/.test(p))).toEqual([]);
  if (!finalPhase) {
    expect(view.results).toBeNull();
    expect(json).not.toContain('trueBase');
    expect(json).not.toContain('"roll"');
    expect(json).not.toContain('finalChance');
  }
  if (state.phase !== 'RESULTS') expect(json).not.toContain(state.seed);
  // Sealed commitments of the current round stay hidden until resolution.
  if (state.phase === 'COMMITMENT') {
    expect(view.operation?.result).toBeNull();
    for (const p of view.players) expect(Object.keys(p)).not.toContain('committed');
  }
  // Private log entries and deals only reach their members.
  for (const entry of view.log) expect(entry).not.toHaveProperty('to');
  for (const deal of view.deals) expect(deal.members).toContain(viewer);
  expect(view.self.id).toBe(viewer);
  const me = state.players.find((p) => p.id === viewer);
  expect(view.self.credits).toBe(me?.credits);
  expect(view.self.intel).toEqual(me?.intel);
}

describe('redactViewForPlayer', () => {
  it('hides others’ credits, intel, commitments, private deals and the seed in every phase', () => {
    let state = advanceTo(started(5, 'secret-seed-123'), 'NEGOTIATION');
    state = ok(
      state,
      cmd('p1', {
        type: 'proposeDeal',
        invitees: ['p2'],
        terms: [{ kind: 'commit', amount: 2 }],
        note: 'quiet',
      }),
    );
    state = ok(state, cmd('p3', { type: 'buyIntel' }));
    let guard = 0;
    while (state.phase !== 'RESULTS' && guard++ < 60) {
      for (const p of state.players) assertNoLeaks(state, p.id);
      if (state.phase === 'COMMITMENT') {
        state = ok(state, cmd('p1', { type: 'commit', amount: 2 }));
        for (const p of state.players) assertNoLeaks(state, p.id);
        state = allCommit(state, 1);
      } else {
        state = expire(state);
      }
    }
    for (const p of state.players) assertNoLeaks(state, p.id);
  });

  it('shows deals and private log entries only to their members', () => {
    let state = advanceTo(started(4), 'NEGOTIATION');
    state = ok(
      state,
      cmd('p1', { type: 'proposeDeal', invitees: ['p2'], terms: [{ kind: 'noAccuse' }], note: '' }),
    );
    state = ok(state, cmd('p3', { type: 'buyIntel' }));
    expect(redactViewForPlayer(state, 'p2').deals).toHaveLength(1);
    expect(redactViewForPlayer(state, 'p3').deals).toHaveLength(0);
    expect(redactViewForPlayer(state, 'p4').log.some((e) => e.kind === 'deal_proposed')).toBe(
      false,
    );
    expect(redactViewForPlayer(state, 'p3').log.some((e) => e.kind === 'intel_bought')).toBe(true);
    expect(redactViewForPlayer(state, 'p4').log.some((e) => e.kind === 'intel_bought')).toBe(false);
    expect(
      redactViewForPlayer(state, 'p4').self.intel.filter((r) => r.source === 'contact'),
    ).toHaveLength(0);
  });

  it('marks who has sealed without revealing amounts, then reveals amounts after resolution', () => {
    let state = advanceTo(started(4), 'COMMITMENT');
    state = ok(state, cmd('p2', { type: 'commit', amount: 3 }));
    const during = redactViewForPlayer(state, 'p1');
    expect(during.players.map((p) => p.sealed)).toEqual([false, true, false, false]);
    expect(JSON.stringify(during)).not.toMatch(/"p2":3/);
    expect(redactViewForPlayer(state, 'p2').self.committed).toBe(3);
    state = allCommit(state, 0);
    const after = redactViewForPlayer(state, 'p1');
    expect(after.operation?.result?.commitments.p2).toBe(3);
    expect(after.operation?.result?.audit).toBeNull();
  });

  it('reveals the audit trail at the final reckoning and the seed only in results', () => {
    let state = started(4, 'audit-seed');
    while (state.phase !== 'FINAL_RECKONING') state = expire(state);
    const reckoning = redactViewForPlayer(state, 'p1');
    expect(reckoning.results?.seed).toBeNull();
    expect(reckoning.history.every((h) => h.result?.audit !== null)).toBe(true);
    expect(reckoning.results?.finalCredits.p2).toBe(15);
    state = expire(state);
    expect(redactViewForPlayer(state, 'p1').results?.seed).toBe('audit-seed');
  });

  it('refuses to build a view for someone who is not seated', () => {
    expect(() => redactViewForPlayer(started(4), 'intruder')).toThrow();
  });

  it('never leaks secrets for random players and phases (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 12 }),
        fc.integer({ min: 0, max: 40 }),
        fc.string(),
        (n, steps, seed) => {
          let state = started(n, `prop-${seed}`);
          for (let i = 0; i < steps && state.phase !== 'RESULTS'; i++) {
            state =
              state.phase === 'COMMITMENT'
                ? allCommit(state, (id) => (id.length + i) % 4)
                : expire(state);
          }
          for (const p of state.players) assertNoLeaks(state, p.id);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('role secrecy (rules 2.0.0, property)', () => {
  it('never shows another player’s role, objective, charges or ability use before the reckoning', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 12 }),
        fc.integer({ min: 0, max: 40 }),
        fc.string(),
        (n, steps, seed) => {
          let state = started(n, `roles-${seed}`, {}, '2.0.0');
          for (let i = 0; i < steps && state.phase !== 'RESULTS'; i++) {
            if (state.phase === 'COMMITMENT') {
              for (const p of state.players) {
                const ability = {
                  type: 'useAbility',
                  target: state.players[(p.seat + 1) % n]?.id,
                  choice: i % 2 ? 'SUCCESS' : 'FAILURE',
                } as const;
                const r = applyCommand(state, {
                  actor: p.id,
                  now: state.phaseStartedAt + 1,
                  command: ability,
                });
                if (r.ok) state = r.state;
              }
              state = allCommit(state, (id) => (id.length + i) % 4);
            } else state = expire(state);
          }
          const final = state.phase === 'FINAL_RECKONING' || state.phase === 'RESULTS';
          for (const p of state.players) {
            const view = redactViewForPlayer(state, p.id);
            const paths = keyPaths(view);
            expect(paths.filter((k) => /^players\.\d+\.(role|objective|charges)$/.test(k))).toEqual(
              [],
            );
            if (!final) {
              expect(view.results).toBeNull();
              const json = JSON.stringify(view);
              expect(json).not.toContain('"abilityUses"');
              expect(json).not.toContain('"bonuses"');
              // The viewer's own role card names its role and archetype; nothing else may
              // name another player's role.
              const own = new Set([view.self.role?.id, view.self.role?.archetype]);
              for (const o of state.players) {
                if (o.id !== p.id && !own.has(o.role ?? ''))
                  expect(json).not.toContain(`"${o.role}"`);
              }
            }
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
