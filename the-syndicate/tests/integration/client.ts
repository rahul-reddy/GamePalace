// A real protocol client for integration, security and load tests. It speaks the
// same HTTP + WebSocket protocol as the browser app.
import type { Avatar, PlayerCommand, PlayerView } from '@syndicate/game-engine';
import type { SeatResponse, ServerMessage } from '@syndicate/shared';

export const BASE = process.env.SYNDICATE_BASE_URL ?? 'http://127.0.0.1:8791';
/** Read at call time so a test can point the client at a different server. */
const base = () => process.env.SYNDICATE_BASE_URL ?? BASE;

let commandCounter = 0;
export function commandId(): string {
  commandCounter += 1;
  return `cmd${Date.now().toString(36)}${commandCounter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const headers = new Headers(init.headers);
  // Each call looks like a different client to the server's rate limiter (TEST_MODE only).
  if (!headers.has('x-syndicate-test-client'))
    headers.set('x-syndicate-test-client', `t-${Math.random()}`);
  if (init.json !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`${base()}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
}

export async function createRoom(
  name = 'Host',
  avatar: Avatar = 'fox',
  settings: Record<string, unknown> = { beginner: false },
): Promise<SeatResponse> {
  const r = await api<SeatResponse>('/api/rooms', {
    method: 'POST',
    json: { name, avatar, settings },
  });
  if (r.status !== 201) throw new Error(`create failed ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

export async function joinRoom(
  code: string,
  name: string,
  avatar: Avatar = 'owl',
): Promise<SeatResponse> {
  const r = await api<SeatResponse>(`/api/rooms/${code}/join`, {
    method: 'POST',
    json: { name, avatar },
  });
  if (r.status !== 201) throw new Error(`join failed ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

export async function expirePhase(code: string): Promise<string> {
  const r = await api<{ phase: string }>(`/api/test/rooms/${code}/expire`, { method: 'POST' });
  return r.body.phase;
}

type Ack = Extract<ServerMessage, { type: 'ack' }>;

export class Client {
  ws!: WebSocket;
  view: PlayerView | null = null;
  seq = 0;
  messages: ServerMessage[] = [];
  closed: { code: number; reason: string } | null = null;
  private waiters: { test: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] =
    [];

  constructor(
    readonly seat: SeatResponse,
    readonly name = seat.playerId,
  ) {}

  static async connect(seat: SeatResponse, name?: string): Promise<Client> {
    const client = new Client(seat, name);
    await client.open();
    return client;
  }

  async open(token = this.seat.token): Promise<void> {
    this.closed = null;
    // Undici's WebSocket accepts headers; the test identity spreads socket opens across the
    // rate limiter the way many real clients would (honoured only in TEST_MODE).
    const Ws = WebSocket as unknown as new (
      url: string,
      init: { headers: Record<string, string> },
    ) => WebSocket;
    this.ws = new Ws(`${base().replace(/^http/, 'ws')}/api/rooms/${this.seat.roomCode}/ws`, {
      headers: { 'x-syndicate-test-client': `t-${Math.random()}` },
    });
    this.ws.onmessage = (event) => this.receive(JSON.parse(String(event.data)) as ServerMessage);
    this.ws.onclose = (event) => {
      this.closed = { code: event.code, reason: event.reason };
    };
    await new Promise<void>((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('socket failed to open'));
    });
    this.send({ v: 1, type: 'hello', token });
    await this.waitFor((m) => m.type === 'state' || (m.type === 'error' && m.fatal));
  }

  private receive(message: ServerMessage): void {
    this.messages.push(message);
    if (message.type === 'state' && message.seq >= this.seq) {
      this.seq = message.seq;
      this.view = message.view;
    }
    this.waiters = this.waiters.filter((w) => {
      if (!w.test(message)) return true;
      w.resolve(message);
      return false;
    });
  }

  send(message: unknown): void {
    this.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  waitFor(test: (m: ServerMessage) => boolean, timeoutMs = 15_000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${this.name}: timed out waiting`)),
        timeoutMs,
      );
      this.waiters.push({
        test,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  /** Waits until this client's latest view satisfies `test`. */
  async until(test: (v: PlayerView) => boolean, timeoutMs = 15_000): Promise<PlayerView> {
    if (this.view && test(this.view)) return this.view;
    await this.waitFor((m) => m.type === 'state' && test(m.view), timeoutMs);
    return this.view as PlayerView;
  }

  async command(
    command: PlayerCommand,
    opts: { id?: string; expectedPhaseVersion?: number } = {},
  ): Promise<Ack> {
    const id = opts.id ?? commandId();
    const message: Record<string, unknown> = { v: 1, type: 'cmd', commandId: id, command };
    if (opts.expectedPhaseVersion !== undefined)
      message.expectedPhaseVersion = opts.expectedPhaseVersion;
    const ack = this.waitFor((m) => m.type === 'ack' && m.commandId === id);
    this.send(message);
    return (await ack) as Ack;
  }

  async ok(command: PlayerCommand): Promise<Ack> {
    const ack = await this.command(command);
    if (!ack.ok)
      throw new Error(
        `${this.name}: ${command.type} rejected: ${ack.error.code} ${ack.error.message}`,
      );
    return ack;
  }

  close(): void {
    this.ws.close();
  }

  async closedWith(timeoutMs = 10_000): Promise<{ code: number; reason: string }> {
    const deadline = Date.now() + timeoutMs;
    while (!this.closed && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    if (!this.closed) throw new Error(`${this.name}: socket did not close`);
    return this.closed;
  }
}

/** Creates a room with `n` connected players. clients[0] is the host. */
export async function room(
  n: number,
  settings: Record<string, unknown> = { beginner: false },
): Promise<Client[]> {
  const hostSeat = await createRoom('Host', 'fox', settings);
  const clients = [await Client.connect(hostSeat, 'Host')];
  for (let i = 2; i <= n; i++) {
    const seat = await joinRoom(hostSeat.roomCode, `Player ${i}`);
    clients.push(await Client.connect(seat, `Player ${i}`));
  }
  await Promise.all(clients.map((c) => c.until((v) => v.players.length === n)));
  return clients;
}

/** Everyone but the host readies, then the host starts. */
export async function startMatch(clients: Client[]): Promise<void> {
  await Promise.all(clients.slice(1).map((c) => c.ok({ type: 'setReady', ready: true })));
  await (clients[0] as Client).ok({ type: 'start' });
  await Promise.all(clients.map((c) => c.until((v) => v.phase === 'ROLE_REVEAL')));
}

export async function allReady(clients: Client[]): Promise<void> {
  const phaseVersion = clients[0]?.view?.phaseVersion ?? 0;
  await Promise.all(clients.map((c) => c.command({ type: 'setReady', ready: true })));
  await Promise.all(clients.map((c) => c.until((v) => v.phaseVersion > phaseVersion)));
}
