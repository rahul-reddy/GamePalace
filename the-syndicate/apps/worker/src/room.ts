// One Durable Object per room: the single authority for that room's game.
//
// - State lives in this object's SQLite database and is written in the same
//   synchronous transaction as the command that changed it, so a restart,
//   deploy or hibernation never loses an acknowledged command.
// - Deadlines are Durable Object alarms (persisted), never in-memory timers.
// - Sockets use the hibernation API; a socket's identity survives hibernation in
//   its attachment. Players authenticate with a seat token sent in the first
//   message (never in the URL).
// - Every outbound state message is the recipient's own redacted view.
import { DurableObject } from 'cloudflare:workers';
import {
  applyCommand,
  createGame,
  deserialize,
  findPlayer,
  redactViewForPlayer,
  serialize,
  type Avatar,
  type CommandEnvelope,
  type GameState,
  type MatchSettings,
  type PlayerCommand,
} from '@syndicate/game-engine';
import {
  ClientMessage,
  CLOSE,
  PROTOCOL_VERSION,
  type ErrorBody,
  type RoomSummary,
  type SeatResponse,
  type ServerMessage,
} from '@syndicate/shared';
import { newPlayerId, newSeed, newToken, sha256 } from './crypto';
import type { Env } from './env';

interface Attachment {
  playerId: string | null;
  connectedAt: number;
}

interface Meta {
  code: string;
  createdAt: number;
  seq: number;
  lastActivity: number;
}

export type RoomResult<T> =
  { ok: true; value: T } | { ok: false; error: ErrorBody; status: number };

export const AUTH_TIMEOUT_MS = 10_000;
export const IDLE_EMPTY_MS = 30 * 60_000;
export const IDLE_ANY_MS = 2 * 60 * 60_000;
export const MAX_AGE_MS = 12 * 60 * 60_000;
const SWEEP_MS = 5 * 60_000;
const MAX_MESSAGE_CHARS = 8192;
const BUCKET_SIZE = 30;
const BUCKET_REFILL_PER_MS = 8 / 1000;
const MAX_BAD_MESSAGES = 10;
const COMMAND_LOG_LIMIT = 5000;

function send(ws: WebSocket, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // The socket is already closing; the close handler deals with presence.
  }
}

function errorMessage(code: string, message: string, fatal = false): ServerMessage {
  return { v: PROTOCOL_VERSION, type: 'error', error: { code, message }, fatal };
}

function engineFailure<T>(code: string, message: string): RoomResult<T> {
  const status = ['ROOM_FULL', 'NOT_ALLOWED_IN_PHASE', 'MATCH_IN_PROGRESS'].includes(code)
    ? 409
    : 400;
  return { ok: false, error: { code, message }, status };
}

