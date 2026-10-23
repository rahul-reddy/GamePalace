import { CURRENT_RULES_VERSION } from '@syndicate/game-engine';
import { describe, expect, it } from 'vitest';

const BASE = process.env.SYNDICATE_BASE_URL ?? 'http://127.0.0.1:8791';

describe('worker basics (real workerd)', () => {
  it('reports health with protocol and rules versions', async () => {
    const r = await fetch(`${BASE}/api/health`);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      service: 'the-syndicate',
      protocol: 1,
      rules: CURRENT_RULES_VERSION,
    });
  });

  it('completes a WebSocket handshake', async () => {
    const ws = new WebSocket(`${BASE.replace('http', 'ws')}/api/ws-probe`);
    const first = await new Promise<string>((resolve, reject) => {
      ws.onmessage = (e) => resolve(String(e.data));
      ws.onerror = () => reject(new Error('socket error'));
    });
    expect(JSON.parse(first)).toMatchObject({ v: 1, type: 'probe' });
    ws.close();
  });

  it('refuses cross-origin API calls and unknown endpoints', async () => {
    const evil = await fetch(`${BASE}/api/ws-probe`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(evil.status).toBe(403);
    const missing = await fetch(`${BASE}/api/nope`);
    expect(missing.status).toBe(404);
    const notUpgrade = await fetch(`${BASE}/api/ws-probe`);
    expect(notUpgrade.status).toBe(426);
  });

  it('serves the app shell with security headers for client routes', async () => {
    const r = await fetch(`${BASE}/room/ABC234`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/html');
    expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
