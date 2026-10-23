// Maps short public room codes to unguessable internal room ids. Sharded by the
// code's first character, so each shard is a small SQLite table.
import { DurableObject } from 'cloudflare:workers';

/** Codes are reserved for a room's maximum lifetime and released when it closes. */
export const CODE_TTL_MS = 12 * 60 * 60 * 1000;

export class RoomDirectory extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, room_id TEXT NOT NULL, expires_at INTEGER NOT NULL)',
    );
  }

  /** Reserves `code` for `roomId`. Returns false when the code is in use (collision). */
  claim(code: string, roomId: string): boolean {
    const now = Date.now();
    const existing = this.ctx.storage.sql
      .exec<{ expires_at: number }>('SELECT expires_at FROM codes WHERE code = ?', code)
      .toArray()[0];
    if (existing && existing.expires_at > now) return false;
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO codes (code, room_id, expires_at) VALUES (?, ?, ?)',
      code,
      roomId,
      now + CODE_TTL_MS,
    );
    return true;
  }

  resolve(code: string): string | null {
    const row = this.ctx.storage.sql
      .exec<{ room_id: string; expires_at: number }>(
        'SELECT room_id, expires_at FROM codes WHERE code = ?',
        code,
      )
      .toArray()[0];
    if (!row || row.expires_at <= Date.now()) return null;
    return row.room_id;
  }

  release(code: string, roomId: string): void {
    this.ctx.storage.sql.exec('DELETE FROM codes WHERE code = ? AND room_id = ?', code, roomId);
    this.ctx.storage.sql.exec('DELETE FROM codes WHERE expires_at <= ?', Date.now());
  }
}