export class Room extends DurableObject<Env> {
  private game: GameState | null = null;
  private meta: Meta | null = null;
  private buckets = new Map<WebSocket, { tokens: number; at: number }>();
  private badMessages = new Map<WebSocket, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.createSchema();
  }

  /** Idempotent; also re-run after deleteAll() so a closed room can answer "not found". */
  private createSchema(): void {
    const sql = this.ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS room (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      code TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      last_activity INTEGER NOT NULL,
      create_config TEXT NOT NULL,
      state TEXT NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS seats (
      player_id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS commands (
      player_id TEXT NOT NULL,
      command_id TEXT NOT NULL,
      at INTEGER NOT NULL,
      ack TEXT NOT NULL,
      PRIMARY KEY (player_id, command_id))`);
    sql.exec(`CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY,
      at INTEGER NOT NULL,
      envelope TEXT NOT NULL)`);
  }

  // ---- Loading and persistence ------------------------------------------------

  private load(): boolean {
    if (this.game && this.meta) return true;
    const row = this.ctx.storage.sql
      .exec<{
        code: string;
        created_at: number;
        seq: number;
        last_activity: number;
        state: string;
      }>('SELECT code, created_at, seq, last_activity, state FROM room WHERE id = 1')
      .toArray()[0];
    if (!row) return false;
    this.game = deserialize(row.state);
    this.meta = {
      code: row.code,
      createdAt: row.created_at,
      seq: row.seq,
      lastActivity: row.last_activity,
    };
    return true;
  }

  /** Persists `next` (and the command that produced it) atomically, then broadcasts. */
  private commit(
    next: GameState,
    event: CommandEnvelope | null,
    record?: { playerId: string; commandId: string; ack: ServerMessage },
  ): number {
    const meta = this.meta as Meta;
    const seq = meta.seq + 1;
    const now = Date.now();
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      sql.exec(
        'UPDATE room SET state = ?, seq = ?, last_activity = ? WHERE id = 1',
        serialize(next),
        seq,
        now,
      );
      if (event)
        sql.exec(
          'INSERT INTO events (seq, at, envelope) VALUES (?, ?, ?)',
          seq,
          now,
          JSON.stringify(event),
        );
      if (record) {
        const ack =
          record.ack.type === 'ack' && record.ack.ok ? { ...record.ack, seq } : record.ack;
        sql.exec(
          'INSERT OR REPLACE INTO commands (player_id, command_id, at, ack) VALUES (?, ?, ?, ?)',
          record.playerId,
          record.commandId,
          now,
          JSON.stringify(ack),
        );
      }
    });
    this.game = next;
    this.meta = { ...meta, seq, lastActivity: now };
    return seq;
  }

  private recordRejection(playerId: string, commandId: string, ack: ServerMessage): void {
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO commands (player_id, command_id, at, ack) VALUES (?, ?, ?, ?)',
      playerId,
      commandId,
      Date.now(),
      JSON.stringify(ack),
    );
  }

  private pruneCommandLog(): void {
    this.ctx.storage.sql.exec(
      'DELETE FROM commands WHERE rowid IN (SELECT rowid FROM commands ORDER BY at DESC LIMIT -1 OFFSET ?)',
      COMMAND_LOG_LIMIT,
    );
  }

  private sockets(): { ws: WebSocket; att: Attachment }[] {
    return this.ctx.getWebSockets().map((ws) => ({
      ws,
      att: (ws.deserializeAttachment() as Attachment | null) ?? { playerId: null, connectedAt: 0 },
    }));
  }

  private broadcast(): void {
    const game = this.game;
    const meta = this.meta;
    if (!game || !meta) return;
    const serverTime = Date.now();
    const cache = new Map<string, string>();
    for (const { ws, att } of this.sockets()) {
      if (!att.playerId || !findPlayer(game, att.playerId)) continue;
      let text = cache.get(att.playerId);
      if (!text) {
        const message: ServerMessage = {
          v: PROTOCOL_VERSION,
          type: 'state',
          seq: meta.seq,
          serverTime,
          view: redactViewForPlayer(game, att.playerId),
        };
        text = JSON.stringify(message);
        cache.set(att.playerId, text);
      }
      try {
        ws.send(text);
      } catch {
        // closing socket
      }
    }
  }

  private async scheduleAlarm(): Promise<void> {
    const game = this.game;
    if (!game) return;
    const now = Date.now();
    const candidates = [now + SWEEP_MS];
    if (game.phaseEndsAt !== null) candidates.push(game.phaseEndsAt);
    for (const { att } of this.sockets()) {
      if (!att.playerId) candidates.push(att.connectedAt + AUTH_TIMEOUT_MS);
    }
    await this.ctx.storage.setAlarm(Math.max(now + 10, Math.min(...candidates)));
  }

  /** Applies a server-originated command (presence, tick) and persists it if it changed anything. */
  private applySystem(command: CommandEnvelope['command'], now: number): boolean {
    const game = this.game as GameState;
    const env: CommandEnvelope = { actor: 'system', now, command };
    const result = applyCommand(game, env);
    if (!result.ok) return false;
    if (command.type === 'tick' && result.state.phaseVersion === game.phaseVersion) return false;
    if (command.type === 'presence' && serialize(result.state) === serialize(game)) return false;
    this.commit(result.state, env);
    return true;
  }

  // ---- RPC from the router ----------------------------------------------------

  async init(input: {
    code: string;
    name: string;
    avatar: Avatar;
    settings?: Partial<MatchSettings>;
  }): Promise<RoomResult<SeatResponse>> {
    if (this.load())
      return { ok: false, error: { code: 'ROOM_EXISTS', message: 'Room exists.' }, status: 409 };
    const now = Date.now();
    const playerId = newPlayerId();
    const token = newToken();
    const tokenHash = await sha256(token);
    const createConfig = {
      hostId: playerId,
      hostName: input.name,
      hostAvatar: input.avatar,
      now,
      settings: input.settings ?? {},
    };
    let game: GameState;
    try {
      game = createGame(createConfig, newSeed());
    } catch {
      return engineFailure('INVALID_COMMAND', 'Choose a different nickname.');
    }
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      sql.exec(
        'INSERT INTO room (id, code, created_at, seq, last_activity, create_config, state) VALUES (1, ?, ?, 0, ?, ?, ?)',
        input.code,
        now,
        now,
        JSON.stringify({ ...createConfig, seed: game.seed }),
        serialize(game),
      );
      sql.exec(
        'INSERT INTO seats (player_id, token_hash, created_at) VALUES (?, ?, ?)',
        playerId,
        tokenHash,
        now,
      );
    });
    this.game = game;
    this.meta = { code: input.code, createdAt: now, seq: 0, lastActivity: now };
    await this.scheduleAlarm();
    return { ok: true, value: { roomCode: input.code, playerId, token } };
  }

  async join(input: { name: string; avatar: Avatar }): Promise<RoomResult<SeatResponse>> {
    if (!this.load())
      return {
        ok: false,
        error: { code: 'ROOM_NOT_FOUND', message: 'No room with that code.' },
        status: 404,
      };
    const now = Date.now();
    this.applySystem({ type: 'tick' }, now);
    const game = this.game as GameState;
    const playerId = newPlayerId();
    const token = newToken();
    const tokenHash = await sha256(token);
    const env: CommandEnvelope = {
      actor: 'system',
      now,
      command: { type: 'join', playerId, name: input.name, avatar: input.avatar },
    };
    const result = applyCommand(game, env);
    if (!result.ok) {
      if (result.error.code === 'NOT_ALLOWED_IN_PHASE') {
        return engineFailure(
          'MATCH_IN_PROGRESS',
          'This match has already started. Ask the host for the next one.',
        );
      }
      return engineFailure(result.error.code, result.error.message);
    }
    this.ctx.storage.sql.exec(
      'INSERT INTO seats (player_id, token_hash, created_at) VALUES (?, ?, ?)',
      playerId,
      tokenHash,
      now,
    );
    this.commit(result.state, env);
    this.broadcast();
    await this.scheduleAlarm();
    return { ok: true, value: { roomCode: (this.meta as Meta).code, playerId, token } };
  }

  async summary(): Promise<RoomSummary | null> {
    if (!this.load()) return null;
    const game = this.game as GameState;
    const max = 12;
    return {
      roomCode: (this.meta as Meta).code,
      phase: game.phase,
      players: game.players.length,
      maxPlayers: max,
      joinable: (game.phase === 'LOBBY' || game.phase === 'RESULTS') && game.players.length < max,
    };
  }

  /** Test mode only: lets the current phase deadline pass immediately. */
  async testExpire(): Promise<string | null> {
    if (this.env.TEST_MODE !== '1' || !this.load()) return null;
    const game = this.game as GameState;
    if (game.phaseEndsAt !== null) {
      this.applySystem({ type: 'tick' }, Math.max(Date.now(), game.phaseEndsAt));
      this.broadcast();
      await this.scheduleAlarm();
    }
    return (this.game as GameState).phase;
  }

  /** Test mode only: the replay log, to prove persistence and determinism. */
  async testReplayLog(): Promise<{
    create: unknown;
    commands: CommandEnvelope[];
    state: string;
  } | null> {
    if (this.env.TEST_MODE !== '1' || !this.load()) return null;
    const row = this.ctx.storage.sql
      .exec<{ create_config: string }>('SELECT create_config FROM room WHERE id = 1')
      .one();
    const commands = this.ctx.storage.sql
      .exec<{ envelope: string }>('SELECT envelope FROM events ORDER BY seq')
      .toArray()
      .map((r) => JSON.parse(r.envelope) as CommandEnvelope);
    return {
      create: JSON.parse(row.create_config),
      commands,
      state: serialize(this.game as GameState),
    };
  }

  // ---- Sockets ------------------------------------------------------------------

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    if (!this.load()) return new Response('Room not found', { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    const att: Attachment = { playerId: null, connectedAt: Date.now() };
    server.serializeAttachment(att);
    await this.scheduleAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  private allowMessage(ws: WebSocket): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(ws) ?? { tokens: BUCKET_SIZE, at: now };
    bucket.tokens = Math.min(BUCKET_SIZE, bucket.tokens + (now - bucket.at) * BUCKET_REFILL_PER_MS);
    bucket.at = now;
    this.buckets.set(ws, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  private badMessage(ws: WebSocket, message: string): void {
    const count = (this.badMessages.get(ws) ?? 0) + 1;
    this.badMessages.set(ws, count);
    send(ws, errorMessage('BAD_MESSAGE', message, count >= MAX_BAD_MESSAGES));
    if (count >= MAX_BAD_MESSAGES) ws.close(CLOSE.BAD_MESSAGE, 'too many invalid messages');
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (!this.load()) {
      send(ws, errorMessage('ROOM_CLOSED', 'This room has closed.', true));
      ws.close(CLOSE.ROOM_CLOSED, 'room closed');
      return;
    }
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_CHARS)
      return this.badMessage(ws, 'Message too large or not text.');
    if (!this.allowMessage(ws)) {
      send(ws, errorMessage('RATE_LIMITED', 'Too many messages. Slow down.'));
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return this.badMessage(ws, 'Message is not JSON.');
    }
    if (typeof data === 'object' && data !== null && 'v' in data && data.v !== PROTOCOL_VERSION) {
      send(
        ws,
        errorMessage('UNSUPPORTED_VERSION', 'Please reload the page to update the game.', true),
      );
      ws.close(CLOSE.BAD_MESSAGE, 'unsupported protocol version');
      return;
    }
    const parsed = ClientMessage.safeParse(data);
    if (!parsed.success) return this.badMessage(ws, 'Message failed validation.');
    const message = parsed.data;
    const att = (ws.deserializeAttachment() as Attachment | null) ?? {
      playerId: null,
      connectedAt: 0,
    };
    switch (message.type) {
      case 'ping':
        send(ws, { v: PROTOCOL_VERSION, type: 'pong', t: message.t, serverTime: Date.now() });
        return;
      case 'hello':
        return this.hello(ws, att, message.token);
      case 'cmd':
        if (!att.playerId) {
          send(ws, errorMessage('UNAUTHORIZED', 'Say hello with your seat token first.'));
          return;
        }
        return this.command(
          ws,
          att.playerId,
          message.commandId,
          message.command,
          message.expectedPhaseVersion,
        );
    }
  }

  private async hello(ws: WebSocket, att: Attachment, token: string): Promise<void> {
    const tokenHash = await sha256(token);
    const row = this.ctx.storage.sql
      .exec<{ player_id: string }>(
        'SELECT player_id FROM seats WHERE token_hash = ? AND revoked = 0',
        tokenHash,
      )
      .toArray()[0];
    const game = this.game as GameState;
    if (!row || !findPlayer(game, row.player_id)) {
      send(ws, errorMessage('UNAUTHORIZED', 'This seat is not valid in this room.', true));
      ws.close(CLOSE.UNAUTHORIZED, 'unauthorized');
      return;
    }
    const playerId = row.player_id;
    if (att.playerId && att.playerId !== playerId) {
      send(
        ws,
        errorMessage('UNAUTHORIZED', 'This connection already belongs to another seat.', true),
      );
      ws.close(CLOSE.UNAUTHORIZED, 'unauthorized');
      return;
    }
    ws.serializeAttachment({ playerId, connectedAt: att.connectedAt } satisfies Attachment);
    // One live connection per seat: a newer tab or device replaces the older one.
    for (const other of this.sockets()) {
      if (other.ws !== ws && other.att.playerId === playerId) {
        send(other.ws, errorMessage('REPLACED', 'You opened this seat somewhere else.', true));
        other.ws.serializeAttachment({
          playerId: null,
          connectedAt: other.att.connectedAt,
        } satisfies Attachment);
        other.ws.close(CLOSE.REPLACED, 'replaced');
      }
    }
    const meta = this.meta as Meta;
    send(ws, {
      v: PROTOCOL_VERSION,
      type: 'welcome',
      playerId,
      roomCode: meta.code,
      serverTime: Date.now(),
    });
    const ticked = this.applySystem({ type: 'tick' }, Date.now());
    const arrived = this.applySystem({ type: 'presence', playerId, connected: true }, Date.now());
    if (ticked || arrived) {
      this.broadcast();
    } else {
      const view = redactViewForPlayer(this.game as GameState, playerId);
      send(ws, {
        v: PROTOCOL_VERSION,
        type: 'state',
        seq: (this.meta as Meta).seq,
        serverTime: Date.now(),
        view,
      });
    }
    await this.scheduleAlarm();
  }

  private async command(
    ws: WebSocket,
    playerId: string,
    commandId: string,
    command: PlayerCommand,
    expectedPhaseVersion: number | undefined,
  ): Promise<void> {
    // Idempotency: a repeated commandId gets the original answer and is not re-applied.
    const previous = this.ctx.storage.sql
      .exec<{ ack: string }>(
        'SELECT ack FROM commands WHERE player_id = ? AND command_id = ?',
        playerId,
        commandId,
      )
      .toArray()[0];
    if (previous) {
      const ack = JSON.parse(previous.ack) as ServerMessage;
      send(ws, ack.type === 'ack' && ack.ok ? { ...ack, duplicate: true } : ack);
      return;
    }
    const now = Date.now();
    // Process any deadline that has passed first, so a command that arrives late
    // is judged against the phase the server is really in.
    if (this.applySystem({ type: 'tick' }, now)) this.broadcast();
    const game = this.game as GameState;
    if (expectedPhaseVersion !== undefined && expectedPhaseVersion !== game.phaseVersion) {
      const ack: ServerMessage = {
        v: PROTOCOL_VERSION,
        type: 'ack',
        commandId,
        ok: false,
        error: { code: 'STALE_PHASE', message: 'That phase has ended.' },
      };
      this.recordRejection(playerId, commandId, ack);
      send(ws, ack);
      return;
    }
    const env: CommandEnvelope = { actor: playerId, now, command };
    if (command.type === 'start') env.seed = newSeed();
    const result = applyCommand(game, env);
    if (!result.ok) {
      const ack: ServerMessage = {
        v: PROTOCOL_VERSION,
        type: 'ack',
        commandId,
        ok: false,
        error: result.error,
      };
      this.recordRejection(playerId, commandId, ack);
      send(ws, ack);
      return;
    }
    const removed = game.players.filter((p) => !findPlayer(result.state, p.id)).map((p) => p.id);
    const ack: ServerMessage = { v: PROTOCOL_VERSION, type: 'ack', commandId, ok: true, seq: 0 };
    const seq = this.commit(result.state, env, { playerId, commandId, ack });
    // Acknowledge before closing anything, so a player who leaves still hears "done".
    send(ws, { ...ack, seq });
    if (removed.length) this.revokeSeats(removed, command.type === 'kick');
    this.broadcast();
    if ((this.meta as Meta).seq % 200 === 0) this.pruneCommandLog();
    await this.scheduleAlarm();
  }

  private revokeSeats(playerIds: string[], kicked: boolean): void {
    for (const id of playerIds) {
      this.ctx.storage.sql.exec('UPDATE seats SET revoked = 1 WHERE player_id = ?', id);
      for (const { ws, att } of this.sockets()) {
        if (att.playerId !== id) continue;
        ws.serializeAttachment({
          playerId: null,
          connectedAt: att.connectedAt,
        } satisfies Attachment);
        if (kicked) send(ws, errorMessage('KICKED', 'The host removed you from this room.', true));
        ws.close(kicked ? CLOSE.KICKED : 1000, kicked ? 'kicked' : 'left');
      }
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.gone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.gone(ws);
  }

  private async gone(ws: WebSocket): Promise<void> {
    this.buckets.delete(ws);
    this.badMessages.delete(ws);
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att?.playerId || !this.load()) return;
    const stillHere = this.sockets().some(
      (s) => s.ws !== ws && s.att.playerId === att.playerId && s.ws.readyState === WebSocket.OPEN,
    );
    if (stillHere) return;
    if (
      this.applySystem({ type: 'presence', playerId: att.playerId, connected: false }, Date.now())
    ) {
      this.broadcast();
      await this.scheduleAlarm();
    }
  }

  // ---- Alarms: deadlines, authentication timeouts and expiry --------------------

  override async alarm(): Promise<void> {
    if (!this.load()) return;
    const now = Date.now();
    for (const { ws, att } of this.sockets()) {
      if (!att.playerId && now - att.connectedAt >= AUTH_TIMEOUT_MS) {
        send(ws, errorMessage('UNAUTHORIZED', 'No seat token received.', true));
        ws.close(CLOSE.AUTH_TIMEOUT, 'authentication timeout');
      }
    }
    if (this.expired(now)) {
      await this.destroy();
      return;
    }
    if (this.applySystem({ type: 'tick' }, now)) this.broadcast();
    await this.scheduleAlarm();
  }

  private expired(now: number): boolean {
    const game = this.game as GameState;
    const meta = this.meta as Meta;
    if (now - meta.createdAt >= MAX_AGE_MS) return true;
    if (now - meta.lastActivity >= IDLE_ANY_MS) return true;
    const someoneHere = this.sockets().some((s) => s.att.playerId !== null);
    const between = game.phase === 'LOBBY' || game.phase === 'RESULTS';
    return between && !someoneHere && now - meta.lastActivity >= IDLE_EMPTY_MS;
  }

  private async destroy(): Promise<void> {
    const meta = this.meta as Meta;
    for (const { ws } of this.sockets()) {
      send(
        ws,
        errorMessage('ROOM_CLOSED', 'This room has closed after a period of inactivity.', true),
      );
      ws.close(CLOSE.ROOM_CLOSED, 'room closed');
    }
    const directory = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName(`dir:${meta.code[0]}`));
    await directory.release(meta.code, this.ctx.id.toString());
    await this.ctx.storage.deleteAll();
    this.game = null;
    this.meta = null;
    this.createSchema();
  }

  /** Test mode only: run the expiry sweep as if `ms` had passed. */
  async testAge(ms: number): Promise<boolean> {
    if (this.env.TEST_MODE !== '1' || !this.load()) return false;
    const meta = this.meta as Meta;
    this.meta = { ...meta, createdAt: meta.createdAt - ms, lastActivity: meta.lastActivity - ms };
    if (this.expired(Date.now())) {
      await this.destroy();
      return true;
    }
    this.meta = meta;
    return false;
  }
}
