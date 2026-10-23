# THE SYNDICATE: rules specification

Current rules version: **2.0.0** (`config/rules-2.0.0.json`). New rooms use it. Rules **1.0.0**
(`config/rules-1.0.0.json`, the symmetric baseline of the first playable slice) stays supported:
a room keeps the rules version it was created with until it closes, and section 10 lists how 1.0.0
differs.

All numbers below come from the config file. If they ever disagree, the config file is
authoritative and this document is out of date.

## 1. Players, resources and score

- 4 to 12 players. Nobody is ever eliminated; a player who disconnects keeps their seat.
- Each player starts every match with **10 credits** (private), **0 influence** (public) and
  **0 suspicion** (public).
- Credits are integers in **[0, 30]**. Anything that would raise credits above 30 is lost.
  Nothing makes credits negative; there is no debt.
- Each player also gets a **secret role** (section 6) and a **hidden objective** (section 8).

**Final score = influence + floor(credits / 3) + endgame bonuses − penalties**, where

- endgame bonuses = hidden objective bonus (if completed) + correct-accusation bonuses;
- penalties = suspicion penalty + wrong-accusation penalties + ability costs (exposed sabotage,
  wrong forecasts).

**Ranking:** higher score; then higher influence; then lower suspicion; then more credits.
Players equal on all four share the rank. Everyone at rank 1 wins (shared victory).

## 2. Match structure

Only the server changes phase.

`LOBBY -> ROLE_REVEAL -> [INTELLIGENCE -> NEGOTIATION -> COMMITMENT -> RESOLUTION -> ROUND_SUMMARY] x N -> FINAL_RECKONING -> RESULTS`

- **N = 5 operations** (standard) or **3** (quick). From `RESULTS`, the host's *Rematch* returns
  the room to `LOBBY` with every player reset and new roles dealt at the next start.

| Phase | Normal length | What happens |
| --- | ---: | --- |
| ROLE_REVEAL | 30 s | Each player privately reads their role card and objective. |
| INTELLIGENCE | 35 s | A new operation is announced; each player privately receives a rumor. Peek and investigate abilities. |
| NEGOTIATION | 75 s | Chat, reactions, nonbinding deals, accusations, peek and investigate. |
| COMMITMENT | 25 s | Commitment-phase abilities, then each player seals 0-3 credits. |
| RESOLUTION | 15 s | The operation resolves; commitments are revealed. |
| ROUND_SUMMARY | 15 s | Exposure checks, suspicion decay, standings, broken promises. |
| FINAL_RECKONING | 40 s | Roles, objectives, bonuses, penalties, scores and the full audit. |

- **Pace** multiplies every length: fast x0.75, normal x1, relaxed x1.5 (whole seconds).
  **Beginner mode** adds 40% to the role reveal and the whole first round.
- **Early advance:** a phase ends as soon as every *connected* player is done (pressed *Ready*,
  or sealed a commitment in `COMMITMENT`). With nobody connected only the deadline advances it.
- **Deadlines** are server time. When one passes, the phase advances once; the next phase starts
  when the server processed the deadline, so a late server never skips phases.
- **Safe defaults:** a player who has not sealed when `COMMITMENT` ends commits **0** (logged as an
  auto-pass) and uses no ability. Not pressing Ready never blocks anyone.
- **Match cap:** 45 minutes after the start, the match goes to the final reckoning at the end of
  the current round. Every supported pace finishes well inside it (tested).

## 3. Operations

Generated at match start from the secret match seed:

- **Tier:** LOW, MEDIUM or HIGH. A match of 3+ operations contains every tier at least once; the
  rest are random and the order is shuffled.
- **True base success chance** (secret), uniform in the tier's range: LOW 62-82%, MEDIUM 45-65%,
  HIGH 28-48%.
- **Public window:** a 25-point range at a random offset that contains the true base, widened to
  multiples of 5%.
