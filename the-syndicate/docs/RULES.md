# THE SYNDICATE: rules specification

Rules version **1.0.0** (`config/rules-1.0.0.json`). This is the symmetric baseline used for the
first playable slice: every player has the same options. The six secret roles, hidden objectives,
suspicion and accusations arrive in a later rules version and will be specified here when they
ship. A room keeps the rules version it was created with until it closes.

All numbers below come from the config file; when they differ, the config file is authoritative
and this document is out of date.

## 1. Players, resources and score

- 4 to 12 players. Nobody is ever eliminated; a player who disconnects keeps their seat.
- Each player starts every match with **10 credits** (private), **0 influence** (public) and
  **0 suspicion** (public; unused in 1.0.0).
- Credits are integers in **[0, 30]**. Anything that would raise credits above 30 is lost.
  Nothing can make credits negative; there is no debt.
- **Final score = influence + floor(credits / 3) + objective bonuses - penalties.** In 1.0.0
  objective bonuses and penalties are always 0.
- **Ranking:** higher score; then higher influence; then lower suspicion; then more credits.
  Players equal on all four share the rank. Everyone at rank 1 wins (shared victory).

## 2. Match structure

Phases form a finite state machine. Only the server changes phase.

`LOBBY -> ROLE_REVEAL -> [INTELLIGENCE -> NEGOTIATION -> COMMITMENT -> RESOLUTION -> ROUND_SUMMARY] x N -> FINAL_RECKONING -> RESULTS`

- **N = 5 operations** (standard) or **3** (quick).
- From `RESULTS`, the host's *Rematch* returns the same room to `LOBBY` with every player reset.

| Phase | Normal length | What happens |
| --- | ---: | --- |
| ROLE_REVEAL | 25 s | Each player reads their briefing (the role card in later versions). |
| INTELLIGENCE | 35 s | A new operation is announced; each player privately receives a rumor. |
| NEGOTIATION | 75 s | Chat, reactions and nonbinding deals. |
| COMMITMENT | 25 s | Each player seals 0-3 credits. |
| RESOLUTION | 15 s | The operation succeeds or fails; commitments are revealed. |
| ROUND_SUMMARY | 15 s | Standings and broken promises. |
| FINAL_RECKONING | 30 s | Scores, ranks, highlights and the full audit of every operation. |

- **Pace** multiplies every length: fast x0.75, normal x1, relaxed x1.5 (rounded to whole
  seconds). **Beginner mode** adds 40% to the role reveal and the whole first round.
- **Early advance:** a phase ends as soon as every *connected* player is done (pressed
  *Ready*, or sealed a commitment in `COMMITMENT`). If nobody is connected, only the deadline
  advances the phase.
- **Deadlines** are server time. When a deadline passes, the phase advances once; the next phase
  starts at the moment the server processed the deadline, so a late server never skips phases.
- **Safe defaults:** a player who has not sealed when `COMMITMENT` ends commits **0** (logged as
  an auto-pass). Not pressing Ready never blocks anyone.
- **Match cap:** 45 minutes after the start, the match goes to the final reckoning at the end of
  the current round. Every supported pace finishes well inside the cap (tested), so the cap only
  matters if timings are misconfigured.

## 3. Operations

Each operation is generated when the match starts, from the secret match seed:

- **Tier:** LOW, MEDIUM or HIGH. A match of 3 or more operations contains every tier at least
  once; the rest are random, and the order is shuffled.
- **True base success chance** (secret), uniform within the tier's range:
  LOW 62-82%, MEDIUM 45-65%, HIGH 28-48%.
- **Public window** (public): a 25-point range, at a random offset, that contains the true base,
  widened outward to multiples of 5%.
- **Scenario** (public): a modifier drawn at random (beginner rounds 1 use *Quiet Streets*).

  | Scenario | Success | Pool | Target | Extra intel cost |
  | --- | ---: | ---: | ---: | ---: |
  | Quiet Streets | 0 | x1 | x1 | 0 |
  | Heightened Patrols | -8 pts | x1.3 | x1 | 0 |
  | Friendly Dockmaster | +6 pts | x0.9 | x1 | 0 |
  | Bidding Frenzy | 0 | x1.4 | x1.3 | 0 |
  | Rival Crew Sighted | -5 pts | x1.1 | x1 | 0 |
  | Loose Lips | 0 | x1 | x1 | -1 |

