import type { LogEntry, PlayerView } from '@syndicate/game-engine';
import { Card, ConfirmDialog, PrivateLabel } from '@syndicate/ui';
import { useState } from 'react';
import { pct } from '../lib/format';
import {
  abilityButton,
  abilityText,
  ARCHETYPE_TAGLINE,
  OBJECTIVE_NAME,
  objectiveText,
} from '../lib/roles';
import type { GameProps } from '../screens/Room';
import { Avatar, nameOf } from './Players';
import { RoleSigil } from './RoleSigil';

/** The private role card: who you are, what you can do, what you secretly want. */
export function RoleCard({ view, compact = false }: { view: PlayerView; compact?: boolean }) {
  const role = view.self.role;
  if (!role) return null;
  return (
    <section className="card-private p-4" aria-label="Your secret role" data-testid="role-card">
      <div className="flex items-center justify-between mb-2">
        <PrivateLabel>Your secret role</PrivateLabel>
        <span className="chip" aria-label={`${role.charges} of ${role.maxCharges} uses left`}>
          {'●'.repeat(role.charges)}
          <span className="opacity-30">{'●'.repeat(role.maxCharges - role.charges)}</span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <RoleSigil archetype={role.archetype} size={compact ? 44 : 64} />
        <div className="min-w-0">
          <h2 className="font-display text-2xl leading-tight" data-testid="role-name">
            {role.name}
          </h2>
          <p className="text-sm text-[var(--color-muted)]">{ARCHETYPE_TAGLINE[role.archetype]}</p>
        </div>
      </div>
      {!compact && <p className="text-sm mt-3">{abilityText(role)}</p>}
      {view.self.objective && (
        <p className="text-sm mt-3 border-t border-[rgba(52,227,210,0.3)] pt-3">
          <span className="label-private">Hidden objective · +{view.self.objective.bonus}</span>
          <br />
          <strong>{OBJECTIVE_NAME[view.self.objective.id]}:</strong>{' '}
          {objectiveText(view.self.objective)}
        </p>
      )}
    </section>
  );
}

function needsTiming(view: PlayerView): boolean {
  const role = view.self.role;
  if (!role) return false;
  if (role.ability === 'peek') return view.phase === 'INTELLIGENCE' || view.phase === 'NEGOTIATION';
  if (role.ability === 'investigate')
    return (view.phase === 'INTELLIGENCE' || view.phase === 'NEGOTIATION') && view.round > 1;
  return view.phase === 'COMMITMENT' && view.self.committed === null;
}

/** Use the role ability now. Every use is confirmed because it cannot be undone. */
export function AbilityPanel({ view, act }: GameProps) {
  const role = view.self.role;
  const [target, setTarget] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>('current');
  const [targetRound, setTargetRound] = useState<number>(Math.max(1, view.round - 1));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!role || !needsTiming(view)) return null;
  const used = view.self.abilityUsedThisRound;
  const empty = role.charges <= 0;
  const others = view.players.filter((p) => p.id !== view.self.id);
  const needsTarget = role.ability === 'insure' || role.ability === 'investigate';
  const needsRound = role.ability === 'investigate' && role.params.scope !== 'history';
  const ready = !needsTarget || target !== null;

  const command = () => {
    const c: { type: 'useAbility'; target?: string; choice?: string; targetRound?: number } = {
      type: 'useAbility',
    };
    if (needsTarget && target) c.target = target;
    if (role.ability === 'peek' || role.ability === 'forecast') c.choice = choice;
    if (needsRound) c.targetRound = targetRound;
    return c;
  };

  return (
    <section className="card-private p-4" aria-label="Your ability" data-testid="ability-panel">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-lg">{abilityButton(role)}</h2>
        <PrivateLabel />
      </div>
      {used ? (
        <p className="text-sm">
          Used this operation ✓ (confirmed). Results appear in your dossier.
        </p>
      ) : empty ? (
        <p className="text-sm text-[var(--color-muted)]">No uses left.</p>
      ) : (
        <>
          <p className="text-sm text-[var(--color-muted)] mb-3">{abilityText(role)}</p>
          {role.ability === 'peek' && (
            <div className="flex gap-2 mb-3" role="radiogroup" aria-label="Which operation">
              <Pick on={choice === 'current'} onClick={() => setChoice('current')}>
                This operation
              </Pick>
              {Number(role.params.allowNext) === 1 && view.round < view.totalRounds && (
                <Pick on={choice === 'next'} onClick={() => setChoice('next')}>
                  Next operation
                </Pick>
              )}
            </div>
          )}
          {role.ability === 'forecast' && (
            <div className="flex gap-2 mb-3" role="radiogroup" aria-label="Forecast">
              <Pick on={choice === 'SUCCESS'} onClick={() => setChoice('SUCCESS')}>
                It succeeds
              </Pick>
              <Pick on={choice === 'FAILURE'} onClick={() => setChoice('FAILURE')}>
                It fails
              </Pick>
            </div>
          )}
          {needsTarget && (
            <div
              className="flex flex-wrap gap-1.5 mb-3"
              role="radiogroup"
              aria-label="Target player"
            >
              {(role.ability === 'insure' && Number(role.params.allowSelf) === 1
                ? view.players
                : others
              ).map((p) => (
                <Pick key={p.id} on={target === p.id} onClick={() => setTarget(p.id)}>
                  <Avatar player={p} size={18} /> {p.id === view.self.id ? 'Yourself' : p.name}
                </Pick>
              ))}
            </div>
          )}
          {needsRound && (
            <div
              className="flex flex-wrap gap-1.5 mb-3"
              role="radiogroup"
              aria-label="Operation to inspect"
            >
              {view.history.map((h) => (
                <Pick
                  key={h.round}
                  on={targetRound === h.round}
                  onClick={() => setTargetRound(h.round)}
                >
                  Op {h.round}
                </Pick>
              ))}
            </div>
          )}
          <button
            type="button"
            className="btn btn-private btn-block"
            disabled={
              !ready ||
              busy ||
              (role.ability === 'forecast' && choice !== 'SUCCESS' && choice !== 'FAILURE')
            }
            onClick={() => setConfirm(true)}
          >
            {busy ? 'Working…' : abilityButton(role)}
          </button>
        </>
      )}
      <ConfirmDialog
        open={confirm}
        title={`${abilityButton(role)}?`}
        confirmLabel="Do it"
        tone="private"
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          setBusy(true);
          await act(command(), { phaseBound: true });
          setBusy(false);
        }}
      >
        This uses one charge ({role.charges} left) and cannot be undone. Nobody else is told you did
        it.
      </ConfirmDialog>
    </section>
  );
}

