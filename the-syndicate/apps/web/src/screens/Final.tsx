import type { Highlight, PublicOperation } from '@syndicate/game-engine';
import { Card, ConfirmDialog, PrivateLabel } from '@syndicate/ui';
import { useState } from 'react';
import { TierChip } from '../components/OperationCard';
import { Avatar, nameOf, ReadyBar } from '../components/Players';
import { RoleSigil } from '../components/RoleSigil';
import { OBJECTIVE_NAME, ROLE_ARCHETYPE, ROLE_NAMES } from '../lib/roles';
import { pct } from '../lib/format';
import { navigate } from '../lib/router';
import { forgetSeat } from '../lib/session';
import type { GameProps } from './Room';

const HIGHLIGHT_TEXT: Record<Highlight['kind'], (v: number) => string> = {
  biggest_score: (v) => `top score: ${v}`,
  best_investor: (v) => `best investor: ${v} influence from operations`,
  boldest_bet: (v) => `boldest: ${v} credits into high-risk operations`,
  broken_promise: (v) => `most broken promises: ${v}`,
  loyal_partner: (v) => `most promises kept: ${v}`,
  cautious: (v) => `most cautious: sat out ${v} operation${v === 1 ? '' : 's'}`,
};

/** Explains the gap between true base and final chance (clamping to 5-95% aside). */
function modifiers(o: PublicOperation, targetBonus: number): string {
  const parts: string[] = [];
  const pts = (x: number) => Math.round(x * 100);
  if (o.scenario.successDelta)
    parts.push(
      `${o.scenario.successDelta > 0 ? '+' : '−'}${Math.abs(pts(o.scenario.successDelta))} ${o.scenario.name}`,
    );
  if (o.result?.targetMet) parts.push(`+${pts(targetBonus)} target met`);
  if (o.result?.audit?.sabotage) parts.push(`−${pts(o.result.audit.sabotage)} sabotage`);
  return parts.length ? ` ${parts.join(' ')}` : '';
}

function signed(v: number): string {
  return v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0';
}

