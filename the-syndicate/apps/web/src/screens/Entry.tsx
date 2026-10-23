import { AVATARS, type Avatar, type MatchLength } from '@syndicate/game-engine';
import { useState, type FormEvent } from 'react';
import { ApiError, createRoom, joinRoom } from '../lib/api';
import { AVATAR_GLYPH } from '../lib/format';
import { navigate } from '../lib/router';
import { loadProfile, loadSeat, saveProfile, saveSeat } from '../lib/session';

const CODE_CHARS = /[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g;

export function Entry({ mode, initialCode }: { mode: 'host' | 'join'; initialCode: string }) {
  const profile = loadProfile();
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState<Avatar>(
    (AVATARS as readonly string[]).includes(profile?.avatar ?? '')
      ? (profile?.avatar as Avatar)
      : 'fox',
  );
  const [code, setCode] = useState(initialCode.replace(CODE_CHARS, ''));
  const [length, setLength] = useState<MatchLength>('standard');
  const [beginner, setBeginner] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = mode === 'join' && code.length === 6 ? loadSeat(code) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return setError('Pick a nickname.');
    if (mode === 'join' && code.length !== 6) return setError('Room codes have 6 characters.');
    setBusy(true);
    try {
      const seat =
        mode === 'host'
          ? await createRoom(trimmed, avatar, { length, beginner })
          : await joinRoom(code, trimmed, avatar);
      saveProfile({ name: trimmed, avatar });
      saveSeat({ ...seat, name: trimmed });
      navigate(`/room/${seat.roomCode}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">
        <button
          type="button"
          className="btn btn-ghost btn-sm mb-4 -ml-2"
          onClick={() => navigate('/')}
        >
          ← Back
        </button>
        <h1 className="font-display text-3xl mb-1">
          {mode === 'host' ? 'Host a game' : 'Join a game'}
        </h1>
        <p className="text-[var(--color-muted)] mb-6">
          {mode === 'host'
            ? 'You will get a room code to share. You need at least 4 players.'
            : 'Enter the code your host shared.'}
        </p>
        {existing && (
          <div className="card-private p-4 mb-5">
            <p className="mb-3">
              This device already has a seat in room <strong className="font-mono">{code}</strong>{' '}
              as <strong>{existing.name}</strong>.
            </p>
            <button
              type="button"
              className="btn btn-private btn-block"
              onClick={() => navigate(`/room/${code}`)}
            >
              Rejoin as {existing.name}
            </button>
          </div>
        )}
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          {mode === 'join' && (
            <label className="flex flex-col gap-2">
              <span className="eyebrow">Room code</span>
              <input
                className="input font-mono text-2xl tracking-[0.4em] uppercase"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.toUpperCase().replace(CODE_CHARS, '').slice(0, 6))
                }
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="next"
                aria-describedby="code-help"
                autoFocus={!initialCode}
                placeholder="K7QF2M"
              />
              <span id="code-help" className="text-xs text-[var(--color-faint)]">
                Letters and numbers; O, I and L are never used.
              </span>
            </label>
          )}
          <label className="flex flex-col gap-2">
            <span className="eyebrow">Nickname</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 16))}
              maxLength={16}
              autoComplete="nickname"
              enterKeyHint="go"
              autoFocus={mode === 'host' || Boolean(initialCode)}
              placeholder="What should others call you?"
            />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="eyebrow mb-2">Avatar</legend>
            <div role="radiogroup" aria-label="Avatar" className="grid grid-cols-6 gap-2">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={avatar === a}
                  aria-label={a}
                  onClick={() => setAvatar(a)}
                  className={`btn btn-sm text-2xl ${avatar === a ? 'btn-secondary' : 'btn-ghost'}`}
                  style={avatar === a ? { borderColor: 'var(--color-gold)' } : undefined}
                >
                  <span aria-hidden="true">{AVATAR_GLYPH[a]}</span>
                </button>
              ))}
            </div>
          </fieldset>
          {mode === 'host' && (
            <fieldset className="flex flex-col gap-3">
              <legend className="eyebrow mb-2">Match</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Match length">
                {(
                  [
                    ['standard', 'Standard', '5 operations, ~15-20 min'],
                    ['quick', 'Quick', '3 operations, ~10 min'],
                  ] as const
                ).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={length === value}
                    onClick={() => setLength(value)}
                    className={`card p-3 text-left ${length === value ? '' : 'opacity-70'}`}
                    style={length === value ? { borderColor: 'var(--color-gold)' } : undefined}
                  >
                    <span className="block font-semibold">{label}</span>
                    <span className="block text-xs text-[var(--color-muted)]">{hint}</span>
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-3 min-h-[48px]">
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-[var(--color-gold)]"
                  checked={beginner}
                  onChange={(e) => setBeginner(e.target.checked)}
                />
                <span>
                  Beginner mode{' '}
                  <span className="text-[var(--color-muted)] text-sm">
                    (guided first round, extra time)
                  </span>
                </span>
              </label>
            </fieldset>
          )}
          {error && (
            <p role="alert" className="text-[var(--color-danger)]">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Connecting…' : mode === 'host' ? 'Create room' : 'Join room'}
          </button>
        </form>
      </div>
    </main>
  );
}
