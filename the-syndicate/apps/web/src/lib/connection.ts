// Client side of the room protocol. Keeps one socket open, reconnects with backoff,
// re-authenticates with the stored seat token, and turns each command into a
// promise that settles only when the server acknowledges it.
import type { PlayerCommand, PlayerView } from '@syndicate/game-engine';
import { CLOSE, PROTOCOL_VERSION, type ErrorBody, type ServerMessage } from '@syndicate/shared';

export type ConnectionStatus =
  | { kind: 'connecting' }
  | { kind: 'open' }
  | { kind: 'reconnecting'; attempt: number }
  | { kind: 'replaced' }
  | {
      kind: 'ended';
      code: 'UNAUTHORIZED' | 'KICKED' | 'ROOM_CLOSED' | 'UNSUPPORTED_VERSION';
      message: string;
    };

export interface Snapshot {
  status: ConnectionStatus;
  view: PlayerView | null;
  seq: number;
  /** serverTime - Date.now(), measured from the latest server message. */
  clockOffset: number;
  /** Ids of commands sent but not yet acknowledged. */
  pending: ReadonlySet<string>;
  lastError: ErrorBody | null;
}

export class CommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface Pending {
  message: string;
  resolve: () => void;
  reject: (err: CommandError) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

const ACK_TIMEOUT_MS = 12_000;
const HEARTBEAT_MS = 20_000;
const DEAD_AFTER_MS = 50_000;

function newCommandId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
}

export class RoomConnection {
  private ws: WebSocket | null = null;
  private snapshot: Snapshot = {
    status: { kind: 'connecting' },
    view: null,
    seq: 0,
    clockOffset: 0,
    pending: new Set(),
    lastError: null,
  };
  private listeners = new Set<() => void>();
  private pending = new Map<string, Pending>();
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private stopped = false;
  private onVisible = () => {
    if (document.visibilityState === 'visible') this.checkAlive(true);
  };
  private onOnline = () => this.checkAlive(true);

  constructor(
    private readonly roomCode: string,
    private readonly token: string,
  ) {}

  start(): void {
    this.stopped = false;
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('online', this.onOnline);
    this.open();
  }

  stop(): void {
    this.stopped = true;
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('online', this.onOnline);
    this.clearTimers();
    this.ws?.close(1000, 'leaving');
    this.ws = null;
    for (const [id, p] of this.pending) {
      p.reject(new CommandError('OFFLINE', 'Disconnected.'));
      this.pending.delete(id);
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  /** Take the seat back after it was opened in another tab. */
  reclaim(): void {
    this.attempt = 0;
    this.open();
  }

  /**
   * Sends a command. Resolves when the server acknowledges success; rejects with
   * the server's error otherwise. Commands are resent with the same id after a
   * reconnect, which the server deduplicates.
   */
  send(command: PlayerCommand, opts: { phaseBound?: boolean } = {}): Promise<void> {
    const commandId = newCommandId();
    const body: Record<string, unknown> = { v: PROTOCOL_VERSION, type: 'cmd', commandId, command };
    if (opts.phaseBound && this.snapshot.view)
      body.expectedPhaseVersion = this.snapshot.view.phaseVersion;
    const message = JSON.stringify(body);
    return new Promise<void>((resolve, reject) => {
      const entry: Pending = { message, resolve, reject, timer: null };
      this.pending.set(commandId, entry);
      this.armAckTimer(commandId, entry);
      this.update({ pending: new Set(this.pending.keys()) });
      if (this.ws?.readyState === WebSocket.OPEN && this.snapshot.status.kind === 'open')
        this.ws.send(message);
    });
  }

  private armAckTimer(id: string, entry: Pending): void {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      if (!this.pending.has(id)) return;
      this.pending.delete(id);
      this.update({ pending: new Set(this.pending.keys()) });
      entry.reject(
        new CommandError(
          'TIMEOUT',
          'The server did not confirm in time. Check the screen before trying again.',
        ),
      );
    }, ACK_TIMEOUT_MS);
  }

  private update(patch: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.retryTimer = null;
    this.heartbeat = null;
  }

