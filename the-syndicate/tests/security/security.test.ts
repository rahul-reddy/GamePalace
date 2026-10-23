// Adversarial tests against the real Worker. Each test names the threat it covers
// (see docs/SECURITY.md).
import { afterEach, describe, expect, it } from 'vitest';
import {
  allReady,
  api,
  BASE,
  Client,
  commandId,
  createRoom,
  joinRoom,
  room,
  startMatch,
} from '../integration/client';

const open: Client[] = [];
afterEach(() => {
  for (const c of open.splice(0)) c.close();
});
async function track(clients: Promise<Client[]>): Promise<Client[]> {
  const list = await clients;
  open.push(...list);
  return list;
}

async function toCommitment(clients: Client[]): Promise<void> {
  await startMatch(clients);
  for (let i = 0; i < 3; i++) await allReady(clients);
  await Promise.all(clients.map((c) => c.until((v) => v.phase === 'COMMITMENT')));
}

describe('threat: forged authoritative events', () => {
  it('refuses system commands, seeds and extra fields from clients', async () => {
    const [host] = await track(room(4));
    const c = host as Client;
    for (const command of [
      { type: 'tick' },
      { type: 'join', playerId: 'p_evil', name: 'Evil', avatar: 'fox' },
      { type: 'presence', playerId: c.seat.playerId, connected: false },
      { type: 'commit', amount: 1, influence: 99 },
      { type: 'setReady', ready: true, actor: 'someone-else' },
    ]) {
      const reply = c.waitFor((m) => m.type === 'error');
      c.send({ v: 1, type: 'cmd', commandId: commandId(), command });
      expect(await reply).toMatchObject({ type: 'error', error: { code: 'BAD_MESSAGE' } });
    }
    const seeded = c.waitFor((m) => m.type === 'error');
    c.send({
      v: 1,
      type: 'cmd',
      commandId: commandId(),
      command: { type: 'start' },
      seed: 'chosen',
    });
    expect(await seeded).toMatchObject({ error: { code: 'BAD_MESSAGE' } });
  });
});

describe('threat: impersonating another seat', () => {
  it('acts only as the authenticated seat, whatever the message claims', async () => {
    const clients = await track(room(4));
    const [, p2, p3] = clients as [Client, Client, Client];
    // There is no actor field in the protocol; a command always acts for the socket's seat.
    await p2.ok({ type: 'chat', kind: 'preset', text: 'trust' });
    const view = await p3.until((v) => v.chat.length === 1);
    expect(view.chat[0]?.from).toBe(p2.seat.playerId);
    // A second hello with someone else's token on an authenticated socket is refused.
    const reply = p2.waitFor((m) => m.type === 'error');
    p2.send({ v: 1, type: 'hello', token: p3.seat.token });
    expect(await reply).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });
});

describe('threat: replayed and duplicated commands', () => {
  it('never applies a replayed commitment twice', async () => {
    const clients = await track(room(4));
    await toCommitment(clients);
    const c = clients[1] as Client;
    const id = commandId();
    const message = { v: 1, type: 'cmd', commandId: id, command: { type: 'commit', amount: 3 } };
    for (let i = 0; i < 3; i++) c.send(message);
    const acks = () => c.messages.filter((m) => m.type === 'ack' && m.commandId === id);
    for (let i = 0; i < 100 && acks().length < 3; i++) await new Promise((r) => setTimeout(r, 50));
    const replies = acks() as { ok: boolean; duplicate?: boolean }[];
    expect(replies).toHaveLength(3);
    expect(replies.every((r) => r.ok)).toBe(true);
    expect(replies.filter((r) => r.duplicate)).toHaveLength(2);
    await c.until((v) => v.self.committed === 3);
    expect(c.view?.self.credits).toBe(7);
  });
});

