export function supported(): boolean {
  return (
    typeof WebSocket !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  );
}

export function Unsupported() {
  return (
    <main className="min-h-dvh flex items-center justify-center px-4">
      <div className="card p-6 max-w-md">
        <h1 className="font-display text-2xl mb-2">This browser can't join the syndicate</h1>
        <p className="text-[var(--color-muted)]">
          The game needs live connections (WebSockets) and secure randomness. Please open it in a
          current version of Chrome, Safari, Firefox or Edge.
        </p>
      </div>
    </main>
  );
}
