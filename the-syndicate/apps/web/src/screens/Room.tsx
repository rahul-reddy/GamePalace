import type { PlayerCommand, PlayerView } from '@syndicate/game-engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { Toasts, type Toast } from '../components/Toasts';
import { CommandError } from '../lib/connection';
import { PHASE_LABEL } from '../lib/format';
import { navigate } from '../lib/router';
import { acceptTransferredSeat, forgetSeat, loadSeat } from '../lib/session';
import { play } from '../lib/sound';
import { useRoom } from '../lib/useRoom';
import { Briefing } from './Briefing';
import { Final } from './Final';
import { Lobby } from './Lobby';
import { Outcome } from './Outcome';
import { Round } from './Round';

export interface GameProps {
  view: PlayerView;
  /** Sends a command; resolves only after the server acknowledges it. */
  act: (
    command: PlayerCommand,
    opts?: { phaseBound?: boolean; quiet?: boolean },
  ) => Promise<boolean>;
  clockOffset: number;
  roomCode: string;
}

export function RoomScreen({ code }: { code: string }) {
  acceptTransferredSeat(code);
  const seat = loadSeat(code);
  useEffect(() => {
    if (!seat) navigate(`/join/${code}`, true);
  }, [seat, code]);
  const room = useRoom(code, seat?.token ?? null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const notify = useCallback((text: string, tone: Toast['tone'] = 'error') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  const connection = room.connection;
  const act = useCallback<GameProps['act']>(
    async (command, opts = {}) => {
      if (!connection) return false;
      try {
        await connection.send(command, opts);
        return true;
      } catch (err) {
        if (!opts.quiet) notify(err instanceof CommandError ? err.message : 'That did not work.');
        return false;
      }
    },
    [connection, notify],
  );

  // Announced to screen readers whenever the phase (or round) changes.
  const phase = room.view?.phase;
  const announcement = phase ? `${PHASE_LABEL[phase]} phase, round ${room.view?.round ?? 0}` : '';

  // Sound cues (only when the player has turned sound on).
  const outcome = room.view?.operation?.result?.status;
  useEffect(() => {
    if (!phase) return;
    if (phase === 'RESOLUTION')
      play(outcome === 'SUCCESS' ? 'success' : outcome === 'FAILURE' ? 'failure' : 'phase');
    else play('phase');
  }, [phase, outcome]);
  const sealed = room.view?.self.committed !== null && room.view?.self.committed !== undefined;
  useEffect(() => {
    if (sealed) play('sealed');
  }, [sealed]);

  if (!seat) return null;
  const status = room.status;
  if (status.kind === 'ended') {
    return (
      <Ended
        title={
          status.code === 'KICKED'
            ? 'Removed from the room'
            : status.code === 'ROOM_CLOSED'
              ? 'This room has closed'
              : status.code === 'UNSUPPORTED_VERSION'
                ? 'Update needed'
                : 'Seat not available'
        }
        message={status.message}
        onLeave={() => {
          if (status.code !== 'UNSUPPORTED_VERSION') forgetSeat(code);
          if (status.code === 'UNSUPPORTED_VERSION') location.reload();
          else navigate('/');
        }}
        action={status.code === 'UNSUPPORTED_VERSION' ? 'Reload' : 'Back to start'}
      />
    );
  }
  if (status.kind === 'replaced') {
    return (
      <Ended
        title="Opened somewhere else"
        message="Your seat is now active in another tab or on another device. Only one place can play a seat at a time."
        onLeave={() => connection?.reclaim()}
        action="Play here instead"
      />
    );
  }
  const view = room.view;
  if (!view) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-4" aria-busy="true">
        <p className="text-[var(--color-muted)]">
          {status.kind === 'reconnecting' ? 'Reconnecting…' : 'Connecting to the room…'}
        </p>
      </main>
    );
  }
  const props: GameProps = { view, act, clockOffset: room.clockOffset, roomCode: code };
  return (
    <div className="min-h-dvh flex flex-col">
      <Header {...props} pendingCount={room.pending.size} />
      {status.kind !== 'open' && (
        <div
          role="status"
          className="bg-[var(--color-charcoal)] text-center text-sm py-2 px-4 border-b border-[var(--color-border)]"
        >
          Connection lost. Reconnecting… your seat is safe.
        </div>
      )}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-4 pb-28">
        <PhaseBody {...props} />
      </main>
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
      <Toasts toasts={toasts} />
    </div>
  );
}

function PhaseBody(props: GameProps) {
  switch (props.view.phase) {
    case 'LOBBY':
      return <Lobby {...props} />;
    case 'ROLE_REVEAL':
      return <Briefing {...props} />;
    case 'INTELLIGENCE':
    case 'NEGOTIATION':
    case 'COMMITMENT':
      return <Round {...props} />;
    case 'RESOLUTION':
    case 'ROUND_SUMMARY':
      return <Outcome {...props} />;
    case 'FINAL_RECKONING':
    case 'RESULTS':
      return <Final {...props} />;
  }
}

function Ended({
  title,
  message,
  onLeave,
  action,
}: {
  title: string;
  message: string;
  onLeave: () => void;
  action: string;
}) {
  return (
    <main className="min-h-dvh flex items-center justify-center px-4">
      <div className="card p-6 max-w-md w-full" role="alert">
        <h1 className="font-display text-2xl mb-2">{title}</h1>
        <p className="text-[var(--color-muted)] mb-5">{message}</p>
        <button type="button" className="btn btn-primary btn-block" onClick={onLeave}>
          {action}
        </button>
      </div>
    </main>
  );
}