- **Reward pool** (public) = round(pool per player x players x scenario pool multiplier), with
  pool per player LOW 2, MEDIUM 3, HIGH 4.5 influence.
- **Target capital** (public) = ceil(1.5 x players x scenario target multiplier) credits.
- **Roll** (secret): a uniform number in [0, 1), drawn at match start.

### Resolution

1. Every player's sealed commitment `c` (0-3) was deducted from their credits when sealed.
2. If nobody committed, the operation is **abandoned**: no success roll, nothing paid.
3. Otherwise **final chance** = clamp(true base + scenario success + 10 points if total
   commitment >= target capital, 5%, 95%). The operation **succeeds** if roll < final chance.
4. **On success** each participant gets their commitment back and a share of the pool:
   `share = min(floor(2.5 x c), pool x c / total)`. Shares are made whole numbers by the largest
   remainder method; the total paid is round(sum of capped shares) and never exceeds the pool.
   Exact remainder ties are broken by a seeded shuffle drawn for that operation, so no seat is
   favoured.
5. **On failure** participants lose their commitment (and only that).
6. Every player who committed 0 receives **1 credit** (side jobs), whatever the outcome.
7. Commitments become public; the success chance, roll and true base stay secret until the
   final reckoning, which shows the full audit.

Why the per-credit cap: it lets a lone or minority investor win big when others stay out, but not
take the whole pool for a single credit. Why the target bonus: coordination is rewarded, which
gives negotiation a mechanical purpose.

## 4. Intelligence

- **Rumor** (free, every player, every round): estimate = true base + U(-15, +15) points,
  rounded to the nearest 5% and clamped to [0, 100]. Its documented margin is +/-17.5 points
  (noise plus rounding). Each player's rumor is drawn independently, so comparing notes helps.
- **Contact** (optional, once per round, in `INTELLIGENCE` or `NEGOTIATION`): costs 1 credit
  (scenario-adjusted, never below 0) and gives a second estimate with noise U(-7, +7) points
  (margin +/-9.5).
- Intel is private. Telling others about it (truthfully or not) is up to you.

## 5. Negotiation and deals

- **Chat:** room-wide. Text (up to 140 characters after cleanup, profanity masked), presets and
  reactions. At most 12 messages per player per minute. The host can mute a player and can switch
  the room to presets only.
- **Deals are nonbinding promises.** The game never forces anyone to keep them. A player may
  propose up to 3 deals per round to any other players, with 1-3 terms:
  - *Commit at least X* (1-3) this operation,
  - *Share intel*, *No accusations*, *Back me next round*,
  - plus an optional note (80 characters).
- Invitees accept or decline during `INTELLIGENCE`, `NEGOTIATION` or `COMMITMENT`. Only deal
  members see the deal.
- **Promise tracking:** after resolution, for each deal with a *commit* term and at least two
  accepted members, the game checks every accepted member's actual commitment and tells the deal
  members who broke it. Broken and kept promises appear in the final highlights.

## 6. Information visibility

| Information | Who sees it | When |
| --- | --- | --- |
| Own credits, intel, sealed amount | That player | Always |
| Other players' credits | Nobody | Until the final reckoning |
| Whether a player has sealed | Everyone | During commitment |
| Commitment amounts | Everyone | From resolution |
| True base, final chance, roll | Everyone | Final reckoning |
| Match seed | Everyone | Results (to audit the match) |
| Deals and their outcomes | Deal members | Always |

## 7. Host powers

The host can change settings and kick players only outside a match (`LOBBY`, `RESULTS`), mute
anyone at any time, start the match (when 4+ players are seated and all are ready) and start a
rematch. The host has **no** access to any other player's private information. If the host
disconnects outside a match, the next connected player becomes host.

## 8. Deviations from the original brief, and why

- **Side-job credit for sitting out** (not in the brief): without it, committing nothing is
  strictly worse than committing 1 credit to a decent operation, which removes a real choice.
- **No per-round stipend:** with 10 starting credits and up to 3 per round, credits are a budget
  to allocate across operations instead of a resource that is always available.
- **Seeded remainder tie-breaks** (originally seat order): 300 simulated matches showed seat 1
  winning 38.7% of matched-strategy games against 14.2% expected. With the seeded shuffle, every
  seat is within its confidence interval.