describe('threat: spending beyond balance and illegal amounts', () => {
  it('rejects over-commitment, negative and fractional amounts', async () => {
    const clients = await track(room(4));
    await toCommitment(clients);
    const c = clients[2] as Client;
    for (const amount of [4, -1, 2.5, 1e9]) {
      const reply = c.waitFor((m) => m.type === 'error' || m.type === 'ack');
      c.send({ v: 1, type: 'cmd', commandId: commandId(), command: { type: 'commit', amount } });
      expect(await reply).toMatchObject({ type: 'error', error: { code: 'BAD_MESSAGE' } });
    }
    expect(c.view?.self.credits).toBe(10);
  });

  it('serializes simultaneous intel purchases so credits cannot be double spent', async () => {
    const clients = await track(room(4));
    await startMatch(clients);
    await allReady(clients);
    const c = clients[0] as Client;
    await c.until((v) => v.phase === 'INTELLIGENCE');
    const replies = await Promise.all(
      Array.from({ length: 6 }, () => c.command({ type: 'buyIntel' })),
    );
    expect(replies.filter((r) => r.ok)).toHaveLength(1);
    expect(c.view?.self.intel.filter((r) => r.source === 'contact')).toHaveLength(1);
  });
});

describe('threat: unauthorized game advancement', () => {
  it('lets only the host start, and nobody skip phases', async () => {
    const clients = await track(room(4));
    const p2 = clients[1] as Client;
    await Promise.all(clients.slice(1).map((c) => c.ok({ type: 'setReady', ready: true })));
    expect(await p2.command({ type: 'start' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_HOST' },
    });
    expect(await p2.command({ type: 'rematch' })).toMatchObject({ ok: false });
    expect(await p2.command({ type: 'updateSettings', settings: { pace: 'fast' } })).toMatchObject({
      ok: false,
      error: { code: 'NOT_HOST' },
    });
    // The test-only fast-forward endpoint is not reachable through the room socket.
    expect(p2.view?.phase).toBe('LOBBY');
  });
});

describe('threat: unauthorized viewing of private intel', () => {
  it('sends each player only their own rumor and contact report', async () => {
    const clients = await track(room(4));
    await startMatch(clients);
    await allReady(clients);
    await Promise.all(clients.map((c) => c.until((v) => v.phase === 'INTELLIGENCE')));
    await (clients[0] as Client).ok({ type: 'buyIntel' });
    await (clients[1] as Client).until((v) => v.phase === 'INTELLIGENCE');
    for (const c of clients) {
      const raw = c.messages.filter((m) => m.type === 'state').map((m) => JSON.stringify(m));
      const last = c.view;
      expect(last?.self.intel.filter((r) => r.source === 'rumor')).toHaveLength(1);
      for (const text of raw)
        expect(text.match(/"source":"rumor"/g)?.length ?? 0).toBeLessThanOrEqual(1);
    }
    expect((clients[1] as Client).view?.self.intel.some((r) => r.source === 'contact')).toBe(false);
    expect((clients[1] as Client).view?.log.some((e) => e.kind === 'intel_bought')).toBe(false);
  });
});

describe('threat: cross-site use and malicious input', () => {
  it('refuses API calls and sockets from foreign origins', async () => {
    const r = await fetch(`${BASE}/api/rooms`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', avatar: 'fox' }),
    });
    expect(r.status).toBe(403);
    const seat = await createRoom();
    // Undici's WebSocket accepts extra headers, as a browser on a foreign page would send Origin.
    const Ws = WebSocket as unknown as new (
      url: string,
      init: { headers: Record<string, string> },
    ) => WebSocket;
    const ws = new Ws(`${BASE.replace('http', 'ws')}/api/rooms/${seat.roomCode}/ws`, {
      headers: { Origin: 'https://evil.example' },
    });
    const outcome = await new Promise<string>((resolve) => {
      ws.onopen = () => resolve('opened');
      ws.onerror = () => resolve('refused');
    });
    expect(outcome).toBe('refused');
  });

  it('stores HTML-looking nicknames as plain text and refuses abusive ones', async () => {
    const seat = await createRoom('<img src=x onerror=alert(1)>');
    const c = await Client.connect(seat);
    open.push(c);
    expect(c.view?.players[0]?.name).toBe('<img src=x onerr');
    const abusive = await api<{ error: { code: string } }>(`/api/rooms/${seat.roomCode}/join`, {
      method: 'POST',
      json: { name: 'shithead', avatar: 'cat' },
    });
    expect(abusive.status).toBe(400);
  });

  it('rejects oversized, non-JSON and wrong-version messages and closes persistent abusers', async () => {
    const [host] = await track(room(1));
    const c = host as Client;
    const big = c.waitFor((m) => m.type === 'error');
    c.send('x'.repeat(10_000));
    expect(await big).toMatchObject({ error: { code: 'BAD_MESSAGE' } });
    const notJson = c.waitFor((m) => m.type === 'error');
    c.send('{not json');
    expect(await notJson).toMatchObject({ error: { code: 'BAD_MESSAGE' } });
    for (let i = 0; i < 10; i++) c.send('[]');
    expect((await c.closedWith()).code).toBe(4400);
    const v2 = new Client(c.seat, 'future client');
    await v2.open();
    open.push(v2);
    const reply = v2.waitFor((m) => m.type === 'error' && m.fatal);
    v2.send({ v: 2, type: 'ping', t: 1 });
    expect(await reply).toMatchObject({ error: { code: 'UNSUPPORTED_VERSION' } });
  });

  it('rejects oversized and malformed HTTP bodies', async () => {
    const big = await api('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ name: 'x'.repeat(5000), avatar: 'fox' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(big.status).toBe(400);
    const bad = await api('/api/rooms', {
      method: 'POST',
      body: 'nope',
      headers: { 'content-type': 'application/json' },
    });
    expect(bad.status).toBe(400);
  });
});

describe('threat: resource exhaustion and enumeration', () => {
  it('rate limits room creation and joins per client', async () => {
    const headers = { 'x-syndicate-test-client': `flood-${Date.now()}` };
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push(
        (
          await api('/api/rooms', {
            method: 'POST',
            json: { name: 'Flood', avatar: 'fox' },
            headers,
          })
        ).status,
      );
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    const guesses: number[] = [];
    for (let i = 0; i < 32; i++) {
      guesses.push(
        (
          await api('/api/rooms/ZZZZZ2/join', {
            method: 'POST',
            json: { name: 'G', avatar: 'fox' },
            headers: { 'x-syndicate-test-client': 'guesser' },
          })
        ).status,
      );
    }
    expect(guesses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(2);
  });

  it('rate limits message floods on a socket', async () => {
    const [host] = await track(room(1));
    const c = host as Client;
    const limited = c.waitFor((m) => m.type === 'error' && m.error.code === 'RATE_LIMITED');
    for (let i = 0; i < 60; i++) c.send({ v: 1, type: 'ping', t: i });
    expect(await limited).toBeTruthy();
  });

  it('closes sockets that never authenticate', async () => {
    const seat = await createRoom();
    const ws = new WebSocket(`${BASE.replace('http', 'ws')}/api/rooms/${seat.roomCode}/ws`);
    const code = await new Promise<number>((resolve) => (ws.onclose = (e) => resolve(e.code)));
    expect(code).toBe(4000);
  }, 30_000);
});

describe('threat: expired and revoked credentials', () => {
  it('refuses the token of a player who left the lobby', async () => {
    const seat = await createRoom();
    const guestSeat = await joinRoom(seat.roomCode, 'Guest');
    const guest = await Client.connect(guestSeat);
    await guest.ok({ type: 'leave' });
    await guest.closedWith();
    const again = new Client(guestSeat);
    await again.open();
    expect((await again.closedWith()).code).toBe(4003);
  });
});
