import { Card, PrivateLabel } from '@syndicate/ui';
import { ReadyBar } from '../components/Players';
import { Sigil } from '../components/Sigil';
import type { GameProps } from './Room';

export function Briefing({ view, act }: GameProps) {
  return (
    <div className="flex flex-col gap-4">
      <section
        className="card-private p-5 text-center anim-rise"
        aria-label="Your briefing"
        data-testid="briefing"
      >
        <PrivateLabel>Your briefing</PrivateLabel>
        <div className="flex justify-center my-3">
          <Sigil size={72} />
        </div>
        <h2 className="font-display text-2xl mb-1">Independent Operator</h2>
        <p className="text-[var(--color-muted)] max-w-md mx-auto">
          You answer to nobody. Grow your influence by backing the right operations, and keep enough
          credits in reserve.
        </p>
        <p className="mt-3 font-mono text-[var(--color-teal)]">
          You start with {view.self.credits} credits · {view.totalRounds} operations
        </p>
      </section>
      <Card>
        <h2 className="font-display text-lg mb-2">How to win</h2>
        <ol className="list-decimal pl-5 flex flex-col gap-2 text-sm">
          <li>
            Each operation, read the public odds and your{' '}
            <span className="text-[var(--color-teal)]">private intel</span>.
          </li>
          <li>Negotiate. Promises are not enforced, so watch who keeps them.</li>
          <li>
            Seal 0-{view.rules.maxCommit} credits. On success backers split the influence pool; on
            failure they lose what they put in.
          </li>
          <li>
            Final score = influence + 1 point per {view.rules.creditsPerScorePoint} credits left.
            Highest score wins; nobody is eliminated.
          </li>
        </ol>
      </Card>
      <ReadyBar view={view} act={act} label="Got it" />
    </div>
  );
}
