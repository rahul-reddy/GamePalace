import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Card({
  children,
  className = '',
  private: isPrivate = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  private?: boolean;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`${isPrivate ? 'card-private' : 'card'} p-4 ${className}`} {...rest}>
      {children}
    </section>
  );
}

/** Marks a block as visible only to this player. */
export function PrivateLabel({ children = 'Only you can see this' }: { children?: ReactNode }) {
  return (
    <span className="label-private">
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z" />
      </svg>
      {children}
    </span>
  );
}

export function Counter({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'private' | 'gold';
}) {
  const color =
    tone === 'private'
      ? 'var(--color-teal)'
      : tone === 'gold'
        ? 'var(--color-gold)'
        : 'var(--color-text)';
  return (
    <span className="counter">
      <span className="counter-value" style={{ color }}>
        {value}
      </span>
      <span className="counter-label">{label}</span>
    </span>
  );
}

/**
 * Confirmation for irreversible actions. Focus moves into the dialog, Escape
 * cancels, and focus returns to the trigger when it closes.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  tone = 'primary',
  busy = false,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: 'primary' | 'private' | 'danger';
  busy?: boolean;
}) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onCancel]);
  if (!open) return null;
  // Portal to <body> so no ancestor's transform or backdrop-filter can trap the overlay.
  return createPortal(
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card modal anim-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="font-display text-xl mb-2">
          {title}
        </h2>
        <div className="text-[var(--color-muted)] mb-4">{children}</div>
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${tone === 'private' ? 'btn-private' : tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
