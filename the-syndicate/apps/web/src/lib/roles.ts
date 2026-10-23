// Player-facing explanations of roles and objectives, generated from the rule
// parameters the server sends, so the text always matches the numbers in play.
import type { ObjectiveView, RoleView } from '@syndicate/game-engine';

const n = (v: number | string | undefined) => (typeof v === 'number' ? v : Number(v ?? 0));
const pts = (v: number | string | undefined) => `${Math.round(n(v) * 100)} points`;
const times = (c: number) => (c === 1 ? 'Once per match' : `${c} times per match`);

export const ARCHETYPE_TAGLINE: Record<RoleView['archetype'], string> = {
  broker: 'You profit when the table works together.',
  insider: 'You know more than you let on.',
  fixer: 'You make losses disappear, for a price.',
  auditor: 'You follow the money to the traitor.',
  saboteur: 'You win when their plans fall apart.',
  opportunist: 'You bet on how the night ends.',
};

/** What the ability does, in one or two sentences. */
export function abilityText(role: RoleView): string {
  const p = role.params;
  const c = role.maxCharges;
  switch (role.ability) {
    case 'broker':
      return `${times(c)}, while sealing, broker the operation: if it succeeds while you and at least ${n(p.minOthers)} others back it, you gain ${n(p.bonus)} influence${n(p.othersBonus) ? ` and every other backer gains ${n(p.othersBonus)}` : ''}.`;
    case 'peek':
      return `${times(c)}, during intelligence or negotiation, read ${n(p.allowNext) ? 'the current or the next' : 'the current'} operation's true odds to within about ±${Math.round(n(p.noiseCurrent) * 100 + 2.5)} points. Back an operation you read and it succeeds: +${n(p.tipBonus)} influence.`;
    case 'insure':
      return `${times(c)}, while sealing, insure ${n(p.allowSelf) ? 'anyone (yourself included)' : 'another player'}: if the operation fails they get back ${n(p.refundShare) >= 1 ? 'everything they committed' : 'half of what they committed (rounded up)'}. If it succeeds and you insured someone else who backed it, you earn ${n(p.premium)} influence.`;
    case 'investigate':
      return p.scope === 'history'
        ? `${times(c)}, from the second operation, run a background check on a player: learn whether they have sabotaged any operation so far. Your correct accusations earn ${n(p.accuseBonus)} extra.`
        : `${times(c)}, from the second operation, inspect a player and a past operation: learn whether they used any secret ability in it. Your correct accusations earn ${n(p.accuseBonus)} extra.`;
    case 'sabotage':
      return `${times(c)}, while sealing, secretly cut this operation's success chance by ${pts(p.penalty)}. If it then fails with at least ${n(p.minVictims)} other backers you gain ${n(p.reward)} influence. After each round there is a rising chance you are exposed (from ${Math.round(n(p.exposeBase) * 100)}%, +${Math.round(n(p.exposeStep) * 100)}% each round): +2 suspicion and a ${n(p.exposureFine)}-point fine.`;
    case 'forecast':
      return `${times(c)}, while sealing, forecast whether the operation succeeds. Right: +${n(p.reward)} influence${n(p.wrongPenalty) ? `; wrong: −${n(p.wrongPenalty)} point at the end` : ''}. If nobody backs it, you keep the charge.`;
  }
}

export function abilityButton(role: RoleView): string {
  switch (role.ability) {
    case 'broker':
      return 'Broker this operation';
    case 'peek':
      return 'Read the odds';
    case 'insure':
      return 'Insure a player';
    case 'investigate':
      return role.params.scope === 'history' ? 'Run a background check' : 'Inspect a player';
    case 'sabotage':
      return 'Sabotage this operation';
    case 'forecast':
      return 'Make a forecast';
  }
}

export function objectiveText(o: ObjectiveView): string {
  const t = o.threshold;
  switch (o.id) {
    case 'backer':
      return `Back at least ${t} operations.`;
    case 'highRoller':
      return 'Commit 3 credits to a high-risk operation that succeeds.';
    case 'reserve':
      return `Finish with at least ${t} credits.`;
    case 'dealmaker':
      return `Share accepted deals with at least ${t} different players.`;
    case 'cleanHands':
      return 'Finish with no suspicion at all.';
    case 'promiseKeeper':
      return `Keep at least ${t} commit promise${t === 1 ? '' : 's'} and break none.`;
    case 'contrarian':
      return `Sit out at least ${t} operation${t === 1 ? '' : 's'} that fail${t === 1 ? 's' : ''}.`;
    case 'investor':
      return `Earn at least ${t} influence from operation shares.`;
  }
}

export const OBJECTIVE_NAME: Record<ObjectiveView['id'], string> = {
  backer: 'Backer',
  highRoller: 'High Roller',
  reserve: 'Reserve',
  dealmaker: 'Dealmaker',
  cleanHands: 'Clean Hands',
  promiseKeeper: 'Promise Keeper',
  contrarian: 'Contrarian',
  investor: 'Investor',
};

export const ROLE_NAMES: Record<string, string> = {
  broker: 'Broker',
  kingmaker: 'Kingmaker',
  insider: 'Insider',
  informant: 'Informant',
  fixer: 'Fixer',
  underwriter: 'Underwriter',
  auditor: 'Auditor',
  inspector: 'Inspector',
  saboteur: 'Saboteur',
  mole: 'Mole',
  opportunist: 'Opportunist',
  speculator: 'Speculator',
};

export const ROLE_ARCHETYPE: Record<string, RoleView['archetype']> = {
  broker: 'broker',
  kingmaker: 'broker',
  insider: 'insider',
  informant: 'insider',
  fixer: 'fixer',
  underwriter: 'fixer',
  auditor: 'auditor',
  inspector: 'auditor',
  saboteur: 'saboteur',
  mole: 'saboteur',
  opportunist: 'opportunist',
  speculator: 'opportunist',
};
