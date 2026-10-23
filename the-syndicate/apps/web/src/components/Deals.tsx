import type { Deal, DealTerm, PlayerView } from '@syndicate/game-engine';
import { Card } from '@syndicate/ui';
import { useState } from 'react';
import type { GameProps } from '../screens/Room';
import { Avatar, nameOf } from './Players';

export function termText(term: DealTerm): string {
  switch (term.kind) {
    case 'commit':
      return `Each of us commits at least ${term.amount} credit${term.amount === 1 ? '' : 's'} this operation`;
    case 'shareIntel':
      return 'We share our intel honestly';
    case 'noAccuse':
      return "We don't accuse each other";
    case 'backNext':
      return 'We back each other next round';
  }
}

function responseLabel(r: Deal['responses'][string]): string {
  return r === 'accepted' ? 'accepted' : r === 'declined' ? 'declined' : 'thinking';
}

function DealItem({ deal, view, act }: { deal: Deal; view: PlayerView; act: GameProps['act'] }) {
  const mine = deal.responses[view.self.id];
  const canAnswer =
    mine === 'pending' &&
    ['INTELLIGENCE', 'NEGOTIATION', 'COMMITMENT'].includes(view.phase) &&
    deal.round === view.round;
  return (
    <li
      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-2)] p-3"
      data-testid="deal"
    >
      <p className="text-xs text-[var(--color-muted)] mb-1">
        {deal.proposer === view.self.id
          ? 'You proposed'
          : `${nameOf(view, deal.proposer)} proposed`}{' '}
        · round {deal.round}
      </p>
      <ul className="text-sm list-disc pl-5 mb-2">
        {deal.terms.map((t) => (
          <li key={t.kind}>{termText(t)}</li>
        ))}
        {deal.note && (
          <li className="italic text-[var(--color-muted)] list-none -ml-5">“{deal.note}”</li>
        )}
      </ul>
      <ul className="flex flex-wrap gap-1.5 mb-2">
        {deal.members.map((id) => {
          const p = view.players.find((x) => x.id === id);
          const kept = deal.kept?.[id];
          return (
            <li key={id} className="chip">
              {p && <Avatar player={p} size={18} />}
              {nameOf(view, id)}:{' '}
              {kept === undefined
                ? responseLabel(deal.responses[id] ?? 'pending')
                : kept
                  ? 'kept it ✓'
                  : 'broke it ✗'}
            </li>
          );
        })}
      </ul>
      {canAnswer && (
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm flex-1"
            onClick={() => act({ type: 'respondDeal', dealId: deal.id, accept: true })}
          >
            Accept
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm flex-1"
            onClick={() => act({ type: 'respondDeal', dealId: deal.id, accept: false })}
          >
            Decline
          </button>
        </div>
      )}
    </li>
  );
}

export function Deals({ view, act }: GameProps) {
  const [open, setOpen] = useState(false);
  const [invitees, setInvitees] = useState<string[]>([]);
  const [commit, setCommit] = useState<number | null>(2);
  const [extra, setExtra] = useState<DealTerm['kind'][]>([]);
  const [note, setNote] = useState('');
  const canPropose = view.phase === 'INTELLIGENCE' || view.phase === 'NEGOTIATION';
  const deals = [...view.deals].reverse();
  const others = view.players.filter((p) => p.id !== view.self.id);

  async function propose() {
    const terms: DealTerm[] = [];
    if (commit) terms.push({ kind: 'commit', amount: commit });
    for (const kind of extra) terms.push({ kind } as DealTerm);
    if (terms.length === 0 || invitees.length === 0) return;
    if (
      await act({ type: 'proposeDeal', invitees, terms, note: note.trim() }, { phaseBound: true })
    ) {
      setOpen(false);
      setInvitees([]);
      setNote('');
    }
  }

  return (
    <Card aria-label="Deals">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-lg">Deals</h2>
        <span className="text-xs text-[var(--color-muted)]">Only members see a deal</span>
      </div>
      <p className="text-sm text-[var(--color-muted)] mb-3">
        Deals are <strong className="text-[var(--color-text)]">promises, not contracts</strong>. The
        game never forces anyone to keep them, but after the reveal every member sees who did.
      </p>
      {deals.length > 0 && (
        <ul className="flex flex-col gap-2 mb-3">
          {deals.map((d) => (
            <DealItem key={d.id} deal={d} view={view} act={act} />
          ))}
        </ul>
      )}
      {canPropose && !open && (
        <button type="button" className="btn btn-secondary btn-block" onClick={() => setOpen(true)}>
          Propose a deal
        </button>
      )}
      {canPropose && open && (
        <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-3">
          <fieldset>
            <legend className="eyebrow mb-2">With</legend>
            <div className="flex flex-wrap gap-1.5">
              {others.map((p) => {
                const on = invitees.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    className="chip min-h-[40px]"
                    style={
                      on
                        ? { borderColor: 'var(--color-gold)', color: 'var(--color-gold-strong)' }
                        : undefined
                    }
                    onClick={() =>
                      setInvitees(on ? invitees.filter((x) => x !== p.id) : [...invitees, p.id])
                    }
                  >
                    <Avatar player={p} size={20} /> {p.name}
                  </button>
                );
              })}
              <button
                type="button"
                className="chip min-h-[40px]"
                onClick={() => setInvitees(others.map((p) => p.id))}
              >
                Everyone
              </button>
            </div>
          </fieldset>
          <fieldset>
            <legend className="eyebrow mb-2">Promises</legend>
            <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="Commit at least">
              {[null, 1, 2, 3].map((n) => (
                <button
                  key={String(n)}
                  type="button"
                  aria-pressed={commit === n}
                  className="chip min-h-[40px]"
                  style={commit === n ? { borderColor: 'var(--color-gold)' } : undefined}
                  onClick={() => setCommit(n)}
                >
                  {n === null ? 'No commit promise' : `Commit ≥ ${n}`}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['shareIntel', 'noAccuse', 'backNext'] as const).map((kind) => {
                const on = extra.includes(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={on}
                    className="chip min-h-[40px]"
                    style={on ? { borderColor: 'var(--color-gold)' } : undefined}
                    onClick={() =>
                      setExtra(on ? extra.filter((k) => k !== kind) : [...extra, kind])
                    }
                  >
                    {termText({ kind } as DealTerm)}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {!view.settings.presetChatOnly && (
            <label className="flex flex-col gap-1">
              <span className="eyebrow">Note (optional)</span>
              <input
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 80))}
                maxLength={80}
                placeholder="e.g. trust me on this one"
              />
            </label>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={invitees.length === 0 || (!commit && extra.length === 0)}
              onClick={propose}
            >
              Send proposal
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
