import { Counter } from '@syndicate/ui';
import { useState, useSyncExternalStore } from 'react';
import { PHASE_HINT, PHASE_LABEL, useServerNow } from '../lib/format';
import { onSoundChange, setSoundEnabled, soundEnabled } from '../lib/sound';
import { DeviceDialog } from './DeviceDialog';
import { HelpDialog } from './HelpDialog';
import type { GameProps } from '../screens/Room';

/** Always visible: phase, round, time left, and the viewer's resources. */
export function Header({
  view,
  clockOffset,
  roomCode,
  pendingCount,
}: GameProps & { pendingCount: number }) {
  const now = useServerNow(clockOffset);
  const me = view.players.find((p) => p.id === view.self.id);
  const total = view.phaseEndsAt ? view.phaseEndsAt - view.phaseStartedAt : 0;
  const left = view.phaseEndsAt ? Math.max(0, view.phaseEndsAt - now) : 0;
  const seconds = Math.ceil(left / 1000);
  const fraction = total > 0 ? left / total : 0;
  const inMatch = view.phase !== 'LOBBY' && view.phase !== 'RESULTS';
  const [help, setHelp] = useState(false);
  const [device, setDevice] = useState(false);
  const sound = useSyncExternalStore(onSoundChange, soundEnabled);
  return (
    <header className="sticky top-0 z-30 bg-[rgba(10,15,30,0.92)] backdrop-blur border-b border-[var(--color-border)]">
      <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="eyebrow truncate">
            {inMatch && view.round > 0 ? (
              <>
                <span className="sm:hidden">
                  Op {view.round}/{view.totalRounds}
                </span>
                <span className="hidden sm:inline">
                  Operation {view.round} of {view.totalRounds}
                </span>
              </>
            ) : (
              `Room ${roomCode}`
            )}
            {pendingCount > 0 && <span className="ml-2 text-[var(--color-teal)]">· sending…</span>}
          </p>
          <h1 className="font-display text-lg sm:text-xl truncate" data-testid="phase-title">
            {PHASE_LABEL[view.phase]}
          </h1>
        </div>
        {view.phaseEndsAt && (
          <div className="text-right" aria-label={`${seconds} seconds left`}>
            <span
              className="font-mono text-2xl tabular-nums"
              style={{ color: seconds <= 5 ? 'var(--color-danger)' : 'var(--color-text)' }}
              data-testid="countdown"
            >
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </span>
          </div>
        )}
        {inMatch && (
          <div className="flex gap-3 pl-3 border-l border-[var(--color-border)]">
            <Counter
              label="credits 🔒"
              value={<span data-testid="my-credits">{view.self.credits}</span>}
              tone="private"
            />
            <Counter
              label="influence"
              value={<span data-testid="my-influence">{me?.influence ?? 0}</span>}
              tone="gold"
            />
          </div>
        )}
      </div>
      {view.phaseEndsAt && (
        <div className="timer-track" aria-hidden="true">
          <div
            className="timer-fill"
            data-urgent={seconds <= 5}
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
      )}
      <div className="max-w-3xl mx-auto px-4 py-1 flex items-center gap-2">
        <p className="flex-1 text-xs text-[var(--color-muted)]">{PHASE_HINT[view.phase]}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHelp(true)}>
          Rules
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label="Use on another device"
          title="Use on another device"
          onClick={() => setDevice(true)}
        >
          <span aria-hidden="true">📱</span>
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-pressed={sound}
          aria-label={sound ? 'Sound on' : 'Sound off'}
          onClick={() => setSoundEnabled(!sound)}
        >
          <span aria-hidden="true">{sound ? '🔊' : '🔇'}</span>
        </button>
      </div>
      {help && <HelpDialog view={view} onClose={() => setHelp(false)} />}
      {device && <DeviceDialog roomCode={roomCode} onClose={() => setDevice(false)} />}
    </header>
  );
}
