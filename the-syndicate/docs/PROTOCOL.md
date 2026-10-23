# Wire protocol (version 1)

Schemas: `packages/shared/src/protocol.ts`. Every client message carries `v: 1`; a different
version gets a fatal `UNSUPPORTED_VERSION` error ("reload the page").

## HTTP

| Method and path | Body | Success | Errors |
| --- | --- | --- | --- |
| `GET /api/health` | - | `200 { ok, service, protocol, rules, time }` | - |
| `POST /api/rooms` | `{ name, avatar, settings? }` | `201 { roomCode, playerId, token }` | 400, 403, 429 |
| `GET /api/rooms/:code` | - | `200 { roomCode, phase, players, maxPlayers, joinable }` | 404, 429 |
| `POST /api/rooms/:code/join` | `{ name, avatar }` | `201 { roomCode, playerId, token }` | 400, 404, 409 (`ROOM_FULL`, `MATCH_IN_PROGRESS`), 429 |
| `GET /api/rooms/:code/ws` | WebSocket upgrade | `101` | 403, 404, 429 |
| `GET /api/ws-probe` | WebSocket upgrade | `101`, one `probe` message | 426 |

Errors are always `{ "error": { "code": string, "message": string } }`. Messages are written for
players and never contain internal details. Request bodies over 2 KB are refused.

The **token** is the seat credential. The client stores it in `localStorage` under the room code
and sends it only inside the WebSocket `hello` message. It is never part of a URL, invite link or
log line. The server stores only its SHA-256.

Requests with an `Origin` header must come from the same origin (or one listed in
`ALLOWED_ORIGINS`). Browsers always send `Origin` on WebSocket upgrades and cross-site POSTs.

## Socket: client to server

```jsonc
{ "v": 1, "type": "hello", "token": "<seat token>", "lastSeq": 41 }   // first message, within 10 s
{ "v": 1, "type": "cmd", "commandId": "<8-64 chars [A-Za-z0-9_-]>", "expectedPhaseVersion": 12, "command": { ... } }
{ "v": 1, "type": "ping", "t": 1712345678 }
```

`command` is one of: `setReady`, `updateSettings`, `start`, `kick`, `mute`, `leave`, `buyIntel`,
`commit`, `proposeDeal`, `respondDeal`, `chat`, `rematch` (strict schemas; unknown fields are
rejected). Clients cannot send `tick`, `join`, `presence`, seeds or actor ids.

- **`commandId`** makes a command idempotent: the same id from the same seat is applied once;
  repeats get the original acknowledgement with `duplicate: true`.
- **`expectedPhaseVersion`** (optional, sent by the client for phase-specific actions) makes the
  server refuse the command with `STALE_PHASE` if the phase has moved on since the client looked.

## Socket: server to client

```jsonc
{ "v": 1, "type": "welcome", "playerId": "p_...", "roomCode": "K7QF2M", "serverTime": 0 }
{ "v": 1, "type": "state", "seq": 42, "serverTime": 0, "view": { /* PlayerView */ } }
{ "v": 1, "type": "ack", "commandId": "...", "ok": true, "seq": 42, "duplicate": true }
{ "v": 1, "type": "ack", "commandId": "...", "ok": false, "error": { "code": "INSUFFICIENT_CREDITS", "message": "..." } }
{ "v": 1, "type": "error", "error": { "code": "RATE_LIMITED", "message": "..." }, "fatal": false }
{ "v": 1, "type": "pong", "t": 1712345678, "serverTime": 0 }
```

- `seq` is a server-generated sequence number that increases with every state change. A `state`
  message always carries the recipient's complete redacted view, so a client that missed
  messages (sleep, network loss) is fully resynchronized by the next one. On reconnect the
  server sends a fresh snapshot right after `welcome`.
- The client must treat a command as done only after its `ack` with `ok: true`.

## Close codes

| Code | Meaning | Client should |
| ---: | --- | --- |
| 4000 | No `hello` within 10 seconds | Reconnect |
| 4001 | This seat was opened in another tab or device | Show "opened elsewhere", offer to take it back |
| 4003 | Token invalid, revoked or for another room | Forget the token, return to join |
| 4004 | Kicked by the host | Forget the token, explain |
| 4010 | Room closed (expired) | Forget the token, explain |
| 4029 | Rate limited | Back off and reconnect |
| 4400 | Too many invalid messages | Reload |

## Limits

- 8,192 characters per socket message; a token bucket of 30 messages refilling 8 per second per
  socket; 10 invalid messages close the socket.
- Per client IP: 10 room creations per 10 minutes, 30 joins per minute, 60 lookups or socket
  opens per minute.
- Chat: 12 messages per player per minute (engine rule).
