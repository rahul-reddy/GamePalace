import { getRules } from './rules';
import type { GameState, Phase } from './types';

const LEGAL_NEXT: Record<Phase, Phase[]> = {
  LOBBY: ['ROLE_REVEAL'],
  ROLE_REVEAL: ['INTELLIGENCE'],
  INTELLIGENCE: ['NEGOTIATION'],
  NEGOTIATION: ['COMMITMENT'],
  COMMITMENT: ['RESOLUTION'],
  RESOLUTION: ['ROUND_SUMMARY'],
  ROUND_SUMMARY: ['INTELLIGENCE', 'FINAL_RECKONING'],
  FINAL_RECKONING: ['RESULTS'],
  RESULTS: ['LOBBY'],
};

/** Checks the invariants that must hold after every command. Returns violations found. */
export function checkInvariants(prev: GameState, next: GameState): string[] {
  const out: string[] = [];
  const rules = getRules(next.rulesVersion);
  for (const p of next.players) {
    if (!Number.isInteger(p.credits) || p.credits < 0 || p.credits > rules.economy.creditCap) {
      out.push(`credits out of range for ${p.id}: ${p.credits}`);
    }
    if (!Number.isInteger(p.influence) || p.influence < 0)
      out.push(`bad influence ${p.id}: ${p.influence}`);
    const before = prev.players.find((q) => q.id === p.id);
    if (before && p.influence < before.influence && next.matchIndex === prev.matchIndex) {
      out.push(`influence decreased for ${p.id}`);
    }
  }
  if (prev.phase !== next.phase && !LEGAL_NEXT[prev.phase].includes(next.phase)) {
    out.push(`illegal transition ${prev.phase} -> ${next.phase}`);
  }
  for (const [round, commits] of Object.entries(next.commitments)) {
    for (const [id, amount] of Object.entries(commits)) {
      if (!Number.isInteger(amount) || amount < 0 || amount > rules.economy.maxCommit) {
        out.push(`bad commitment round ${round} ${id}: ${amount}`);
      }
    }
  }
  for (const op of next.operations) {
    if (!op.result) continue;
    const prevOp = prev.operations.find((o) => o.round === op.round);
    if (prevOp?.result && JSON.stringify(prevOp.result) !== JSON.stringify(op.result)) {
      out.push(`operation ${op.round} resolved twice`);
    }
    const awarded = Object.values(op.result.payouts).reduce((s, p) => s + p.influence, 0);
    if (awarded > op.pool) out.push(`operation ${op.round} paid ${awarded} > pool ${op.pool}`);
    if (op.result.status !== 'SUCCESS' && awarded > 0)
      out.push(`operation ${op.round} paid on failure`);
  }
  return out;
}
