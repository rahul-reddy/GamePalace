import type { MatchSettings } from '@syndicate/game-engine';
import { Card, ConfirmDialog } from '@syndicate/ui';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Chat } from '../components/Chat';
import { Avatar, PlayerStrip, ReadyBar } from '../components/Players';
import type { GameProps } from './Room';

function inviteUrl(code: string): string {
  return `${location.origin}/join/${code}`;
}

export function Lobby(props: GameProps) {
  const { view, act, roomCode } = props;
  const isHost = view.hostId === view.self.id;
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [kickTarget, setKickTarget] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(inviteUrl(roomCode), {
      margin: 1,
      width: 220,
      color: { dark: '#0a0f1e', light: '#eceff7' },
    })
      .then(setQr)
      .catch(() => setQr(null));
  }, [roomCode]);
  const enough = view.players.length >= view.rules.minPlayers;
  const othersReady = view.players.every((p) => p.ready || p.id === view.self.id);
  const canStart = isHost && enough && othersReady;

  async function copy() {
    const url = inviteUrl(roomCode);
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({
          title: 'Join my Syndicate game',
          text: `Room code ${roomCode}`,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const setSetting = (settings: Partial<MatchSettings>) =>
    act({ type: 'updateSettings', settings });

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="flex-1 text-center sm:text-left">
          <p className="eyebrow">Room code</p>
          <p
            className="font-mono text-4xl tracking-[0.3em] text-[var(--color-gold)] my-1"
            data-testid="room-code"
          >
            {roomCode}
          </p>
          <p className="text-sm text-[var(--color-muted)] mb-3">
            Friends open the site and enter this code, or scan the QR code. Anyone with the code can
            join until the match starts.
          </p>
          <button type="button" className="btn btn-secondary" onClick={copy}>
            {copied ? 'Link copied ✓' : 'Share invite link'}
          </button>
        </div>
        {qr && (
          <img
            src={qr}
            alt={`QR code for joining room ${roomCode}`}
            width={160}
            height={160}
            className="rounded-lg"
          />
        )}
      </Card>

      <Card>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-lg">
            Players{' '}
            <span className="text-[var(--color-muted)] text-sm">
              {view.players.length} / {view.rules.maxPlayers}
            </span>
          </h2>
          {!enough && (
            <span className="text-sm text-[var(--color-muted)]">
              Need {view.rules.minPlayers - view.players.length} more to start
            </span>
          )}
        </div>
        <PlayerStrip view={view} mode="ready" />
        {isHost && view.players.length > 1 && (
          <details className="mt-3">
            <summary className="text-sm text-[var(--color-muted)] cursor-pointer min-h-[40px] flex items-center">
              Remove a player
            </summary>
            <ul className="mt-2 flex flex-col gap-2">
              {view.players
                .filter((p) => p.id !== view.self.id)
                .map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <Avatar player={p} size={28} />
                    <span className="flex-1 truncate">{p.name}</span>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => setKickTarget(p.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
            </ul>
          </details>
        )}
      </Card>

      <Card>
        <h2 className="font-display text-lg mb-3">Match settings</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Setting
            label="Length"
            value={
              view.settings.length === 'standard'
                ? `Standard (${view.rules.roundsStandard} operations)`
                : `Quick (${view.rules.roundsQuick} operations)`
            }
            editable={isHost}
            options={[
              ['Standard', () => setSetting({ length: 'standard' })],
              ['Quick', () => setSetting({ length: 'quick' })],
            ]}
          />
          <Setting
            label="Pace"
            value={view.settings.pace[0]?.toUpperCase() + view.settings.pace.slice(1)}
            editable={isHost}
            options={[
              ['Fast', () => setSetting({ pace: 'fast' })],
              ['Normal', () => setSetting({ pace: 'normal' })],
              ['Relaxed', () => setSetting({ pace: 'relaxed' })],
            ]}
          />
          <Setting
            label="Beginner help"
            value={view.settings.beginner ? 'On' : 'Off'}
            editable={isHost}
            options={[
              ['On', () => setSetting({ beginner: true })],
              ['Off', () => setSetting({ beginner: false })],
            ]}
          />
          <Setting
            label="Chat"
            value={view.settings.presetChatOnly ? 'Presets only' : 'Free text + presets'}
            editable={isHost}
            options={[
              ['Free', () => setSetting({ presetChatOnly: false })],
              ['Presets', () => setSetting({ presetChatOnly: true })],
            ]}
          />
        </dl>
        {!isHost && (
          <p className="text-xs text-[var(--color-faint)] mt-3">
            Only the host can change settings.
          </p>
        )}
      </Card>

      <Chat {...props} compact />

      {isHost ? (
        <div
          className="fixed bottom-0 inset-x-0 z-20 bg-[rgba(10,15,30,0.95)] border-t border-[var(--color-border)] px-4 py-3"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <p className="text-sm text-[var(--color-muted)] flex-1">
              {!enough
                ? `Waiting for ${view.rules.minPlayers - view.players.length} more`
                : othersReady
                  ? 'Everyone is ready'
                  : 'Waiting for players to be ready'}
            </p>
            <button
              type="button"
              className="btn btn-primary min-w-[44%]"
              disabled={!canStart}
              onClick={() => act({ type: 'start' })}
            >
              Start match
            </button>
          </div>
        </div>
      ) : (
        <ReadyBar view={view} act={act} label="I'm ready" doneLabel="Ready ✓ (tap to undo)" />
      )}
      <ConfirmDialog
        open={kickTarget !== null}
        title="Remove this player?"
        confirmLabel="Remove"
        tone="danger"
        onCancel={() => setKickTarget(null)}
        onConfirm={() => {
          if (kickTarget) void act({ type: 'kick', target: kickTarget });
          setKickTarget(null);
        }}
      >
        They will be disconnected and can only come back by joining again.
      </ConfirmDialog>
    </div>
  );
}

function Setting({
  label,
  value,
  editable,
  options,
}: {
  label: string;
  value: string;
  editable: boolean;
  options: [string, () => void][];
}) {
  return (
    <div>
      <dt className="eyebrow mb-1">{label}</dt>
      <dd>
        {editable ? (
          <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
            {options.map(([name, onClick]) => {
              const active = value.toLowerCase().startsWith(name.toLowerCase());
              return (
                <button
                  key={name}
                  type="button"
                  onClick={onClick}
                  aria-pressed={active}
                  className={`btn btn-sm ${active ? 'btn-secondary' : 'btn-ghost'}`}
                  style={active ? { borderColor: 'var(--color-gold)' } : undefined}
                >
                  {name}
                </button>
              );
            })}
          </div>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
