// Per-client request limits for room creation and joining (abuse and enumeration
// resistance). Keyed by a hash of the client IP; counters live in memory, which is
// enough for limiting: losing them on eviction only ever makes the limit looser
// for one window.
import { DurableObject } from 'cloudflare:workers';

export const LIMITS = {
  create: { max: 10, windowMs: 10 * 60 * 1000 },
  join: { max: 30, windowMs: 60 * 1000 },
  lookup: { max: 60, windowMs: 60 * 1000 },
} as const;
export type LimitKind = keyof typeof LIMITS;

export class RateLimiter extends DurableObject {
  private hits = new Map<string, number[]>();

  /** Records one attempt and returns whether it is within the limit. */
  allow(kind: LimitKind, client: string): boolean {
    const { max, windowMs } = LIMITS[kind];
    const now = Date.now();
    const key = `${kind}:${client}`;
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) {
      for (const [k, times] of this.hits)
        if (times.every((t) => now - t >= windowMs)) this.hits.delete(k);
    }
    return true;
  }
}
