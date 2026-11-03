import { afterEach, describe, expect, it } from 'vitest';
import { Client, createRoom, expirePhase, joinRoom } from './client';

const open: Client[] = [];
afterEach(() => {
  for (const c of open.splice(0)) c.close();
});

async function soloWithBots(bots: number): Promise<Client> {
  const seat = await createRoom('Solo', 'fox', { beginner: false, length: 'quick' });
  const host = await Client.connect(seat, 'Solo');
  open.push(host);
  for (let i = 0; i < bots; i++) await host.ok({ type: 'addBot' });
  await host.until((v) => v.players.length === bots + 1);
  return host;
}

describe('practice bots over real sockets', () => {
  it('lets one person play a whole match against three bots', async () => {
    const host = await soloWithBots(3);
    const view = host.view!;
    expect(view.players.filter((p) => p.bot)).toHaveLength(3);
    expect(view.players.filter((p) => p.bot).every((p) => p.ready)).toBe(true);
    // Bots never see the host's controls, and only the host can add them.
    expect(view.hostId).toBe(host.seat.playerId);
    await host.ok({ type: 'start' });
    await host.until((v) => v.phase === 'ROLE_REVEAL');
    for (let step = 0; step < 80 && host.view!.phase !== 'RESULTS'; step++) {
      const { phase, phaseVersion } = host.view!;
      await host.ok(
        phase === 'COMMITMENT' ? { type: 'commit', amount: 1 } : { type: 'setReady', ready: true },
      );
      // The bots are done before the person, so the person's action ends the phase.
      await host.until((v) => v.phaseVersion > phaseVersion);
    }
    const final = host.view!;
    expect(final.phase).toBe('RESULTS');
    // Every bot sealed a commitment in every round.
    for (const round of final.history) {
      expect(Object.keys(round.result?.commitments ?? {})).toHaveLength(4);
    }
  });

  it('does not race ahead while the only person is away; deadlines still move it', async () => {
    const host = await soloWithBots(3);
    await host.ok({ type: 'start' });
    await host.until((v) => v.phase === 'ROLE_REVEAL');
    const { roomCode } = host.seat;
    // Nobody else is watching to observe the disconnect, so give the server a moment.
    host.close();
    await new Promise((r) => setTimeout(r, 1500));
    // Still in role reveal (the expiry moves it exactly one phase): bots alone never end a
    // phase early, although all of them are done.
    expect(await expirePhase(roomCode)).toBe('INTELLIGENCE');
    await host.open();
    const view = await host.until((v) => v.phase === 'INTELLIGENCE');
    expect(view.players.find((p) => p.id === host.seat.playerId)?.connected).toBe(true);
  });

  it('answers a deal a person proposes after the bots have taken their turn', async () => {
    const host = await soloWithBots(3);
    await host.ok({ type: 'start' });
    for (const phase of ['ROLE_REVEAL', 'INTELLIGENCE']) {
      await host.until((v) => v.phase === phase);
      await host.ok({ type: 'setReady', ready: true });
    }
    const view = await host.until((v) => v.phase === 'NEGOTIATION');
    const bots = view.players.filter((p) => p.bot).map((p) => p.id);
    await host.ok({
      type: 'proposeDeal',
      invitees: bots,
      terms: [{ kind: 'commit', amount: 1 }],
      note: 'all in?',
    });
    const answered = await host.until((v) =>
      v.deals.some((d) => d.note === 'all in?' && bots.every((b) => d.responses[b] !== 'pending')),
    );
    expect(answered.phase).toBe('NEGOTIATION');
  });

  it('rejects addBot from a player who is not the host', async () => {
    const seat = await createRoom('Host', 'fox', { beginner: false });
    const host = await Client.connect(seat, 'Host');
    open.push(host);
    const guest = await Client.connect(await joinRoom(seat.roomCode, 'Guest'), 'Guest');
    open.push(guest);
    const ack = await guest.command({ type: 'addBot' });
    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
  });
});
