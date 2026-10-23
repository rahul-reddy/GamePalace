// Edge router. Static assets are served directly by the platform; only /api/* runs here.
import { CURRENT_RULES_VERSION } from '@syndicate/game-engine';
import { PROTOCOL_VERSION, type HealthResponse } from '@syndicate/shared';
import { isAllowedOrigin, json, withSecurityHeaders } from './http';

export interface Env {
  ASSETS: Fetcher;
  ALLOWED_ORIGINS: string;
  TEST_MODE: string;
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') {
    const body: HealthResponse = {
      ok: true,
      service: 'the-syndicate',
      protocol: PROTOCOL_VERSION,
      rules: CURRENT_RULES_VERSION,
      time: Date.now(),
    };
    return json(body);
  }
  if (!isAllowedOrigin(request, env.ALLOWED_ORIGINS)) {
    return json({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Origin not allowed.' } }, 403);
  }
  if (url.pathname === '/api/ws-probe') return probeSocket(request);
  if (url.pathname.startsWith('/api/')) {
    return json({ error: { code: 'NOT_FOUND', message: 'Unknown endpoint.' } }, 404);
  }
  return env.ASSETS.fetch(request);
}

/** Connectivity check: proves WebSockets reach this Worker from the visitor's network. */
function probeSocket(request: Request): Response {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return json({ error: { code: 'BAD_REQUEST', message: 'Expected a WebSocket upgrade.' } }, 426);
  }
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
  server.accept();
  server.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'probe', serverTime: Date.now() }));
  server.addEventListener('message', () => server.close(1000, 'probe complete'));
  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return withSecurityHeaders(await route(request, env));
    } catch (err) {
      console.error('unhandled', err instanceof Error ? err.message : 'unknown');
      return withSecurityHeaders(
        json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong.' } }, 500),
      );
    }
  },
} satisfies ExportedHandler<Env>;
