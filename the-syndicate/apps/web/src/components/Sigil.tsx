/** The syndicate's mark: a gold lozenge around a teal eye. */
export function Sigil({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 6 58 32 32 58 6 32Z" fill="none" stroke="var(--color-gold)" strokeWidth="2.5" />
      <path
        d="M32 14 50 32 32 50 14 32Z"
        fill="none"
        stroke="var(--color-gold)"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      <ellipse
        cx="32"
        cy="32"
        rx="12"
        ry="7"
        fill="none"
        stroke="var(--color-teal)"
        strokeWidth="2"
      />
      <circle cx="32" cy="32" r="3.5" fill="var(--color-teal)" />
    </svg>
  );
}
