import { Card, PrivateLabel } from '@syndicate/ui';
import { termText } from '../components/Deals';
import { Avatar, nameOf, ReadyBar } from '../components/Players';
import { Dossier } from '../components/RolePanels';
import type { GameProps } from './Room';

const STATUS_TEXT = { SUCCESS: 'Success', FAILURE: 'Failed', ABANDONED: 'Abandoned' } as const;

export function Outcome(props: GameProps) {
  const { view, act } = props;
  const op = view.operation;
  const result = op?.result;
  if (!op || !result) return null;
  const mine = result.commitments[view.self.id] ?? 0;
  const myInfluence = result.influence[view.self.id] ?? 0;
  const creditChange =
    mine === 0
      ? `+${view.rules.sitOutCredits} credit from side jobs`
      : result.status === 'SUCCESS'
        ? `${mine} credits returned`
        : `−${mine} credits lost`;
  const myDeals = view.deals.filter((d) => d.round === view.round && d.kept);
  const color =
    result.status === 'SUCCESS'
      ? 'var(--color-success)'
      : result.status === 'FAILURE'
        ? 'var(--color-danger)'
        : 'var(--color-muted)';
  const ranked = [...view.players].sort((a, b) => b.influence - a.influence);
  return (
    <div className="flex flex-col gap-4">
      <Card
        className="text-center overflow-hidden"
        aria-label="Operation outcome"
        data-testid="outcome"
      >
        <p className="eyebrow">{op.name}</p>
        <p
          className="font-display text-5xl my-3 anim-stamp inline-block border-4 rounded-lg px-4 py-1"
          style={{ color, borderColor: color }}
          data-testid="outcome-status"
        >
          {STATUS_TEXT[result.status]}
        </p>
        <p className="text-[var(--color-muted)]">
          {result.participants} backer{result.participants === 1 ? '' : 's'} committed{' '}
          {result.totalCommitted} of the {op.targetCapital}-credit target
          {result.targetMet ? ' — target reached, odds boosted' : ''}.
        </p>
      </Card>

      <section className="card-private p-4" aria-label="Your result">
        <PrivateLabel>Your result</PrivateLabel>
        <p className="mt-2">
          You committed <strong>{mine}</strong>: {creditChange}
          {myInfluence > 0 && (
            <>
              , <strong className="text-[var(--color-gold)]">+{myInfluence} influence</strong>
            </>
          )}
          .
        </p>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          You now hold {view.self.credits} credits.
        </p>
      </section>

      {view.phase === 'RESOLUTION' ? (
        <Card>
          <h2 className="font-display text-lg mb-2">Commitments revealed</h2>
          <ul className="flex flex-col gap-1.5">
            {[...view.players]
              .sort((a, b) => (result.commitments[b.id] ?? 0) - (result.commitments[a.id] ?? 0))
              .map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm anim-rise">
                  <Avatar player={p} size={26} />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="font-mono">{result.commitments[p.id] ?? 0} cr</span>
                  <span className="font-mono w-16 text-right text-[var(--color-gold)]">
                    {result.influence[p.id] ? `+${result.influence[p.id]}` : ''}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <h2 className="font-display text-lg mb-2">Standings</h2>
          <ol className="flex flex-col gap-1.5">
            {ranked.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-[var(--color-muted)] font-mono">{i + 1}</span>
                <Avatar player={p} size={26} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="font-mono text-[var(--color-gold)]">{p.influence}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-[var(--color-muted)] mt-2">
            Influence is public. Credits stay secret until the final reckoning.
          </p>
          <p className="text-sm mt-3">
            {view.round < view.totalRounds
              ? `Next: operation ${view.round + 1} of ${view.totalRounds}.`
              : 'Next: the final reckoning.'}
          </p>
        </Card>
      )}

      <Dossier view={view} />

      {myDeals.length > 0 && (
        <Card aria-label="Promises">
          <h2 className="font-display text-lg mb-2">Promises this round</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {myDeals.map((d) => (
              <li key={d.id}>
                <p className="text-[var(--color-muted)]">
                  {d.terms
                    .filter((t) => t.kind === 'commit')
                    .map(termText)
                    .join('; ')}
                </p>
                <p>
                  {Object.entries(d.kept ?? {}).map(([id, kept]) => (
                    <span
                      key={id}
                      className="mr-3"
                      style={{ color: kept ? 'var(--color-success)' : 'var(--color-danger)' }}
                    >
                      {nameOf(view, id)} {kept ? 'kept it' : 'broke it'}
                    </span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <ReadyBar view={view} act={act} label="Continue" />
    </div>
  );
}