- **Scenario** (public, random; beginner round 1 uses *Quiet Streets*):

  | Scenario | Success | Pool | Target | Extra intel cost |
  | --- | ---: | ---: | ---: | ---: |
  | Quiet Streets | 0 | x1 | x1 | 0 |
  | Heightened Patrols | -8 pts | x1.3 | x1 | 0 |
  | Friendly Dockmaster | +6 pts | x0.9 | x1 | 0 |
  | Bidding Frenzy | 0 | x1.4 | x1.3 | 0 |
  | Rival Crew Sighted | -5 pts | x1.1 | x1 | 0 |
  | Loose Lips | 0 | x1 | x1 | -1 |

- **Reward pool** (public) = round(pool per player x players x scenario pool multiplier); pool per
  player LOW 1.4, MEDIUM 2, HIGH 3 influence.
- **Target capital** (public) = ceil(1.5 x players x scenario target multiplier) credits.
- **Roll** (secret): uniform in [0, 1), drawn at match start.

### Resolution order

1. Unsealed players commit 0. Commitments were deducted (escrowed) when sealed.
2. Nobody committed: the operation is **abandoned** (no roll, nothing paid).
3. **Final chance** = clamp(true base + scenario + 10 pts if total commitment >= target − sabotage,
   5%, 95%). Sabotage on one operation is capped at 30 points in total.
4. **Success** if roll < final chance, otherwise **failure**.
5. On success each backer gets their commitment back and a pool share
   `min(floor(2 x c), pool x c / total)`, made whole by largest remainder (exact ties broken by a
   seeded per-operation shuffle). The total paid never exceeds the pool.
6. On failure backers lose their commitment (and only that).
7. Everyone who committed 0 gets **1 credit** (side jobs).
8. Ability effects in this order of listing in section 6 (insurance, broker, forecast, sabotage
   reward, insider tip).
9. Deals are judged (section 5).

Commitments become public at resolution. True base, final chance, sabotage and roll stay secret
until the final reckoning, which shows the audit for every operation.

## 4. Intelligence

- **Rumor** (free, everyone, every round): true base + U(-15, +15) pts, rounded to 5%, clamped to
  [0, 100]. Documented margin ±17.5 pts. Each player's rumor is independent.
- **Contact** (optional, once per round, intelligence or negotiation): 1 credit (scenario-adjusted,
  never below 0) for an estimate with noise U(-7, +7) pts (margin ±9.5).
- Intel is private. Sharing it, truthfully or not, is up to the player.

## 5. Negotiation, deals and chat

- **Chat:** room-wide text (≤140 characters after cleanup, profanity masked), presets and
  reactions; ≤12 messages per player per minute. The host can mute players and switch the room to
  presets only.
- **Deals are nonbinding promises** the game never enforces. A player may propose ≤3 deals per
  round (in intelligence or negotiation) to any players, with 1-3 terms: *Commit at least X*
  (1-3), *Share intel*, *No accusations*, *Back me next round*, plus an optional 80-character note.
  Invitees answer until commitment closes. Only members see a deal.
- **Promise tracking** after resolution, for deals with at least two accepted members: a member
  broke the deal if they committed less than a *Commit at least X* term, or accused another
  accepted member that round under a *No accusations* term. Members are told who broke it; kept
  and broken promises feed the highlights and two objectives.

## 6. Roles

One role per player, dealt secretly at the start from the distribution table (section 7). A role
has an **ability** with a number of **charges** (uses per match). Rules shared by every ability:

- At most **one ability use per player per operation**, within the timing shown.
- Commitment-phase abilities must be used **before sealing** (sealing ends your turn).
- Uses are secret. Nobody is told that an ability was used, except as each ability says.
- A use is final once acknowledged by the server.

