// The public "How to play" guide. Plain language for any age; every number comes
// from the current rules config, so the guide always matches the game.
import {
  CURRENT_RULES_VERSION,
  getRules,
  type Archetype,
  type ObjectiveView,
  type RoleView,
} from '@syndicate/game-engine';
import { Card } from '@syndicate/ui';
import { useEffect, type ReactNode } from 'react';
import { RoleSigil } from '../components/RoleSigil';
import { Sigil } from '../components/Sigil';
import { navigate } from '../lib/router';
import { abilityText, OBJECTIVE_NAME, objectiveText } from '../lib/roles';

const rules = getRules(CURRENT_RULES_VERSION);

const ROLE_SUMMARY: Record<Archetype, { name: string; plain: string }> = {
  broker: {
    name: 'Broker',
    plain: 'Earns a bonus when an operation works and lots of players joined in.',
  },
  insider: {
    name: 'Insider',
    plain: "Can see an operation's real chance of working before deciding.",
  },
  fixer: {
    name: 'Fixer',
    plain: "Can protect a player's coins if an operation fails, and earns a fee when it works.",
  },
  auditor: { name: 'Auditor', plain: 'Can secretly check whether a player has been sabotaging.' },
  opportunist: {
    name: 'Opportunist',
    plain: 'Bets on whether an operation will work. Right earns points; wrong costs one.',
  },
  saboteur: {
    name: 'Saboteur',
    plain:
      'Wants operations to fail. Can secretly make one less likely to work and earns points when it fails, but might get caught.',
  },
};
const ARCHETYPE_ORDER: Archetype[] = [
  'broker',
  'insider',
  'fixer',
  'auditor',
  'opportunist',
  'saboteur',
];

