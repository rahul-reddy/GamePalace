import type { PublicOperation } from '@syndicate/game-engine';
import { Card } from '@syndicate/ui';
import { pct, signedPts, TIER_LABEL } from '../lib/format';

export function TierChip({ tier }: { tier: PublicOperation['tier'] }) {
  return <span className={`chip chip-${tier.toLowerCase()}`}>{TIER_LABEL[tier]}</span>;
}

/** Public facts about the current operation, and how the payoff works. */
export function OperationCard({
  op,
  targetBonus,
  capPerCredit,
  compact = false,
}: {
  op: PublicOperation;
  targetBonus: number;
  capPerCredit: number;
  compact?: boolean;
}) {
  const s = op.scenario;
  const effects = [
    s.successDelta !== 0 && `${signedPts(s.successDelta)} pts success`,
    s.poolMultiplier !== 1 && `reward x${s.poolMultiplier}`,
    s.targetMultiplier !== 1 && `target x${s.targetMultiplier}`,
    s.intelCostDelta !== 0 && `contact costs ${s.intelCostDelta > 0 ? '+' : ''}${s.intelCostDelta}`,
  ].filter(Boolean);
  return (
    <Card aria-label="Current operation" data-testid="operation-card">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <span className="label-public">Public · Operation {op.round}</span>
          <h2 className="font-display text-2xl leading-tight" data-testid="operation-name">
            {op.name}
          </h2>
        </div>
        <TierChip tier={op.tier} />
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center my-3">
        <div className="rounded-[var(--radius-sm)] bg-[var(--color-bg-2)] p-2">
          <dt className="eyebrow">Odds window</dt>
          <dd className="font-mono text-lg">
            {pct(op.publicLow)}–{pct(op.publicHigh)}
          </dd>
        </div>
        <div className="rounded-[var(--radius-sm)] bg-[var(--color-bg-2)] p-2">
          <dt className="eyebrow">Reward pool</dt>
          <dd className="font-mono text-lg text-[var(--color-gold)]">{op.pool} inf</dd>
        </div>
        <div className="rounded-[var(--radius-sm)] bg-[var(--color-bg-2)] p-2">
          <dt className="eyebrow">Target</dt>
          <dd className="font-mono text-lg">{op.targetCapital} cr</dd>
        </div>
      </dl>
      <p className="text-sm">
        <span className="text-[var(--color-muted)]">Scenario:</span> <strong>{s.name}</strong>
        {effects.length > 0 && (
          <span className="text-[var(--color-muted)]"> ({effects.join(', ')})</span>
        )}
      </p>
      {!compact && (
        <p className="text-sm text-[var(--color-muted)] mt-2">
          If the table commits {op.targetCapital}+ credits in total, success odds rise{' '}
          {Math.round(targetBonus * 100)} points. On success, backers get their credits back and
          split the pool by share (at most {capPerCredit} influence per credit). On failure, backers
          lose what they committed.
        </p>
      )}
    </Card>
  );
}