| Role (archetype) | Charges | Timing | Effect |
| --- | ---: | --- | --- |
| **Broker** (broker) | 1 | commitment | If the operation succeeds while the Broker backs it and at least 2 others back it: +3 influence. Otherwise nothing; the charge is spent. |
| **Kingmaker** (broker) | 2 | commitment | If the operation succeeds while the Kingmaker backs it and at least **3** others back it: +3 influence, and every other backer gets +1 (they see a private "gift from a patron"). |
| **Insider** (insider) | 2 | intelligence, negotiation | Read the current **or next** operation: estimate = true base + U(−5, +5) pts, rounded to 5% (margin ±7.5). If the Insider backs an operation it read and it succeeds: +2 influence ("tip"). |
| **Informant** (insider) | 2 | intelligence, negotiation | Read the current operation only, noise U(−7.5, +7.5) (margin ±10). Tip +2. |
| **Fixer** (fixer) | 2 | commitment | Insure one player (self allowed). If the operation fails, that player gets their whole commitment back (never more than they lost). If it succeeds and the insured player is someone else who backed it: +2 influence (premium). The insured player is told privately who insured them. |
| **Underwriter** (fixer) | 2 | commitment | Insure another player: refund half their loss, rounded up. Premium +2. |
| **Auditor** (auditor) | 2 | intelligence, negotiation, from op 2 | **Background check** on a player: truthful yes/no, "has this player sabotaged any operation so far?". Correct accusations earn +2 extra. |
| **Inspector** (auditor) | 3 | intelligence, negotiation, from op 2 | Pick a player and a resolved operation: truthful yes/no, "did they use any secret ability in it?". Correct accusations earn +2 extra. |
| **Saboteur** (saboteur) | 1 | commitment | Cut this operation's final chance by 20 pts. If it fails with ≥2 other backers: +3 influence. Exposure risk (below); each exposed sabotage costs a 2-point fine at the end. |
| **Mole** (saboteur) | 2 | commitment | Cut by 12 pts. Reward +2 on failure with ≥2 other backers. Gentler exposure; 1-point fine each. |
| **Opportunist** (opportunist) | 2 | commitment | Forecast success or failure. Right: +2 influence. Wrong: −1 point at the end. Abandoned operation: charge returned. |
| **Speculator** (opportunist) | 3 | commitment | Forecast; right +1, wrong costs nothing. |

**Exposure.** After each round summary, every unexposed sabotage is checked: the chance is
`base + step x (checks so far)`, capped at 100% (Saboteur 20% then 35%, 50%, 65%, 80%; Mole 15%,
25%, 35%...). On exposure the log publicly names the player and the sabotaged operation, their
suspicion rises by 2, and they are marked **EXPOSED** for the rest of the match. Exposure is
derived from the seed, so it replays exactly.

## 7. Role distribution

| Players | Roles |
| ---: | --- |
| 4 | Saboteur, Auditor + 2 of {Broker, Insider, Fixer, Opportunist} |
| 5 | Saboteur, Auditor + 3 of {Broker, Insider, Fixer, Opportunist} |
| 6 | Saboteur, Auditor, Broker, Insider, Fixer, Opportunist |
| 7 | the six + 1 of {Kingmaker, Informant, Underwriter, Speculator} |
| 8 | the six + 2 of the variants |
| 9 | the six + Mole + 2 variants |
| 10 | the six + Mole + Inspector + 2 variants |
| 11 | the six + Mole + Inspector + 3 variants |
| 12 | the six + Mole + Inspector + all 4 variants |

Every table has at least one saboteur and one auditor, never more than two of any archetype, and
no duplicate role. Picks and seating are drawn from the seed. Tests check every player count.

## 8. Suspicion, accusations and objectives

- **Suspicion** is public, between 0 and 6. Accusations raise the target by 1, at most once per
  round however many players accuse them (no pile-ons). Exposure raises it by 2. Backing an
  operation that succeeds lowers it by 1 (not in the round you were exposed).
  **Suspicion penalty** at the end = min(3, max(0, suspicion − 2)). Suspicion never removes
  credits, influence or the ability to play.
