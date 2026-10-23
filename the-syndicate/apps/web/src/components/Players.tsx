import type { PlayerView, PublicPlayer } from '@syndicate/game-engine';
import { AVATAR_GLYPH } from '../lib/format';

export function Avatar({
  player,
  size = 36,
}: {
  player: Pick<PublicPlayer, 'avatar' | 'name'>;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
    >
      {AVATAR_GLYPH[player.avatar]}
    </span>
  );
}

export function nameOf(view: PlayerView, id: string): string {
  return view.players.find((p) => p.id === id)?.name ?? 'Someone';
}

/** Compact roster with public status only: connection, readiness or sealed, influence. */
export function PlayerStrip({
  view,
  mode,
}: {
  view: PlayerView;
  mode: 'ready' | 'sealed' | 'none';
}) {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2" aria-label="Players">
      {view.players.map((p) => {
        const done = mode === 'sealed' ? p.sealed : mode === 'ready' ? p.ready : false;
        const status = !p.connected
          ? 'offline'
          : mode === 'sealed'
            ? p.sealed
              ? 'sealed'
              : 'deciding'
            : mode === 'ready'
              ? p.ready
                ? 'ready'
                : 'not ready'
              : '';
        return (
          <li
            key={p.id}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 min-w-0"
            style={{ opacity: p.connected ? 1 : 0.55 }}
            data-testid={`player-${p.seat}`}
          >
            <Avatar player={p} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {p.name}
                {p.id === view.self.id && (
                  <span className="text-[var(--color-faint)] font-normal"> (you)</span>
                )}
                {p.id === view.hostId && (
                  <span className="text-[var(--color-gold)] font-normal" title="Host">
                    {' '}
                    ★
                  </span>
                )}
              </span>
              <span className="block text-xs text-[var(--color-muted)]">
                {view.phase === 'LOBBY'
                  ? status
                  : `${p.influence} influence${status ? ` · ${status}` : ''}`}
              </span>
              {view.features.roles && view.phase !== 'LOBBY' && (p.suspicion > 0 || p.exposed) && (
                <span className="block text-xs" style={{ color: 'var(--color-danger)' }}>
                  {p.exposed && <strong>EXPOSED · </strong>}
                  <span aria-label={`suspicion ${p.suspicion}`}>
                    suspicion {'▲'.repeat(p.suspicion)}
                  </span>
                </span>
              )}
            </span>
            {done && (
              <span
                aria-label={status}
                className="text-[var(--color-success)] text-lg"
                title={status}
              >
                ✓
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ReadyBar({
  view,
  act,
  label,
  doneLabel = 'Waiting for the others…',
}: {
  view: PlayerView;
  act: (c: { type: 'setReady'; ready: boolean }) => Promise<boolean>;
  label: string;
  doneLabel?: string;
}) {
  const me = view.players.find((p) => p.id === view.self.id);
  const connected = view.players.filter((p) => p.connected);
  const ready = connected.filter((p) => p.ready).length;
  return (
    <div
      className="fixed bottom-0 inset-x-0 z-20 bg-[rgba(10,15,30,0.95)] border-t border-[var(--color-border)] px-4 py-3"
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        <p className="text-sm text-[var(--color-muted)] flex-1" aria-live="polite">
          {ready} of {connected.length} ready
        </p>
        <button
          type="button"
          className={`btn ${me?.ready ? 'btn-secondary' : 'btn-primary'} min-w-[44%]`}
          onClick={() => act({ type: 'setReady', ready: !me?.ready })}
          aria-pressed={Boolean(me?.ready)}
        >
          {me?.ready ? doneLabel : label}
        </button>
      </div>
    </div>
  );
}