export function Final(props: GameProps) {
  const { view, act, roomCode } = props;
  const [leave, setLeave] = useState(false);
  const results = view.results;
  if (!results) return null;
  const isHost = view.hostId === view.self.id;
  const winners = results.winners.map((id) => nameOf(view, id));
  const me = results.scores.find((s) => s.playerId === view.self.id);
  const ops = [...view.history, ...(view.operation ? [view.operation] : [])].sort(
    (a, b) => a.round - b.round,
  );
  return (
    <div className="flex flex-col gap-4">
      <Card className="text-center" aria-label="Winners" data-testid="winners">
        <p className="eyebrow">{winners.length > 1 ? 'Shared victory' : 'The syndicate bows to'}</p>
        <p className="font-display text-3xl text-[var(--color-gold)] my-2 anim-stamp">
          {winners.join(' & ')}
        </p>
        {me && (
          <p className="text-[var(--color-muted)]">
            You finished #{me.rank} with {me.total} point{me.total === 1 ? '' : 's'}.
          </p>
        )}
      </Card>

      <Card aria-label="Final scores">
        <h2 className="font-display text-lg mb-2">Final scores</h2>
        <table className="w-full text-sm" data-testid="scoreboard">
          <thead>
            <tr className="text-left text-[var(--color-muted)] text-xs uppercase tracking-wider">
              <th className="py-1 font-semibold">#</th>
              <th className="py-1 font-semibold">Player</th>
              <th className="py-1 font-semibold text-right">Influence</th>
              <th className="py-1 font-semibold text-right">Credits</th>
              {view.features.roles && <th className="py-1 font-semibold text-right">±</th>}
              <th className="py-1 font-semibold text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {results.scores.map((s) => {
              const p = view.players.find((x) => x.id === s.playerId);
              return (
                <tr
                  key={s.playerId}
                  className="border-t border-[var(--color-border)]"
                  data-testid="score-row"
                >
                  <td className="py-2 font-mono">{s.rank}</td>
                  <td className="py-2">
                    <span className="flex items-center gap-2 min-w-0">
                      {p && <Avatar player={p} size={24} />}
                      <span className="truncate">{p?.name}</span>
                      {s.winner && <span aria-label="winner">👑</span>}
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono">{s.influence}</td>
                  <td className="py-2 text-right font-mono whitespace-nowrap">
                    {results.finalCredits[s.playerId]} → {s.creditPoints}
                  </td>
                  {view.features.roles && (
                    <td
                      className="py-2 text-right font-mono"
                      title="Objective and accusation bonuses minus penalties"
                    >
                      {signed(s.objectiveBonus + s.accusationBonus - s.penalties)}
                    </td>
                  )}
                  <td
                    className="py-2 text-right font-mono text-[var(--color-gold)]"
                    data-testid="score-total"
                  >
                    {s.total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-[var(--color-muted)] mt-2">
          Total = influence + credits ÷ {view.rules.creditsPerScorePoint} (rounded down). Ties are
          broken by influence, then credits; players still level share the win.
        </p>
      </Card>

      {view.features.roles && results.reveals.length > 0 && (
        <Card aria-label="Secret roles revealed" data-testid="role-reveal">
          <h2 className="font-display text-lg mb-3">The masks come off</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {results.reveals.map((r) => {
              const p = view.players.find((x) => x.id === r.playerId);
              const archetype = r.role ? ROLE_ARCHETYPE[r.role] : undefined;
              const lines = [
                r.objective &&
                  `${OBJECTIVE_NAME[r.objective]}: ${r.objectiveMet ? 'completed ✓' : 'missed'}`,
                r.accusationBonus > 0 && `correct accusations +${r.accusationBonus}`,
                r.accusationPenalty > 0 && `wrong accusations −${r.accusationPenalty}`,
                r.suspicionPenalty > 0 && `suspicion −${r.suspicionPenalty}`,
                r.abilityPenalty > 0 && `ability costs −${r.abilityPenalty}`,
              ].filter(Boolean);
              return (
                <li
                  key={r.playerId}
                  className="flex items-start gap-3 rounded-[var(--radius-sm)] bg-[var(--color-bg-2)] p-3 anim-rise"
                >
                  {archetype && <RoleSigil archetype={archetype} size={40} />}
                  <div className="min-w-0">
                    <p className="font-semibold flex items-center gap-1.5">
                      {p && <Avatar player={p} size={20} />}
                      <span className="truncate">{p?.name}</span>
                    </p>
                    <p className="font-display text-[var(--color-gold)]">
                      {r.role ? ROLE_NAMES[r.role] : 'Operator'}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">{lines.join(' · ')}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          {results.abilityUses.some((u) => u.ability === 'sabotage') && (
            <p className="text-sm mt-3">
              Sabotage:{' '}
              {results.abilityUses
                .filter((u) => u.ability === 'sabotage')
                .map(
                  (u) =>
                    `${nameOf(view, u.player)} hit op ${u.round}${u.exposed ? ' (exposed)' : ''}`,
                )
                .join('; ')}
              .
            </p>
          )}
        </Card>
      )}

      {results.highlights.length > 0 && (
        <Card aria-label="Highlights">
          <h2 className="font-display text-lg mb-2">Highlights</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {results.highlights.map((h) => (
              <li key={h.kind}>
                <strong>{nameOf(view, h.playerId)}</strong>, {HIGHLIGHT_TEXT[h.kind](h.value)}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card aria-label="Operation audit">
        <h2 className="font-display text-lg mb-1">What really happened</h2>
        <p className="text-xs text-[var(--color-muted)] mb-3">
          An operation succeeds when its secret roll is below its final chance.
        </p>
        <ul className="flex flex-col gap-2 text-sm">
          {ops.map((o) => (
            <li key={o.round} className="rounded-[var(--radius-sm)] bg-[var(--color-bg-2)] p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {o.round}. {o.name}
                </span>
                <TierChip tier={o.tier} />
              </div>
              {o.result && (
                <p className="text-[var(--color-muted)] mt-1">
                  {o.result.status === 'ABANDONED'
                    ? 'Nobody backed it.'
                    : `True base ${pct(o.result.audit?.trueBase ?? 0)}${modifiers(o, view.rules.targetBonus)} = final chance ${pct(o.result.audit?.finalChance ?? 0)}; roll ${pct(o.result.audit?.roll ?? 0)}: ${o.result.status === 'SUCCESS' ? 'success' : 'failure'}. ${o.result.totalCommitted} credits committed.`}
                </p>
              )}
            </li>
          ))}
        </ul>
        {results.seed && (
          <p className="text-xs text-[var(--color-faint)] mt-3 break-all">
            Match seed (for auditing): <span className="font-mono">{results.seed}</span>
          </p>
        )}
      </Card>

      <section className="card-private p-4" aria-label="Your final credits">
        <PrivateLabel>Your wallet</PrivateLabel>
        <p className="mt-1">You ended with {view.self.credits} credits.</p>
      </section>

      {view.phase === 'FINAL_RECKONING' ? (
        <ReadyBar view={view} act={act} label="Continue" />
      ) : (
        <div
          className="fixed bottom-0 inset-x-0 z-20 bg-[rgba(10,15,30,0.95)] border-t border-[var(--color-border)] px-4 py-3"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <button type="button" className="btn btn-ghost" onClick={() => setLeave(true)}>
              Leave
            </button>
            <p className="flex-1 text-sm text-[var(--color-muted)]">
              {isHost ? 'Same table, new seed.' : 'Waiting for the host to start a rematch.'}
            </p>
            {isHost && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => act({ type: 'rematch' })}
              >
                Rematch
              </button>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={leave}
        title="Leave this room?"
        confirmLabel="Leave"
        tone="danger"
        onCancel={() => setLeave(false)}
        onConfirm={async () => {
          setLeave(false);
          await act({ type: 'leave' }, { quiet: true });
          forgetSeat(roomCode);
          navigate('/');
        }}
      >
        You can join again with the room code while the room is open.
      </ConfirmDialog>
    </div>
  );
}
