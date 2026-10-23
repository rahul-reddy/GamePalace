// Edge router. Static assets are served by the platform; only /api/* runs here.
import { CURRENT_RULES_VERSION } from '@syndicate/game-engine';
import {
  CreateRoomRequest,
  JoinRoomRequest,
  PROTOCOL_VERSION,
  RoomCode,
  type HealthResponse,
} from '@syndicate/shared';
import { newRoomCode, sha256 } from './crypto';
import type { Env } from './env';
import { isAllowedOrigin, json, withSecurityHeaders } from './http';
import type { LimitKind } from './limiter';

export { RoomDirectory } from './directory';
export { RateLimiter } from './limiter';
export { Room } from './room';
export type { Env };

const MAX_BODY_BYTES = 2048;

function apiError(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error('too large');
  return JSON.parse(text);
}

async function limited(env: Env, request: Request, kind: LimitKind): Promise<boolean> {
  // Test suites simulate many clients from one machine; only TEST_MODE honours this header.
  const testClient = env.TEST_MODE === '1' ? request.headers.get('x-syndicate-test-client') : null;
  const ip = testClient ?? request.headers.get('CF-Connecting-IP') ?? 'local';
  const client = await sha256(`syndicate-limit:${ip}`);
  const stub = env.LIMITER.get(env.LIMITER.idFromName(`lim:${client.slice(0, 2)}`));
  return !(await stub.allow(kind, client));
}

function directoryFor(env: Env, code: string) {
  return env.DIRECTORY.get(env.DIRECTORY.idFromName(`dir:${code[0]}`));
}

async function roomFor(env: Env, code: string) {
  const roomId = await directoryFor(env, code).resolve(code);
  return roomId ? env.ROOMS.get(env.ROOMS.idFromString(roomId)) : null;
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  if (await limited(env, request, 'create')) {
    return apiError(429, 'RATE_LIMITED', 'Too many new rooms. Try again in a few minutes.');
  }
  const body = CreateRoomRequest.safeParse(await readJson(request).catch(() => null));
  if (!body.success) return apiError(400, 'BAD_REQUEST', 'Choose a nickname and an avatar.');
  // The internal id is unguessable; the short public code is only an index into the directory.
  const roomId = env.ROOMS.newUniqueId();
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = newRoomCode();
    if (!(await directoryFor(env, code).claim(code, roomId.toString()))) continue;
    const result = await env.ROOMS.get(roomId).init({ code, ...body.data });
    if (!result.ok) {
      await directoryFor(env, code).release(code, roomId.toString());
      return apiError(result.status, result.error.code, result.error.message);
    }
    return json(result.value, 201);
  }
  return apiError(503, 'TRY_AGAIN', 'Could not allocate a room code. Please try again.');
}

async function joinRoom(request: Request, env: Env, code: string): Promise<Response> {
  if (await limited(env, request, 'join'))
    return apiError(429, 'RATE_LIMITED', 'Too many attempts. Wait a minute.');
  const body = JoinRoomRequest.safeParse(await readJson(request).catch(() => null));
  if (!body.success) return apiError(400, 'BAD_REQUEST', 'Choose a nickname and an avatar.');
  const room = await roomFor(env, code);
  if (!room)
    return apiError(
      404,
      'ROOM_NOT_FOUND',
      'No room with that code. Check the code with your host.',
    );
  const result = await room.join(body.data);
  return result.ok
    ? json(result.value, 201)
    : apiError(result.status, result.error.code, result.error.message);
}

async function testRoute(
  request: Request,
  env: Env,
  code: string,
  action: string,
): Promise<Response> {
  const room = await roomFor(env, code.toUpperCase());
  if (!room) return apiError(404, 'ROOM_NOT_FOUND', 'No such room.');
  if (action === 'expire') return json({ phase: await room.testExpire() });
  if (action === 'age') {
    const ms = Number(new URL(request.url).searchParams.get('ms') ?? '0');
    return json({ destroyed: await room.testAge(ms) });
  }
  return json(await room.testReplayLog());
}

async function route(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/api/health') {
    const body: HealthResponse = {
      ok: true,
      service: 'the-syndicate',
      protocol: PROTOCOL_VERSION,
      rules: CURRENT_RULES_VERSION,
      revision: env.REVISION || 'dev',
      time: Date.now(),
    };
    return json(body);
  }
  if (!isAllowedOrigin(request, env.ALLOWED_ORIGINS)) {
    return apiError(403, 'FORBIDDEN_ORIGIN', 'Origin not allowed.');
  }
  if (path === '/api/ws-probe') return probeSocket(request);
  if (path === '/api/rooms' && request.method === 'POST') return createRoom(request, env);
  const testMatch = /^\/api\/test\/rooms\/([^/]+)\/(expire|replay|age)$/.exec(path);
  if (testMatch && env.TEST_MODE === '1' && request.method === 'POST') {
    return testRoute(request, env, testMatch[1] ?? '', testMatch[2] ?? '');
  }
  const match = /^\/api\/rooms\/([^/]+)(\/join|\/ws)?$/.exec(path);
  if (!match) return apiError(404, 'NOT_FOUND', 'Unknown endpoint.');
  const code = RoomCode.safeParse(decodeURIComponent(match[1] ?? ''));
  if (!code.success) {
    return apiError(
      404,
      'ROOM_NOT_FOUND',
      'No room with that code. Check the code with your host.',
    );
  }
  const action = match[2];
  if (action === '/join' && request.method === 'POST') return joinRoom(request, env, code.data);
  if (request.method !== 'GET') return apiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  if (await limited(env, request, 'lookup'))
    return apiError(429, 'RATE_LIMITED', 'Too many attempts. Wait a minute.');
  const room = await roomFor(env, code.data);
  if (action === '/ws') {
    if (!room) return apiError(404, 'ROOM_NOT_FOUND', 'This room has closed or never existed.');
    return room.fetch(request);
  }
  const summary = room ? await room.summary() : null;
  return summary
    ? json(summary)
    : apiError(404, 'ROOM_NOT_FOUND', 'No room with that code. Check the code with your host.');
}

/** Connectivity check: proves WebSockets reach this Worker from the visitor's network. */
function probeSocket(request: Request): Response {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return apiError(426, 'BAD_REQUEST', 'Expected a WebSocket upgrade.');
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
      // Never echo internals to the client; log only the error class.
      console.error('unhandled', err instanceof Error ? err.name : 'unknown');
      return withSecurityHeaders(
        apiError(500, 'SERVER_ERROR', 'Something went wrong. Please try again.'),
      );
    }
  },
} satisfies ExportedHandler<Env>;
