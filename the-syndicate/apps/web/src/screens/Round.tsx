import { Card, ConfirmDialog, PrivateLabel } from '@syndicate/ui';
import { useState } from 'react';
import { Chat } from '../components/Chat';
import { Deals } from '../components/Deals';
import { OperationCard } from '../components/OperationCard';
import { PlayerStrip, ReadyBar } from '../components/Players';
import { pct } from '../lib/format';
import type { GameProps } from './Room';

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <aside
      className="rounded-[var(--radius)] border border-dashed border-[var(--color-gold)] p-3 text-sm bg-[rgba(216,180,111,0.06)]"
      aria-label="Tip"
    >
      <span className="label-public">First-round tip</span>
      <p className="mt-1">{children}</p>
    </aside>
  );
}

function IntelPanel({ view, act }: GameProps) {
  const [confirm, setConfirm] = useState(false);
  const reports = view.self.intel.filter((r) => r.targetRound === view.round);
  const canBuy =
    (view.phase === 'INTELLIGENCE' || view.phase === 'NEGOTIATION') && !view.self.boughtIntel;
  return (
    <section className="card-private p-4" aria-label="Your private intel" data-testid="intel-panel">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-lg">Your intel</h2>
        <PrivateLabel />
      </div>
      <ul className="flex flex-col gap-2">
        {reports.map((r, i) => (
          <li key={i} className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-[var(--color-muted)]">
              {r.source === 'rumor' ? 'Street rumor' : 'Paid contact'}
            </span>
            <span className="font-mono text-lg">
              ~{pct(r.estimate)}{' '}
              <span className="text-xs text-[var(--color-muted)]">
                ± {Math.round(r.margin * 100)} pts
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--color-muted)] mt-2">
        Estimates of the base success chance. Others got their own, different estimates.
      </p>
      {canBuy && (
        <button
          type="button"
          className="btn btn-private btn-sm mt-3"
          onClick={() => setConfirm(true)}
          disabled={view.self.credits < view.self.intelCost}
        >
          Pay a contact ({view.self.intelCost === 0 ? 'free' : `${view.self.intelCost} credit`}) for
          a sharper estimate
        </button>
      )}
      <ConfirmDialog
        open={confirm}
        title="Pay your contact?"
        confirmLabel={view.self.intelCost === 0 ? 'Ask' : `Pay ${view.self.intelCost} credit`}
        tone="private"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void act({ type: 'buyIntel' }, { phaseBound: true });
        }}
      >
        You get one more private estimate, about twice as precise as the rumor. Once per operation.
      </ConfirmDialog>
    </section>
  );
}

function CommitPanel({ view, act }: GameProps) {
  const op = view.operation;
  const [amount, setAmount] = useState(Math.min(2, view.self.maxCommit));
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const sealed = view.self.committed;
  if (!op) return null;
  if (sealed !== null) {
    return (
      <section
        className="card-private p-4 text-center"
        aria-label="Your sealed commitment"
        data-testid="sealed"
      >
        <PrivateLabel>Sealed · only you know the amount</PrivateLabel>
        <p className="font-display text-3xl my-2">
          {sealed} credit{sealed === 1 ? '' : 's'}{' '}
          <span className="text-[var(--color-success)]">✓</span>
        </p>
        <p className="text-sm text-[var(--color-muted)]">
          Confirmed by the server. Waiting for the others.
        </p>
      </section>
    );
  }
  return (
    <section className="card-private p-4" aria-label="Seal your commitment">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-lg">Seal your commitment</h2>
        <PrivateLabel />
      </div>
      <div role="radiogroup" aria-label="Credits to commit" className="grid grid-cols-4 gap-2 mb-3">
        {[0, 1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={amount === n}
            disabled={n > view.self.maxCommit}
            onClick={() => setAmount(n)}
            className={`btn text-xl font-mono ${amount === n ? 'btn-private' : 'btn-secondary'}`}
            data-testid={`commit-${n}`}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="text-sm text-[var(--color-muted)] mb-3" aria-live="polite">
        {amount === 0
          ? `Sit this one out: you risk nothing and pick up ${view.rules.sitOutCredits} credit from side jobs.`
          : `If it succeeds you get your ${amount} back plus a share of ${op.pool} influence (up to ${Math.floor(view.rules.shareCapPerCredit * amount)}). If it fails you lose ${amount}.`}
      </p>
      <button
        type="button"
        className="btn btn-private btn-block"
        disabled={sending}
        onClick={() => setConfirm(true)}
      >
        {sending ? 'Sealing…' : `Seal ${amount} credit${amount === 1 ? '' : 's'}`}
      </button>
      <ConfirmDialog
        open={confirm}
        title={`Seal ${amount} credit${amount === 1 ? '' : 's'}?`}
        confirmLabel="Seal it"
        tone="private"
        busy={sending}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          setSending(true);
          await act({ type: 'commit', amount }, { phaseBound: true });
          setSending(false);
        }}
      >
        A sealed commitment cannot be changed. Nobody sees the amount until the reveal.
      </ConfirmDialog>
    </section>
  );
}

function Table({ view }: { view: GameProps['view'] }) {
  return (
    <Card aria-label="The table">
      <h2 className="font-display text-lg mb-2">The table</h2>
      <PlayerStrip view={view} mode="ready" />
    </Card>
  );
}

export function Round(props: GameProps) {
  const { view, act } = props;
  const op = view.operation;
  const firstRound = view.settings.beginner && view.round === 1;
  if (!op) return null;
  return (
    <div className="flex flex-col gap-4">
      {view.phase === 'INTELLIGENCE' && (
        <>
          {firstRound && (
            <Tip>
              The odds window is public. Your intel (teal) is private and imperfect; compare it with
              what others claim during negotiation.
            </Tip>
          )}
          <OperationCard
            op={op}
            targetBonus={view.rules.targetBonus}
            capPerCredit={view.rules.shareCapPerCredit}
          />
          <IntelPanel {...props} />
          <Table view={view} />
          <Deals {...props} />
          <ReadyBar view={view} act={act} label="Done studying" />
        </>
      )}
      {view.phase === 'NEGOTIATION' && (
        <>
          {firstRound && (
            <Tip>
              Coordinate to reach the target, or bluff to keep the pool for yourself. Anything you
              promise here is not enforced.
            </Tip>
          )}
          <OperationCard
            op={op}
            targetBonus={view.rules.targetBonus}
            capPerCredit={view.rules.shareCapPerCredit}
            compact
          />
          <IntelPanel {...props} />
          <Chat {...props} />
          <Table view={view} />
          <Deals {...props} />
          <ReadyBar view={view} act={act} label="Done negotiating" />
        </>
      )}
      {view.phase === 'COMMITMENT' && (
        <>
          {firstRound && (
            <Tip>
              Pick an amount and seal it. If you run out of time you commit 0 automatically.
            </Tip>
          )}
          <CommitPanel {...props} />
          <OperationCard
            op={op}
            targetBonus={view.rules.targetBonus}
            capPerCredit={view.rules.shareCapPerCredit}
            compact
          />
          <Card>
            <h2 className="font-display text-lg mb-2">Who has sealed</h2>
            <PlayerStrip view={view} mode="sealed" />
          </Card>
          <Deals {...props} />
          <Chat {...props} compact />
        </>
      )}
    </div>
  );
}
