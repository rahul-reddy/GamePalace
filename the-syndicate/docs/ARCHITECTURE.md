# Architecture

```text
 Browser (React SPA)                     Cloudflare edge
 ───────────────────                     ─────────────────────────────────────────────
  landing / lobby / match UI   ──HTTPS──▶ Worker (apps/worker/src/index.ts)
   │  seat token in                        │  /api/health, /api/ws-probe
   │  localStorage (per room)              │  POST /api/rooms ──────▶ RoomDirectory DO (shard = code[0])
   │                                       │                          code ─▶ unguessable room id
   └──── WebSocket /api/rooms/:code/ws ───▶│  /api/rooms/:code/... ─▶ Room DO (one per room)
                                           │                          SQLite: state, seats, commands, events
                                           │                          alarms: deadlines, auth timeout, expiry
                                           └  RateLimiter DO (shard = hash(ip)[0..2])
 Static assets (Vite build) are served by the platform from the same origin.
```

## Packages

| Package | Responsibility | May depend on |
| --- | --- | --- |
| `packages/game-engine` | All rules. Pure functions of (state, command, time, seed). Redaction. Replay. Invariants. | nothing at runtime |
| `packages/shared` | Wire protocol: Zod schemas for every inbound message, server message types, close codes. | engine (types, constants) |
| `packages/test-bots` | Bot strategies, match simulator, balance statistics. | engine |
| `packages/ui` | Design tokens and shared presentational components. | React |
| `apps/worker` | HTTP routing, Durable Objects, persistence, sockets, rate limits. | engine, shared |
| `apps/web` | The client. Renders `PlayerView`s and sends commands. Holds no rules. | engine (types, presets), shared, ui |

## Authority

The Room Durable Object is the only writer of a room's state. A single DO instance
processes one event at a time, so commands are serialized without locks.

For every inbound command the room:

1. parses the message with the shared Zod schema (anything else is `BAD_MESSAGE`);
2. maps the socket to its seat from the socket attachment (set when a valid token was presented);
3. replays the stored acknowledgement if this `(seat, commandId)` was seen before (idempotency);
4. runs `tick(now)` so any passed deadline is applied before judging the command;
5. refuses it with `STALE_PHASE` if it carries an `expectedPhaseVersion` from an earlier phase;
6. applies it with the engine; server-only inputs (time, a fresh secret seed for `start`) are
   added by the server, never taken from the client;
7. writes the new state, the command record and the event log in one SQLite transaction;
8. acknowledges the sender, then sends every connected player their own redacted view.

## Persistence and recovery

- `room` row: serialized `GameState`, sequence number, timestamps, the original create config.
- `seats`: player id and SHA-256 of the seat token (the token itself is never stored).
- `commands`: last 5,000 acknowledgements by `(player, commandId)` for deduplication.
- `events`: every accepted engine command in order, so the match can be replayed exactly
  (`replay()` in the engine; tested against the live server in `tests/integration`).
- State is loaded lazily from SQLite whenever the object starts (after hibernation, eviction,
  deploy or restart). Sockets survive hibernation; their seat lives in the socket attachment.
- Deadlines are Durable Object alarms set to the earliest of: the phase deadline, an
  unauthenticated socket's 10-second limit, and a 5-minute sweep. No game logic depends on
  `setTimeout`. A late alarm advances one phase, never several.

## Room lifecycle

- **Codes:** 6 characters from a 31-character alphabet without look-alikes (~887 million codes).
  Random, collision-checked in the directory shard, reserved for the room's maximum lifetime
  (12 hours) and released when the room closes. The internal room id is a random Durable
  Object id that is never shown to clients.
- **Expiry:** a room closes when it is 12 hours old, after 2 hours without any command, or after
  30 minutes in the lobby/results with nobody connected. Closing tells connected sockets
  (`ROOM_CLOSED`), releases the code and deletes the room's storage.

## Time

The engine never reads a clock: the server passes `now` (its own `Date.now()`). Clients get
`serverTime` with every state message and compute their countdown from the offset, so a wrong
device clock only affects the countdown display, never the game.
