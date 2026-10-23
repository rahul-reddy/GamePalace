import { currentOperation, findPlayer, intelCost, rulesOf } from './engine';
import type { GameState } from './types';

export type LegalAction =
  | { type: 'setReady' }
  | { type: 'updateSettings' }
  | { type: 'start' }
  | { type: 'kick' }
  | { type: 'mute' }
  | { type: 'leave' }
  | { type: 'buyIntel'; cost: number }
  | { type: 'commit'; min: number; max: number }
  | { type: 'proposeDeal'; maxTerms: number }
  | { type: 'respondDeal'; dealIds: string[] }
  | { type: 'chat'; text: boolean }
  | { type: 'rematch' };

/**
 * The actions a player may take right now. A command not described here is
 * rejected by applyCommand; the reverse also holds (tests check both ways).
 */
export function legalActions(state: GameState, playerId: string): LegalAction[] {
  const me = findPlayer(state, playerId);
  if (!me) return [];
  const rules = rulesOf(state);
  const host = state.hostId === playerId;
  const out: LegalAction[] = [];
  const phase = state.phase;
  if (phase !== 'COMMITMENT' && phase !== 'RESULTS') out.push({ type: 'setReady' });
  if (host && (phase === 'LOBBY' || phase === 'RESULTS')) {
    out.push({ type: 'updateSettings' });
    if (state.players.length > 1) out.push({ type: 'kick' });
  }
  if (
    host &&
    phase === 'LOBBY' &&
    state.players.length >= rules.players.min &&
    state.players.every((p) => p.ready || p.id === playerId)
  ) {
    out.push({ type: 'start' });
  }
  if (host && state.players.length > 1) out.push({ type: 'mute' });
  out.push({ type: 'leave' });
  if ((phase === 'INTELLIGENCE' || phase === 'NEGOTIATION') && currentOperation(state)) {
    const bought = (state.extraIntel[state.round] ?? []).includes(playerId);
    const cost = intelCost(state);
    if (!bought && me.credits >= cost) out.push({ type: 'buyIntel', cost });
    const proposed = state.deals.filter(
      (d) => d.round === state.round && d.proposer === playerId,
    ).length;
    if (proposed < rules.deals.maxOpenPerPlayer && state.players.length > 1) {
      out.push({ type: 'proposeDeal', maxTerms: 3 });
    }
  }
  if (phase === 'COMMITMENT' && state.commitments[state.round]?.[playerId] === undefined) {
    out.push({ type: 'commit', min: 0, max: Math.min(rules.economy.maxCommit, me.credits) });
  }
  if (phase === 'INTELLIGENCE' || phase === 'NEGOTIATION' || phase === 'COMMITMENT') {
    const dealIds = state.deals
      .filter((d) => d.round === state.round && d.responses[playerId] === 'pending')
      .map((d) => d.id);
    if (dealIds.length > 0) out.push({ type: 'respondDeal', dealIds });
  }
  if (!me.muted) out.push({ type: 'chat', text: !state.settings.presetChatOnly });
  if (host && phase === 'RESULTS') out.push({ type: 'rematch' });
  return out;
}
