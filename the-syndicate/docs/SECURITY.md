# Threat model and security controls

Scope: THE SYNDICATE Worker (`apps/worker`), the room protocol (`packages/shared`), the rules
engine's secrecy boundary (`packages/game-engine/src/redact.ts`) and the web client
(`apps/web`). Assets: game integrity (fair outcomes, scores), players' secrets (credits, intel,
roles, objectives, sealed commitments), seat credentials, service availability.

Every row lists the automated test that exercises the control. `tests/security` runs against a
real local Worker (`pnpm test:security`); engine tests run in `pnpm test`.

| Threat | Control | Evidence |
| --- | --- | --- |
| Forged role, scoring or system events | Clients can send only the schema-listed player commands (strict Zod, unknown fields rejected). `tick`, `join`, `presence`, seeds and actor ids exist only server-side. Roles, scores and outcomes are computed only by the engine on the server. | security: *refuses system commands, seeds and extra fields* |
| Impersonating another seat | The seat is bound to the socket at `hello` by a 256-bit token (stored as SHA-256). Commands carry no actor field; a second `hello` with another token on the same socket is refused. | security: *acts only as the authenticated seat*; rooms: *rejects sockets without a valid seat token* |
| Guessable rooms, enumeration | Public codes are only an index: 6 characters from 31 (887M), collision-checked, released on close; the internal room id is an unguessable Durable Object id. Joins, lookups and socket opens are rate limited per client; joining mid-match is refused. | security: *rate limits room creation and joins* |
| Replaying a valid commitment | `(seat, commandId)` deduplication returns the original ack and never re-applies; a second commit for the round is refused by the engine. | security: *never applies a replayed commitment twice*; rooms: *duplicated commandId* |
| Late commitments | The room applies any passed deadline before judging a command; commitments outside `COMMITMENT` are refused; `expectedPhaseVersion` lets clients detect stale phases. | rooms: *refuses commands addressed to a phase that has ended, and late commitments* |
| Simultaneous commands, double spending | One Durable Object serializes a room's commands; credits are escrowed when sealed; engine invariants (credits in [0, 30], no double resolution, pool never overpaid) are property-tested over arbitrary command sequences and checked after every simulated command. | security: *serializes simultaneous intel purchases*; rooms: *resolves exactly once*; engine property tests; 10,000-match simulation (0 violations) |
| Viewing other players' private intel, roles, objectives | Each socket receives only `redactViewForPlayer(state, seat)`, built field by field from an allowlist. Abilities report results only to the players they name. Roles, objectives, ability uses, odds and the seed are released only at the final reckoning/results. | engine secrecy property tests (1.0.0 and 2.0.0); integration: *never sends it to anyone else*; e2e golden path inspects every socket frame |
| Inspecting network responses | Same as above: there is no hidden field to inspect. HTTP responses carry only the requester's own seat or public summaries. | e2e frame inspection; rooms: network-level checks |
| Chat spam, harassment | 12 messages/player/minute (engine) plus a 30-message token bucket per socket; profanity masking; host mute; host can switch to presets only; kick outside matches. | engine chat tests; security: *rate limits message floods* |
| XSS through names or chat | Names and chat are stored as plain text (control characters stripped, length-bounded) and rendered by React as text, never HTML. CSP `script-src 'self'`, `frame-ancestors 'none'`. | security: *stores HTML-looking nicknames as plain text*; smoke: CSP header |
| Resource exhaustion | Per-IP limits on create (10/10 min), join (30/min), lookup and socket opens (60/min); 2 KB request bodies, 8 KB socket messages; sockets must authenticate within 10 s; 10 invalid messages close a socket; idle rooms expire and delete their storage. | security: oversized/malformed input, auth timeout, rate limits; rooms: *expires idle rooms* |
| Duplicate tabs, sleep/wake, reconnects | One live socket per seat (newest wins, older gets a clear "opened elsewhere"); clients reconnect with backoff, detect dead sockets by heartbeat, resend unacknowledged commands with the same id (deduplicated); every state message is a full snapshot. | rooms: *reconnects the same seat … replaces the old one*; e2e: round-3 disconnect and same-seat restore |
| Cross-room actions | Tokens are looked up only in the room's own seat table; a token from another room is refused. | rooms: *isolates rooms* |
| Cross-site requests | `Origin` must match the site (or `ALLOWED_ORIGINS`) for API calls and socket upgrades; seat tokens are never cookies, so there is no ambient credential to ride. | security: *refuses API calls and sockets from foreign origins* |
| Expired or revoked credentials | Kicked or departed players' tokens are revoked; closed rooms delete their storage and answer "not found". | rooms: *kick … revokes its token*; security: *refuses the token of a player who left* |
| Host abuse | The host cannot see private information (no such endpoint or view field), can kick only outside matches, and cannot change rules mid-match. | engine tests: host commands; secrecy tests |
| Secrets in logs or errors | Error responses use fixed messages; the Worker logs only error class names; tokens are never logged or put in URLs. | code review; `apps/worker/src/index.ts` |
| Test-only endpoints in production | `/api/test/*` and the rate-limit identity header work only with `TEST_MODE=1`, which is `"0"` in `wrangler.jsonc` for every environment. | config; deploy runbook checks |

## Privacy

No accounts, emails, legal names, birthdates or locations are collected. Nicknames, avatars and
chat live only in the room's storage and are deleted when the room closes (at most 12 hours).
Rate limiting uses a hash of the client IP held in memory only. The browser stores the seat token
and the last nickname/avatar in `localStorage`.

## Remaining risks (prioritized)

1. **Rate-limit counters are in memory.** If a limiter object is evicted its window resets, which
   only makes limits looser for one window. Cloudflare's own DDoS protection sits in front.
2. **Profanity filter is a word list.** It catches common abuse and simple evasions but not
   everything; mute and preset-only chat are the fallback.
3. **A determined player can share their own secrets** (screenshots, voice chat). That is part of a
   social game, not a vulnerability.
4. **No independent penetration test** has been performed; all evidence above is automated tests
   written by the development team.
5. **Simultaneous play by one person in several seats** (multiple devices) cannot be prevented
   without accounts; private rooms with friends are the intended setting.
