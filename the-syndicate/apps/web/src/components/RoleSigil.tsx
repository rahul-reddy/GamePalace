import type { Archetype } from '@syndicate/game-engine';

const COLORS: Record<Archetype, string> = {
  broker: 'var(--color-gold)',
  insider: 'var(--color-teal)',
  fixer: '#8fb4ff',
  auditor: '#c9d1e8',
  saboteur: 'var(--color-danger)',
  opportunist: '#e6a8ff',
};

/** A distinct silhouette per archetype, readable at small sizes and without colour. */
export function RoleSigil({ archetype, size = 56 }: { archetype: Archetype; size?: number }) {
  const c = COLORS[archetype];
  const frame = (
    <circle cx="32" cy="32" r="29" fill="none" stroke={c} strokeOpacity="0.45" strokeWidth="2" />
  );
  let mark;
  switch (archetype) {
    case 'broker': // two linked rings
      mark = (
        <>
          <circle cx="25" cy="32" r="10" fill="none" stroke={c} strokeWidth="3" />
          <circle cx="39" cy="32" r="10" fill="none" stroke={c} strokeWidth="3" />
        </>
      );
      break;
    case 'insider': // eye
      mark = (
        <>
          <path
            d="M12 32c6-9 13-13 20-13s14 4 20 13c-6 9-13 13-20 13s-14-4-20-13Z"
            fill="none"
            stroke={c}
            strokeWidth="3"
          />
          <circle cx="32" cy="32" r="5" fill={c} />
        </>
      );
      break;
    case 'fixer': // shield
      mark = (
        <path
          d="M32 14 47 20v11c0 10-6 16-15 20-9-4-15-10-15-20V20Z"
          fill="none"
          stroke={c}
          strokeWidth="3"
        />
      );
      break;
    case 'auditor': // magnifier
      mark = (
        <>
          <circle cx="29" cy="29" r="10" fill="none" stroke={c} strokeWidth="3" />
          <path d="M36.5 36.5 47 47" stroke={c} strokeWidth="4" strokeLinecap="round" />
        </>
      );
      break;
    case 'saboteur': // broken blade
      mark = (
        <>
          <path d="M20 44 34 30" stroke={c} strokeWidth="4" strokeLinecap="round" />
          <path d="M38 26 46 18" stroke={c} strokeWidth="4" strokeLinecap="round" />
          <path d="M16 40l8 8" stroke={c} strokeWidth="3" strokeLinecap="round" />
        </>
      );
      break;
    case 'opportunist': // hourglass
      mark = (
        <path
          d="M22 16h20M22 48h20M24 16c0 10 16 10 16 16s-16 6-16 16M40 16c0 10-16 10-16 16s16 6 16 16"
          fill="none"
          stroke={c}
          strokeWidth="3"
        />
      );
      break;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {frame}
      {mark}
    </svg>
  );
}