  private open(): void {
    this.clearTimers();
    this.ws?.close();
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(
      `${scheme}://${location.host}/api/rooms/${encodeURIComponent(this.roomCode)}/ws`,
    );
    this.ws = ws;
    this.update({
      status:
        this.attempt === 0
          ? { kind: 'connecting' }
          : { kind: 'reconnecting', attempt: this.attempt },
    });
    ws.onopen = () => {
      this.lastMessageAt = Date.now();
      ws.send(
        JSON.stringify({
          v: PROTOCOL_VERSION,
          type: 'hello',
          token: this.token,
          lastSeq: this.snapshot.seq,
        }),
      );
    };
    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      this.lastMessageAt = Date.now();
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handle(message);
    };
    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      this.closed(event.code);
    };
    this.heartbeat = setInterval(() => this.checkAlive(false), HEARTBEAT_MS);
  }

  private checkAlive(urgent: boolean): void {
    if (
      this.stopped ||
      this.snapshot.status.kind === 'ended' ||
      this.snapshot.status.kind === 'replaced'
    )
      return;
    const ws = this.ws;
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      if (urgent) {
        this.attempt = Math.max(1, this.attempt);
        this.open();
      }
      return;
    }
    if (Date.now() - this.lastMessageAt > DEAD_AFTER_MS) {
      // A silently dead connection (sleep, network change): replace it.
      this.attempt += 1;
      this.open();
      return;
    }
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'ping', t: Date.now() }));
  }

  private handle(message: ServerMessage): void {
    if ('serverTime' in message) this.update({ clockOffset: message.serverTime - Date.now() });
    switch (message.type) {
      case 'welcome':
        this.attempt = 0;
        this.update({ status: { kind: 'open' }, lastError: null });
        // Resend anything unacknowledged; the server deduplicates by commandId.
        for (const [id, p] of this.pending) {
          this.armAckTimer(id, p);
          this.ws?.send(p.message);
        }
        return;
      case 'state':
        if (
          message.seq >= this.snapshot.seq ||
          this.snapshot.view === null ||
          message.view.matchIndex !== this.snapshot.view.matchIndex
        ) {
          this.update({ view: message.view, seq: message.seq });
        }
        return;
      case 'ack': {
        const p = this.pending.get(message.commandId);
        if (!p) return;
        if (p.timer) clearTimeout(p.timer);
        this.pending.delete(message.commandId);
        this.update({ pending: new Set(this.pending.keys()) });
        if (message.ok) p.resolve();
        else p.reject(new CommandError(message.error.code, message.error.message));
        return;
      }
      case 'error':
        this.update({ lastError: message.error });
        if (message.fatal) {
          const code = message.error.code;
          if (
            code === 'UNAUTHORIZED' ||
            code === 'KICKED' ||
            code === 'ROOM_CLOSED' ||
            code === 'UNSUPPORTED_VERSION'
          ) {
            this.update({ status: { kind: 'ended', code, message: message.error.message } });
          }
        }
        return;
      case 'pong':
        return;
    }
  }

  private closed(code: number): void {
    if (this.stopped) return;
    const ended = (c: 'UNAUTHORIZED' | 'KICKED' | 'ROOM_CLOSED', message: string) =>
      this.update({ status: { kind: 'ended', code: c, message } });
    if (code === CLOSE.REPLACED) return this.update({ status: { kind: 'replaced' } });
    if (code === CLOSE.UNAUTHORIZED)
      return ended('UNAUTHORIZED', 'Your seat in this room is no longer valid.');
    if (code === CLOSE.KICKED) return ended('KICKED', 'The host removed you from this room.');
    if (code === CLOSE.ROOM_CLOSED) return ended('ROOM_CLOSED', 'This room has closed.');
    if (this.snapshot.status.kind === 'ended') return;
    this.attempt += 1;
    const delay =
      Math.min(8000, 400 * 2 ** Math.min(this.attempt, 5)) * (0.75 + Math.random() * 0.5);
    this.update({ status: { kind: 'reconnecting', attempt: this.attempt } });
    this.retryTimer = setTimeout(() => this.open(), delay);
  }
}
