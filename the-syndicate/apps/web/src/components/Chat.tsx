import { PRESET_MESSAGES, REACTIONS } from '@syndicate/game-engine';
import { Card } from '@syndicate/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { GameProps } from '../screens/Room';
import { Avatar, nameOf } from './Players';

const QUICK_PRESETS = [
  'in3',
  'in2',
  'out',
  'target',
  'intelGood',
  'intelBad',
  'trust',
  'noTrust',
  'deal',
  'suspicious',
];

export function Chat({ view, act, compact = false }: GameProps & { compact?: boolean }) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const me = view.players.find((p) => p.id === view.self.id);
  const messages = view.chat.slice(compact ? -12 : -40);
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);
  const textAllowed = !view.settings.presetChatOnly && !me?.muted;

  async function send(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (await act({ type: 'chat', kind: 'text', text: value })) setText('');
  }

  return (
    <Card aria-label="Room chat">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-lg">Table talk</h2>
        <span className="label-public">Everyone sees this</span>
      </div>
      <ol
        ref={listRef}
        className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1 mb-3"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 && (
          <li className="text-sm text-[var(--color-faint)]">No messages yet.</li>
        )}
        {messages.map((m) => {
          const player = view.players.find((p) => p.id === m.from);
          return (
            <li key={m.id} className="flex items-start gap-2 text-sm">
              {player && <Avatar player={player} size={22} />}
              <span className="min-w-0">
                <span className="font-semibold">{nameOf(view, m.from)}</span>{' '}
                <span
                  className={
                    m.kind === 'reaction'
                      ? 'text-xl leading-none'
                      : m.kind === 'preset'
                        ? 'text-[var(--color-gold-strong)]'
                        : ''
                  }
                >
                  {m.text}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {me?.muted ? (
        <p className="text-sm text-[var(--color-muted)]">The host has muted you.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="Quick messages">
            {QUICK_PRESETS.map((id) => (
              <button
                key={id}
                type="button"
                className="chip hover:border-[var(--color-gold)]"
                onClick={() => act({ type: 'chat', kind: 'preset', text: id })}
              >
                {PRESET_MESSAGES[id]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 mb-2" role="group" aria-label="Reactions">
            {REACTIONS.map((r) => (
              <button
                key={r}
                type="button"
                className="btn btn-ghost btn-sm text-xl"
                aria-label={`React ${r}`}
                onClick={() => act({ type: 'chat', kind: 'reaction', text: r })}
              >
                {r}
              </button>
            ))}
          </div>
          {textAllowed && (
            <form onSubmit={send} className="flex gap-2">
              <input
                className="input"
                style={{ scrollMarginBottom: 120 }}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 140))}
                maxLength={140}
                placeholder="Say something…"
                aria-label="Message"
                enterKeyHint="send"
              />
              <button type="submit" className="btn btn-secondary" disabled={!text.trim()}>
                Send
              </button>
            </form>
          )}
        </>
      )}
    </Card>
  );
}
