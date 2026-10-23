import { getRules } from './rules';
import type { FinalResults, GameState, Highlight, PlayerState, ScoreBreakdown } from './types';

/** Final score = influence + floor(credits / creditsPerScorePoint) + objective bonus - penalties. */
export function computeScore(
  state: GameState,
  player: PlayerState,
): Omit<ScoreBreakdown, 'rank' | 'winner'> {
  const rules = getRules(state.rulesVersion);
  const creditPoints = Math.floor(player.credits / rules.economy.creditsPerScorePoint);
  const objectiveBonus = 0;
  const penalties = 0;
  return {
    playerId: player.id,
    influence: player.influence,
    creditPoints,
    objectiveBonus,
    penalties,
    total: player.influence + creditPoints + objectiveBonus - penalties,
  };
}

/**
 * Ranking order: total score, then influence, then lower suspicion, then more
 * credits. Players equal on all four share the rank; everyone at rank 1 wins.
 */
export function compareScores(
  a: { total: number; influence: number; suspicion: number; credits: number },
  b: { total: number; influence: number; suspicion: number; credits: number },
): number {
  return (
    b.total - a.total ||
    b.influence - a.influence ||
    a.suspicion - b.suspicion ||
    b.credits - a.credits
  );
}

export function determineWinners(state: GameState): ScoreBreakdown[] {
  const rows = state.players.map((p) => ({
    ...computeScore(state, p),
    suspicion: p.suspicion,
    credits: p.credits,
    seat: p.seat,
  }));
  rows.sort((a, b) => compareScores(a, b) || a.seat - b.seat);
  let rank = 0;
  return rows.map((row, i) => {
    const prev = rows[i - 1];
    if (!prev || compareScores(prev, row) !== 0) rank = i + 1;
    return {
      playerId: row.playerId,
      influence: row.influence,
      creditPoints: row.creditPoints,
      objectiveBonus: row.objectiveBonus,
      penalties: row.penalties,
      total: row.total,
      rank,
      winner: rank === 1,
    };
  });
}

function highlights(state: GameState): Highlight[] {
  const out: Highlight[] = [];
  const stat = (fn: (id: string) => number) =>
    state.players
      .map((p) => ({ id: p.id, value: fn(p.id), seat: p.seat }))
      .sort((a, b) => b.value - a.value || a.seat - b.seat)[0];
  const resolved = state.operations.filter((o) => o.result);
  const investor = stat((id) =>
    resolved.reduce((s, o) => s + (o.result?.payouts[id]?.influence ?? 0), 0),
  );
  if (investor && investor.value > 0)
    out.push({ kind: 'best_investor', playerId: investor.id, value: investor.value });
  const bold = stat((id) =>
    resolved
      .filter((o) => o.tier === 'HIGH')
      .reduce((s, o) => s + (o.result?.payouts[id]?.committed ?? 0), 0),
  );
  if (bold && bold.value > 0)
    out.push({ kind: 'boldest_bet', playerId: bold.id, value: bold.value });
  const broken = stat((id) => state.deals.filter((d) => d.kept?.[id] === false).length);
  if (broken && broken.value > 0)
    out.push({ kind: 'broken_promise', playerId: broken.id, value: broken.value });
  const loyal = stat((id) => state.deals.filter((d) => d.kept?.[id] === true).length);
  if (loyal && loyal.value > 0)
    out.push({ kind: 'loyal_partner', playerId: loyal.id, value: loyal.value });
  const cautious = stat(
    (id) => resolved.filter((o) => (o.result?.payouts[id]?.committed ?? 0) === 0).length,
  );
  if (cautious && cautious.value > 0)
    out.push({ kind: 'cautious', playerId: cautious.id, value: cautious.value });
  return out;
}

export function finalizeResults(state: GameState): FinalResults {
  const scores = determineWinners(state);
  const top = scores[0];
  const result: FinalResults = {
    scores,
    winners: scores.filter((s) => s.winner).map((s) => s.playerId),
    seed: state.seed,
    highlights: highlights(state),
  };
  if (top)
    result.highlights.unshift({ kind: 'biggest_score', playerId: top.playerId, value: top.total });
  return result;
}