function rolesOf(archetype: Archetype): RoleView[] {
  return Object.entries(rules.roles?.definitions ?? {})
    .filter(([, d]) => d.archetype === archetype)
    .map(([id, d]) => ({
      id,
      name: d.name,
      archetype: d.archetype,
      ability: d.ability,
      charges: d.charges,
      maxCharges: d.charges,
      params: { ...d.params },
    }));
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-3 scroll-mt-6">
      <h2 id={`${id}-title`} className="font-display text-2xl text-[var(--color-gold)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function HowToPlay() {
  useEffect(() => {
    document.title = 'How to play · The Syndicate';
    return () => {
      document.title = 'The Syndicate';
    };
  }, []);
  const e = rules.economy;
  const s = rules.suspicion;
  const a = rules.accusations;
  const objectives: ObjectiveView[] = (rules.objectives ?? []).map((o) => ({
    id: o.id,
    bonus: o.bonus,
    threshold: o.standard,
  }));
  return (
    <main className="min-h-dvh px-4 py-8">
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-8">
        <button
          type="button"
          className="btn btn-ghost btn-sm self-start -ml-2"
          onClick={() => navigate('/')}
        >
          ← Back
        </button>

        <header className="flex flex-col gap-3">
          <Sigil size={56} />
          <h1 className="font-display text-4xl">How to play</h1>
          <p className="text-lg text-[var(--color-muted)]">
            You and your friends run a secret club that takes on risky jobs called{' '}
            <strong>operations</strong>. Put coins in, make deals, and watch for the saboteur.{' '}
            {rules.players.min} to {rules.players.max} players, each on their own phone or computer.
          </p>
        </header>

        <section
          aria-label="The goal"
          className="rounded-[var(--radius)] p-5 flex flex-col gap-1"
          style={{ background: 'var(--color-gold)', color: 'var(--color-gold-ink)' }}
        >
          <h2 className="font-display text-2xl">Goal: have the most points at the end</h2>
          <p>
            A game is {rules.rounds.standard} operations ({rules.rounds.quick} in a quick game).
            Nobody is knocked out; everyone plays to the end.
          </p>
        </section>

        <Section id="words" title="Three things to watch">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card-private p-4 flex flex-col gap-1">
              <span className="label-private">Secret</span>
              <strong className="font-display text-lg">Credits</strong>
              <span className="text-sm">
                Your coins. Only you can see them. You start with {e.startingCredits}.
              </span>
            </div>
            <Card className="flex flex-col gap-1">
              <span className="label-public">Everyone sees</span>
              <strong className="font-display text-lg">Influence</strong>
              <span className="text-sm text-[var(--color-muted)]">
                Your points. This is what wins.
              </span>
            </Card>
            <Card className="flex flex-col gap-1">
              <span className="label-public">Everyone sees</span>
              <strong className="font-display text-lg">Suspicion</strong>
              <span className="text-sm text-[var(--color-muted)]">
                How sneaky the others think you are. Too much costs points at the end.
              </span>
            </Card>
          </div>
          <p className="text-sm text-[var(--color-muted)]">
            On your screen,{' '}
            <span className="text-[var(--color-teal)] font-semibold">teal, striped boxes</span> are
            private to you. <span className="text-[var(--color-gold)] font-semibold">Gold</span> is
            for everyone.
          </p>
        </Section>

        <Section id="round" title="Each operation, step by step">
          <ol className="flex flex-col gap-3">
            {[
              [
                'Look',
                'A new operation appears with a rough chance of working, for example “50%–75%”. You also get a private hint about the real chance. Hints can be a little off, and everyone’s is different. You may pay 1 coin for a sharper hint.',
                'Done studying',
              ],
              [
                'Talk',
                'Chat, send quick messages and make deals like “we all put in 2”. Promises are not enforced: anyone can break them. After the reveal, everyone in a deal sees who kept it.',
                'Done negotiating',
              ],
              [
                'Put coins in, secretly',
                `Choose 0 to ${e.maxCommit} coins and press Seal. Nobody sees amounts until the reveal. If time runs out, you put in 0.`,
                'Seal',
              ],
              [
                'Reveal',
                'Everyone sees whether the operation worked and what each player put in.',
                'Continue',
              ],
            ].map(([title, body, button], i) => (
              <li key={title} className="card p-4 flex gap-4">
                <span
                  aria-hidden="true"
                  className="font-display text-xl w-10 h-10 shrink-0 rounded-full flex items-center justify-center border-2"
                  style={{ borderColor: 'var(--color-gold)', color: 'var(--color-gold)' }}
                >
                  {i + 1}
                </span>
                <div className="flex flex-col gap-1 min-w-0">
                  <h3 className="font-display text-lg">{title}</h3>
                  <p>{body}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    Button: <strong>{button}</strong>
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div className="card p-3">
              <strong className="block font-display text-[var(--color-success)]">It works</strong>
              You get your coins back plus points. More coins in means a bigger share.
            </div>
            <div className="card p-3">
              <strong className="block font-display text-[var(--color-danger)]">It fails</strong>
              You lose the coins you put in, and only those.
            </div>
            <div className="card p-3">
              <strong className="block font-display text-[var(--color-gold)]">You put in 0</strong>
              Nothing to lose, and you get {e.sitOutCredits} free coin.
            </div>
          </div>
          <p className="card-private p-3 text-sm">
            <strong>Teamwork tip:</strong> every operation has a <strong>target</strong>. If the
            table puts in at least that many coins in total, its chance of working goes up by{' '}
            {Math.round(rules.operations.targetBonus * 100)} points.
          </p>
        </Section>

        <Section id="roles" title="Your secret role">
          <p>
            At the start everyone gets a secret role with a special power, usable a few times per
            game. Keep yours to yourself. There is always at least one saboteur.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {ARCHETYPE_ORDER.map((archetype) => {
              const variants = rolesOf(archetype);
              return (
                <li
                  key={archetype}
                  className="card p-4 flex flex-col gap-2"
                  style={
                    archetype === 'saboteur' ? { borderColor: 'var(--color-danger)' } : undefined
                  }
                >
                  <div className="flex items-center gap-3">
                    <RoleSigil archetype={archetype} size={44} />
                    <h3 className="font-display text-xl">{ROLE_SUMMARY[archetype].name}</h3>
                  </div>
                  <p className="text-sm">{ROLE_SUMMARY[archetype].plain}</p>
                  {variants.length > 0 && (
                    <details className="text-sm text-[var(--color-muted)]">
                      <summary className="cursor-pointer min-h-[40px] flex items-center">
                        Exact powers
                      </summary>
                      <ul className="flex flex-col gap-2 mt-1">
                        {variants.map((v) => (
                          <li key={v.id}>
                            <strong className="text-[var(--color-text)]">{v.name}:</strong>{' '}
                            {abilityText(v)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-[var(--color-muted)]">
            Bigger games add cousins of these roles (shown under “Exact powers”). During a game, tap{' '}
            <strong>Rules</strong> at the top of the screen to read them again.
          </p>
        </Section>

        <Section id="saboteur" title="Catching the saboteur">
          <p>
            Think someone is a saboteur? <strong>Accuse</strong> them while talking. You can accuse{' '}
            {a?.perMatch ?? 2} times per game; everyone sees it, and it raises their suspicion.
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>
              Right: <strong>+{a?.correctBonus ?? 2} points</strong> at the end (auditors earn
              extra).
            </li>
            <li>
              Wrong: <strong>−{a?.wrongPenalty ?? 1} point</strong> at the end.
            </li>
            <li>
              A saboteur can also be caught by the game. They are then marked{' '}
              <strong>EXPOSED</strong> for everyone, and pay a fine at the end.
            </li>
          </ul>
        </Section>

        <Section id="goals" title="Your secret goal">
          <p>
            You also get one small secret goal. Complete it for bonus points. The possible goals
            are:
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 text-sm">
            {objectives.map((o) => (
              <li key={o.id} className="card p-3">
                <strong className="font-display">{OBJECTIVE_NAME[o.id]}</strong>{' '}
                <span className="text-[var(--color-gold)]">+{o.bonus}</span>
                <br />
                {objectiveText(o)}
              </li>
            ))}
          </ul>
          <p className="text-xs text-[var(--color-muted)]">
            Thresholds shown are for a standard game; quick games ask for less.
          </p>
        </Section>

        <Section id="winning" title="Who wins">
          <p>After the last operation, every secret role is revealed and scores are added up:</p>
          <p className="card p-4 font-display text-lg">
            Influence + 1 point per {e.creditsPerScorePoint} coins left + secret goal + correct
            accusations − penalties
          </p>
          <p>
            Penalties: suspicion above {s?.freeAllowance ?? 2} (up to {s?.maxPenalty ?? 3} points),
            wrong accusations, getting caught sabotaging, and wrong opportunist guesses.{' '}
            <strong>Highest score wins;</strong> tied players share the win. The final screen
            explains every point.
          </p>
        </Section>

        <Section id="tips" title="Tips for your first game">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>
              Compare hints out loud. Two hints together are better than one, if people are telling
              the truth.
            </li>
            <li>Keep some coins for later operations: leftover coins also count at the end.</li>
            <li>Watch who breaks deals. The reveal shows it.</li>
            <li>Keep your screen to yourself, bluff kindly, and remember the coins are pretend.</li>
          </ul>
        </Section>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            className="btn btn-primary flex-1"
            onClick={() => navigate('/host')}
          >
            Host a game
          </button>
          <button
            type="button"
            className="btn btn-secondary flex-1"
            onClick={() => navigate('/join')}
          >
            Join with a code
          </button>
        </div>
      </div>
    </main>
  );
}