function Pick({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className="chip min-h-[40px]"
      style={on ? { borderColor: 'var(--color-teal)', color: 'var(--color-teal)' } : undefined}
    >
      {children}
    </button>
  );
}

/** Public accusations, and the viewer's own accuse control during negotiation. */
export function Accusations({ view, act }: GameProps) {
  const [target, setTarget] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (!view.features.roles) return null;
  const canAccuse =
    view.phase === 'NEGOTIATION' &&
    view.self.accusationsLeft > 0 &&
    !view.accusations.some((a) => a.accuser === view.self.id && a.round === view.round);
  const candidates = view.players.filter((p) => p.id !== view.self.id && !p.exposed);
  return (
    <Card aria-label="Accusations">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-lg">Accusations</h2>
        <span className="label-public">Public</span>
      </div>
      <p className="text-sm text-[var(--color-muted)] mb-3">
        Think someone is a saboteur? Accuse them. A correct accusation earns 2 at the end; a wrong
        one costs 1. It raises their suspicion either way. You have {view.self.accusationsLeft}{' '}
        left.
      </p>
      {view.accusations.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm mb-3">
          {view.accusations.map((a, i) => (
            <li key={i}>
              Op {a.round}: <strong>{nameOf(view, a.accuser)}</strong> accused{' '}
              <strong>{nameOf(view, a.target)}</strong>
            </li>
          ))}
        </ul>
      )}
      {canAccuse && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3" role="radiogroup" aria-label="Accuse">
            {candidates.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={target === p.id}
                onClick={() => setTarget(p.id)}
                className="chip min-h-[40px]"
                style={
                  target === p.id
                    ? { borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }
                    : undefined
                }
              >
                <Avatar player={p} size={18} /> {p.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-danger btn-block"
            disabled={!target}
            onClick={() => setConfirm(true)}
          >
            Accuse {target ? nameOf(view, target) : '…'}
          </button>
        </>
      )}
      <ConfirmDialog
        open={confirm}
        title={`Accuse ${target ? nameOf(view, target) : ''}?`}
        confirmLabel="Accuse publicly"
        tone="danger"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          if (target) void act({ type: 'accuse', target }, { phaseBound: true });
          setTarget(null);
        }}
      >
        Everyone will see this. It cannot be withdrawn.
      </ConfirmDialog>
    </Card>
  );
}

function describe(view: PlayerView, e: LogEntry): string | null {
  const d = e.data;
  switch (e.kind) {
    case 'ability_result':
      if (d.ability === 'peek')
        return `Op ${d.round} (${String(d.name)}): true odds about ${pct(Number(d.estimate))}.`;
      if (d.ability === 'investigate') {
        const who = nameOf(view, String(d.target));
        if (d.signal === 'sabotage')
          return `${who} ${d.result ? 'HAS' : 'has not'} sabotaged an operation${Number(d.round) ? ` in op ${d.round}` : ' so far'}.`;
        return `${who} ${d.result ? 'DID' : 'did not'} use a secret ability in op ${d.round}.`;
      }
      return null;
    case 'insured':
      return d.insurer === view.self.id
        ? `Your insurance ${Number(d.refund) > 0 ? `refunded ${d.refund} credits` : 'was not needed'}.`
        : `${nameOf(view, String(d.insurer))} insured your commitment${Number(d.refund) > 0 ? ` and refunded ${d.refund} credits` : ''}.`;
    case 'bonus':
      return `+${d.amount} influence (${d.source === 'patron' ? 'a gift from a patron' : String(d.source)}).`;
    default:
      return null;
  }
}

/** Private results of abilities: what only you have learned. */
export function Dossier({ view }: { view: PlayerView }) {
  const items = view.log.map((e) => ({ e, text: describe(view, e) })).filter((x) => x.text);
  if (!view.self.role || items.length === 0) return null;
  return (
    <section className="card-private p-4" aria-label="Your dossier" data-testid="dossier">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-lg">Your dossier</h2>
        <PrivateLabel />
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {items.slice(-8).map(({ e, text }) => (
          <li key={e.id}>
            <span className="text-[var(--color-faint)]">Op {e.round}:</span> {text}
          </li>
        ))}
      </ul>
    </section>
  );
}
