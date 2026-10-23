import { navigate } from '../lib/router';
import { Sigil } from '../components/Sigil';

export function Landing() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-10 px-4 py-10">
      <div className="flex flex-col items-center gap-4 text-center anim-rise">
        <Sigil size={84} />
        <h1 className="font-display tracking-[0.32em] text-3xl sm:text-4xl text-[var(--color-gold)]">
          THE SYNDICATE
        </h1>
        <p className="max-w-sm text-[var(--color-muted)]">
          Invest in risky operations, strike deals you may not keep, and read the room. 4-12
          players, one phone each, about 15 minutes.
        </p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          className="btn btn-primary btn-block"
          type="button"
          onClick={() => navigate('/host')}
        >
          Host a game
        </button>
        <button
          className="btn btn-secondary btn-block"
          type="button"
          onClick={() => navigate('/join')}
        >
          Join with a code
        </button>
        <button
          className="btn btn-ghost btn-block"
          type="button"
          onClick={() => navigate('/how-to-play')}
        >
          How to play
        </button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3 max-w-3xl w-full text-sm">
        {[
          [
            'Commit in secret',
            'Seal 0-3 credits into each operation. Amounts stay hidden until the reveal.',
          ],
          [
            'Promise anything',
            'Deals are nonbinding. Everyone sees who kept their word only afterwards.',
          ],
          ['Nobody is knocked out', 'Every player stays in until the final reckoning.'],
        ].map(([title, body]) => (
          <li key={title} className="card p-4">
            <p className="font-display text-[var(--color-gold)] mb-1">{title}</p>
            <p className="text-[var(--color-muted)]">{body}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--color-faint)] max-w-sm text-center">
        Fictional credits only. No accounts, no purchases, no real-money play.
      </p>
    </main>
  );
}
