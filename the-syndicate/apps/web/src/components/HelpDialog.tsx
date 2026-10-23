import type { PlayerView } from '@syndicate/game-engine';
import { useDialogFocus } from '@syndicate/ui';
import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { abilityText, ARCHETYPE_TAGLINE } from '../lib/roles';
import { RoleSigil } from './RoleSigil';

type Tab = 'play' | 'roles' | 'score';

/** Rules reference, available at any moment from the header. Built from the room's own rules. */
export function HelpDialog({ view, onClose }: { view: PlayerView; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('play');
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(true, onClose, closeRef);
  const r = view.rules;
  const tabs: [Tab, string][] = [
    ['play', 'How to play'],
    ...(r.roleCatalog.length ? ([['roles', 'Roles']] as [Tab, string][]) : []),
    ['score', 'Scoring'],
  ];
  // Portal to <body>: the sticky header uses backdrop-filter, which would otherwise
  // become the containing block for this fixed-position overlay.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card anim-rise w-full max-w-lg max-h-[85dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 pb-2">
          <h2 id={titleId} className="font-display text-xl">
            Rules
          </h2>
          <button ref={closeRef} type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div role="tablist" aria-label="Rules sections" className="flex gap-1 px-4">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`btn btn-sm ${tab === id ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          tabIndex={0}
          className="overflow-y-auto p-4 text-sm flex flex-col gap-3"
        >
          {tab === 'play' && (
            <>
              <p>
                Each of {r.roundsStandard} operations (quick match: {r.roundsQuick}) has three
                steps, then a reveal:
              </p>
              <ol className="list-decimal pl-5 flex flex-col gap-1.5">
                <li>
                  <strong>Intelligence.</strong> Read the public odds window and your private rumor.
                  You may pay 1 credit for a sharper estimate.
                </li>
                <li>
                  <strong>Negotiation.</strong> Chat, propose deals and accuse suspected saboteurs.
                  Deals are promises, not contracts.
                </li>
                <li>
                  <strong>Commitment.</strong> Use your ability if it acts now, then seal 0-
                  {r.maxCommit} credits. Nobody sees amounts until the reveal; if time runs out you
                  commit 0.
                </li>
                <li>
                  <strong>Outcome.</strong> If the table commits at least the target, odds rise{' '}
                  {Math.round(r.targetBonus * 100)} points. On success backers get their credits
                  back and split the pool (at most {r.shareCapPerCredit} influence per credit). On
                  failure they lose what they committed. Sitting out pays {r.sitOutCredits} credit.
                </li>
              </ol>
              <p>
                <a
                  href="/how-to-play"
                  target="_blank"
                  rel="noopener"
                  className="text-[var(--color-teal)] underline"
                >
                  Open the full how-to-play guide
                </a>{' '}
                (new tab, your game stays open).
              </p>
              <p className="text-[var(--color-muted)]">
                Anything framed in teal is private to you. Gold is public. Phases end early once
                everyone connected is done.
              </p>
            </>
          )}
          {tab === 'roles' && (
            <ul className="flex flex-col gap-3">
              {r.roleCatalog.map((role) => (
                <li key={role.id} className="flex gap-3">
                  <RoleSigil archetype={role.archetype} size={40} />
                  <div>
                    <p className="font-display text-base">
                      {role.name}{' '}
                      <span className="text-[var(--color-muted)] text-xs">
                        {ARCHETYPE_TAGLINE[role.archetype]}
                      </span>
                    </p>
                    <p className="text-[var(--color-muted)]">
                      {abilityText({ ...role, charges: role.maxCharges })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {tab === 'score' && (
            <>
              <p>
                <strong>Score</strong> = influence + 1 point per {r.creditsPerScorePoint} credits
                left + your hidden objective (if completed) + correct accusations − penalties.
              </p>
              {r.roleCatalog.length > 0 && (
                <ul className="list-disc pl-5 flex flex-col gap-1">
                  <li>
                    A correct accusation of a saboteur earns 2 (auditors 4); a wrong one costs 1.
                    Two per match.
                  </li>
                  <li>Suspicion above 2 costs a point per level at the end, at most 3.</li>
                  <li>Exposed sabotage and wrong opportunist forecasts carry small fines.</li>
                </ul>
              )}
              <p>
                Ties go to more influence, then less suspicion, then more credits; anyone still
                level shares the win.
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
