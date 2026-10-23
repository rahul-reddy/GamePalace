export interface Toast {
  id: number;
  text: string;
  tone: 'error' | 'success' | 'info';
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      className="fixed bottom-24 inset-x-0 z-40 flex flex-col items-center gap-2 px-4 pointer-events-none"
      aria-live="assertive"
    >
      {toasts.map((t) => (
        <p
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className="card px-4 py-3 text-sm max-w-md w-full anim-rise pointer-events-auto"
          style={{
            borderColor:
              t.tone === 'error'
                ? 'var(--color-danger)'
                : t.tone === 'success'
                  ? 'var(--color-success)'
                  : undefined,
          }}
        >
          {t.text}
        </p>
      ))}
    </div>
  );
}