- **Accusations** (negotiation only): ≤1 per round, ≤2 per match, never against yourself or an
  already-exposed player. They are public. At the final reckoning each accusation of a player whose
  archetype is *saboteur* earns +2 (+2 more for auditors); each wrong one costs 1.
- **Hidden objectives** (one per player, private until the reckoning, standard / quick thresholds):

  | Objective | Condition | Bonus |
  | --- | --- | ---: |
  | Backer | back ≥4 / ≥3 operations | +3 |
  | High Roller | commit 3 to a high-risk operation that succeeds | +3 |
  | Reserve | finish with ≥9 / ≥8 credits | +2 |
  | Dealmaker | share accepted deals with ≥3 / ≥2 different players | +2 |
  | Clean Hands | finish with suspicion 0 | +1 |
  | Promise Keeper | keep ≥2 / ≥1 commit promises and break none | +3 |
  | Contrarian | sit out at least one operation that fails | +2 |
  | Investor | earn ≥6 / ≥4 influence from operation shares | +3 |

  Objectives are dealt from a shuffled deck (repeats only when there are more players than
  objectives); none requires excluding another player.

## 9. Information visibility

| Information | Who sees it | When |
| --- | --- | --- |
| Own credits, intel, role, charges, objective, sealed amount | That player | Always |
| Other players' credits, roles, objectives, ability uses | Nobody | Until the final reckoning |
| Ability results (peek, investigation, insurance, bonuses) | The players they name | When they happen |
| Influence, suspicion, accusations, exposures | Everyone | Always |
| Whether a player has sealed | Everyone | During commitment |
| Commitment amounts | Everyone | From resolution |
| True base, final chance, sabotage, roll, every ability use | Everyone | Final reckoning |
| Match seed | Everyone | Results |

The host has no access to anything private. The host can change settings and kick players only
outside a match, mute anyone at any time, start the match (4+ players, all ready) and rematch.

## 10. Rules 1.0.0 (baseline)

Same structure without roles, suspicion, accusations or objectives. Differences: pool per player
LOW 2, MEDIUM 3, HIGH 4.5; share cap 2.5 influence per credit; role reveal 25 s; final reckoning
30 s.

## 11. Deviations from the original brief, and why

Each change was driven by simulation evidence (`docs/BALANCE.md`).

- **Side-job credit for sitting out:** without it, committing nothing is strictly worse than
  committing 1 credit to a decent operation, which removes a real choice.
- **No per-round stipend:** credits are a budget across operations, not always available.
- **Seeded remainder tie-breaks** (instead of seat order): seat 1 won 38.7% of matched-strategy
  games against 14.2% expected.
- **Smaller pools in 2.0.0** (LOW 1.4 / MEDIUM 2 / HIGH 3 per player, cap 2 per credit): with the
  1.0.0 pools "always commit the maximum" beat every other strategy (+9 pp).
- **Fixer has 2 charges (brief: once) and a 2-point premium:** with one charge and no premium the
  Fixer lost 8 pp below expectation; insurance of at most 3 credits is worth at most 1 point.
- **Auditor's check covers the whole record, not one action:** a single (player, round) probe
  almost never found the saboteur (−7 pp). It is still a narrow, truthful yes/no.
- **Insider tip bonus:** information alone did not convert into wins (−11 pp).
- **Forecasts are paid 2 (not 3) and a wrong Opportunist forecast costs 1:** Opportunists won
  21 pp above expectation.
- **Variant and objective tuning:** Kingmaker, Informant and Underwriter numbers and the Backer,
  Clean Hands and Contrarian objectives were adjusted so no variant or objective is far easier or
  harder than its peers (see `docs/BALANCE.md`).
- **No accusations against exposed players, plus an exposure fine:** once exposures were public,
  everyone farmed +2 per exposed saboteur (92% of accusations "correct"), and exposure itself cost
  saboteurs nothing because +2 suspicion sat inside the free allowance.
