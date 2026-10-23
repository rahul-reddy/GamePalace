import { replay, serialize, type CommandEnvelope } from '@syndicate/game-engine';
import type { RoomSummary } from '@syndicate/shared';
import { afterEach, describe, expect, it } from 'vitest';
import {
  allReady,
  api,
  Client,
  commandId,
  createRoom,
  expirePhase,
  joinRoom,
  room,
  startMatch,
} from './client';

const open: Client[] = [];
afterEach(() => {
  for (const c of open.splice(0)) c.close();
});
async function track(clients: Promise<Client[]>): Promise<Client[]> {
  const list = await clients;
  open.push(...list);
  return list;
}

describe('rooms over real HTTP and WebSockets', () => {
  it('creates a room with a 6-character code and joins players into one authoritative state', async () => {
    const clients = await track(room(4));
    const code = clients[0]?.seat.roomCode as string;
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    const summary = await api<RoomSummary>(`/api/rooms/${code.toLowerCase()}`);
    expect(summary.body).toMatchObject({
      roomCode: code,
      phase: 'LOBBY',
      players: 4,
      joinable: true,
    });
    const ids = clients.map((c) => c.view?.self.id);
    expect(new Set(ids).size).toBe(4);
    for (const c of clients) expect(c.view?.players.map((p) => p.id)).toEqual(ids);
  });

  it('plays a full four-player match with consistent views and no leaked secrets', async () => {
    const clients = await track(room(4));
    await startMatch(clients);
    const code = clients[0]?.seat.roomCode as string;
    for (let round = 1; round <= 5; round++) {
      await allReady(clients); // role reveal or summary -> intelligence
      await Promise.all(
        clients.map((c) => c.until((v) => v.phase === 'INTELLIGENCE' && v.round === round)),
      );
      await allReady(clients); // -> negotiation
      await allReady(clients); // -> commitment
      await Promise.all(clients.map((c, i) => c.ok({ type: 'commit', amount: (i + round) % 4 })));
      await Promise.all(clients.map((c) => c.until((v) => v.phase === 'RESOLUTION')));
      const outcomes = clients.map((c) => JSON.stringify(c.view?.operation?.result));
      expect(new Set(outcomes).size).toBe(1);
      await allReady(clients); // -> summary
      if (round === 1) {
        const firstRound = clients[0]?.view?.history[0] ?? clients[0]?.view?.operation;
        expect(firstRound?.result?.commitments).toBeDefined();
      }
    }
    await allReady(clients); // -> final reckoning
    await allReady(clients); // -> results
    const finals = await Promise.all(clients.map((c) => c.until((v) => v.phase === 'RESULTS')));
    expect(new Set(finals.map((v) => JSON.stringify(v.results?.scores))).size).toBe(1);
    expect(finals[0]?.results?.seed).toMatch(/^[0-9a-f]{64}$/);
    // Network inspection: no message to any player ever carried another player's
    // private credits before results, nor the true odds or the seed.
    for (const c of clients) {
      for (const m of c.messages) {
        if (m.type !== 'state') continue;
        const text = JSON.stringify(m.view.players);
        expect(text).not.toContain('credits');
        expect(text).not.toContain('intel');
        if (m.view.phase !== 'FINAL_RECKONING' && m.view.phase !== 'RESULTS') {
          const all = JSON.stringify(m);
          expect(all).not.toContain('trueBase');
          expect(all).not.toContain(finals[0]?.results?.seed as string);
        }
      }
    }
    // The server's command log replays to the exact persisted state.
    const log = await api<{
      create: Record<string, unknown> & { seed: string };
      commands: CommandEnvelope[];
      state: string;
    }>(`/api/test/rooms/${code}/replay`, { method: 'POST' });
    const { seed, ...create } = log.body.create;
    const rebuilt = replay({ create: create as never, seed, commands: log.body.commands });
    expect(serialize(rebuilt)).toBe(log.body.state);
  });

  it('rejects sockets without a valid seat token and commands before hello', async () => {
    const [host] = await track(room(1));
    const seat = (host as Client).seat;
    const forged = new Client({ ...seat, token: 'x'.repeat(43) }, 'forger');
    await forged.open();
    expect((await forged.closedWith()).code).toBe(4003);
    const silent = new WebSocket(
      `${seat.roomCode ? '' : ''}${process.env.SYNDICATE_BASE_URL?.replace('http', 'ws') ?? 'ws://127.0.0.1:8791'}/api/rooms/${seat.roomCode}/ws`,
    );
    const reply = await new Promise<string>((resolve) => {
      silent.onopen = () =>
        silent.send(
          JSON.stringify({ v: 1, type: 'cmd', commandId: commandId(), command: { type: 'start' } }),
        );
      silent.onmessage = (e) => resolve(String(e.data));
    });
    expect(JSON.parse(reply)).toMatchObject({ type: 'error', error: { code: 'UNAUTHORIZED' } });
    silent.close();
  });

  it('isolates rooms: a seat token from one room is useless in another', async () => {
    const a = await track(room(2));
    const b = await track(room(2));
    const intruder = new Client(
      { ...(b[0] as Client).seat, token: (a[0] as Client).seat.token },
      'intruder',
    );
    await intruder.open();
    expect((await intruder.closedWith()).code).toBe(4003);
    await (a[1] as Client).ok({ type: 'chat', kind: 'preset', text: 'deal' });
    await (a[0] as Client).until((v) => v.chat.length === 1);
    expect(b[0]?.view?.chat).toHaveLength(0);
  });

  it('applies a duplicated commandId once and returns the original acknowledgement', async () => {
    const clients = await track(room(4));
    await startMatch(clients);
    await allReady(clients);
    await allReady(clients);
    await allReady(clients);
    const c = clients[0] as Client;
    await c.until((v) => v.phase === 'COMMITMENT');
    const id = commandId();
    const first = await c.command({ type: 'commit', amount: 3 }, { id });
    const second = await c.command({ type: 'commit', amount: 3 }, { id });
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: true, duplicate: true });
    expect(c.view?.self.credits).toBe(7);
    const third = await c.command({ type: 'commit', amount: 1 });
    expect(third).toMatchObject({ ok: false, error: { code: 'ALREADY_DONE' } });
  });

  it('resolves exactly once when every player commits at the same instant', async () => {
    const clients = await track(room(6));
    await startMatch(clients);
    for (let i = 0; i < 3; i++) await allReady(clients);
    const acks = await Promise.all(clients.map((c) => c.command({ type: 'commit', amount: 2 })));
    expect(acks.every((a) => a.ok)).toBe(true);
    const views = await Promise.all(clients.map((c) => c.until((v) => v.phase === 'RESOLUTION')));
    expect(views[0]?.operation?.result?.totalCommitted).toBe(12);
    const resolvedEntries = (clients[0] as Client).view?.log.filter(
      (e) => e.kind === 'operation_resolved',
    );
    expect(resolvedEntries).toHaveLength(1);
  });

  it('refuses commands addressed to a phase that has ended, and late commitments', async () => {
    const clients = await track(room(4));
    await startMatch(clients);
    const host = clients[0] as Client;
    const stale = host.view?.phaseVersion as number;
    await expirePhase(host.seat.roomCode);
    await host.until((v) => v.phase === 'INTELLIGENCE');
    const ack = await host.command({ type: 'buyIntel' }, { expectedPhaseVersion: stale });
    expect(ack).toMatchObject({ ok: false, error: { code: 'STALE_PHASE' } });
    await expirePhase(host.seat.roomCode);
    await expirePhase(host.seat.roomCode);
    await host.until((v) => v.phase === 'COMMITMENT');
    await expirePhase(host.seat.roomCode);
    await host.until((v) => v.phase === 'RESOLUTION');
    const late = await host.command({ type: 'commit', amount: 2 });
    expect(late).toMatchObject({ ok: false, error: { code: 'NOT_ALLOWED_IN_PHASE' } });
    expect(host.view?.operation?.result?.commitments[host.seat.playerId]).toBe(0);
  });

  it('reconnects the same seat from a new connection and replaces the old one', async () => {
    const clients = await track(room(4));
    await startMatch(clients);
    const old = clients[2] as Client;
    const fresh = await Client.connect(old.seat, 'Player 3 (new tab)');
    open.push(fresh);
    expect((await old.closedWith()).code).toBe(4001);
    expect(fresh.view?.self.id).toBe(old.seat.playerId);
    expect(fresh.view?.phase).toBe('ROLE_REVEAL');
    const host = clients[0] as Client;
    expect(host.view?.players.find((p) => p.id === old.seat.playerId)?.connected).toBe(true);
  });

  it('marks disconnected players, advances without them and restores them on return', async () => {
    const clients = await track(room(4));
    await startMatch(clients);
    const leaver = clients[3] as Client;
    leaver.close();
    const host = clients[0] as Client;
    await host.until(
      (v) => v.players.find((p) => p.id === leaver.seat.playerId)?.connected === false,
    );
    await Promise.all(clients.slice(0, 3).map((c) => c.ok({ type: 'setReady', ready: true })));
    await host.until((v) => v.phase === 'INTELLIGENCE');
    const back = await Client.connect(leaver.seat, 'returning');
    open.push(back);
    expect(back.view?.phase).toBe('INTELLIGENCE');
    expect(back.view?.self.intel).toHaveLength(1);
    await host.until(
      (v) => v.players.find((p) => p.id === leaver.seat.playerId)?.connected === true,
    );
  });

  it('advances on a real Durable Object alarm when the deadline passes', async () => {
    const clients = await track(room(4, { beginner: false, pace: 'fast' }));
    await startMatch(clients);
    const started = Date.now();
    const view = await (clients[0] as Client).until((v) => v.phase === 'INTELLIGENCE', 40_000);
    const waited = Date.now() - started;
    expect(view.round).toBe(1);
    expect(waited).toBeGreaterThan(15_000);
    expect(waited).toBeLessThan(30_000);
  }, 60_000);

  it('lets only the host kick, closes the kicked socket and revokes its token', async () => {
    const clients = await track(room(4));
    const [host, p2, p3] = clients as [Client, Client, Client];
    expect(await p2.command({ type: 'kick', target: p3.seat.playerId })).toMatchObject({
      ok: false,
      error: { code: 'NOT_HOST' },
    });
    await host.ok({ type: 'kick', target: p3.seat.playerId });
    expect((await p3.closedWith()).code).toBe(4004);
    const again = new Client(p3.seat, 'kicked again');
    await again.open();
    expect((await again.closedWith()).code).toBe(4003);
    await host.until((v) => v.players.length === 3);
  });

  it('refuses joins when full or mid-match, and unknown codes', async () => {
    const clients = await track(room(4));
    await startMatch(clients);
    const code = (clients[0] as Client).seat.roomCode;
    const late = await api<{ error: { code: string } }>(`/api/rooms/${code}/join`, {
      method: 'POST',
      json: { name: 'Late', avatar: 'cat' },
    });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('MATCH_IN_PROGRESS');
    const missing = await api<{ error: { code: string } }>('/api/rooms/ZZZZZZ/join', {
      method: 'POST',
      json: { name: 'X', avatar: 'cat' },
    });
    expect(missing.status).toBe(404);
    const malformed = await api<{ error: { code: string } }>('/api/rooms/abc/join', {
      method: 'POST',
      json: { name: 'X', avatar: 'cat' },
    });
    expect(malformed.status).toBe(404);
    const host = await createRoom();
    for (let i = 2; i <= 12; i++) await joinRoom(host.roomCode, `P${i}`);
    const full = await api<{ error: { code: string } }>(`/api/rooms/${host.roomCode}/join`, {
      method: 'POST',
      json: { name: 'Thirteen', avatar: 'cat' },
    });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('ROOM_FULL');
  });

  it('expires idle rooms, releases the code and closes sockets', async () => {
    const [host] = await track(room(1));
    const code = (host as Client).seat.roomCode;
    const aged = await api<{ destroyed: boolean }>(
      `/api/test/rooms/${code}/age?ms=${3 * 60 * 60 * 1000}`,
      { method: 'POST' },
    );
    expect(aged.body.destroyed).toBe(true);
    expect((await (host as Client).closedWith()).code).toBe(4010);
    expect((await api(`/api/rooms/${code}`)).status).toBe(404);
  });

  it('answers pings with server time', async () => {
    const [host] = await track(room(1));
    const pong = (host as Client).waitFor((m) => m.type === 'pong');
    (host as Client).send({ v: 1, type: 'ping', t: 42 });
    expect(await pong).toMatchObject({ type: 'pong', t: 42 });
  });
});
