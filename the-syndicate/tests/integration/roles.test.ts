import { afterEach, describe, expect, it } from 'vitest';
import { allReady, Client, room, startMatch } from './client';

const open: Client[] = [];
afterEach(() => {
  for (const c of open.splice(0)) c.close();
});

describe('secret roles over real sockets (rules 2.0.0)', () => {
  it('deals each player a private role and never sends it to anyone else before the reckoning', async () => {
    const clients = await room(6);
    open.push(...clients);
    await startMatch(clients);
    const roles = clients.map((c) => c.view?.self.role?.id);
    expect(roles.every(Boolean)).toBe(true);
    expect(new Set(roles).size).toBe(6);
    expect(clients.every((c) => c.view?.self.objective)).toBe(true);
    // Play into the first commitment so plenty of frames have been sent.
    await allReady(clients);
    await allReady(clients);
    await allReady(clients);
    for (const [i, c] of clients.entries()) {
      const own = new Set([c.view?.self.role?.id, c.view?.self.role?.archetype]);
      // The public role catalog is identical for everyone; check everything else.
      const frames = c.messages
        .filter((m) => m.type === 'state')
        .map((m) => (m.type === 'state' ? JSON.stringify({ ...m.view, rules: null }) : ''));
      for (const [j, other] of roles.entries()) {
        if (i === j || own.has(other)) continue;
        for (const f of frames) expect(f).not.toContain(`"${other}"`);
      }
    }
  });

  it('accepts a legal ability and accusation and rejects illegal ones', async () => {
    const clients = await room(4);
    open.push(...clients);
    await startMatch(clients);
    await allReady(clients); // -> intelligence
    await allReady(clients); // -> negotiation
    const [a, b] = clients as [Client, Client];
    const accused = await a.command({ type: 'accuse', target: b.seat.playerId });
    expect(accused.ok).toBe(true);
    await b.until(
      (v) =>
        v.accusations.length === 1 &&
        (v.players.find((p) => p.id === b.seat.playerId)?.suspicion ?? 0) === 1,
    );
    expect(await a.command({ type: 'accuse', target: b.seat.playerId })).toMatchObject({
      ok: false,
      error: { code: 'LIMIT_REACHED' },
    });
    await allReady(clients); // -> commitment
    // A commitment-phase ability works for whoever holds one; peek/investigate are refused here.
    for (const c of clients) {
      const role = c.view?.self.role;
      const target = clients.find((o) => o !== c)?.seat.playerId;
      const ack = await c.command({ type: 'useAbility', target, choice: 'SUCCESS' });
      const commitPhaseAbility =
        role && ['broker', 'insure', 'sabotage', 'forecast'].includes(role.ability);
      expect([role?.id, ack.ok]).toEqual([role?.id, Boolean(commitPhaseAbility)]);
      if (ack.ok)
        expect(
          c.view?.self.abilityUsedThisRound || (await c.until((v) => v.self.abilityUsedThisRound)),
        ).toBeTruthy();
    }
  });
});
