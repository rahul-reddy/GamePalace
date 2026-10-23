import { useEffect, useState } from 'react';
import type { HealthResponse } from '@syndicate/shared';

type Check = 'checking' | 'ok' | 'failed';

function useBackendStatus(): { http: Check; socket: Check } {
  const [http, setHttp] = useState<Check>('checking');
  const [socket, setSocket] = useState<Check>('checking');
  useEffect(() => {
    fetch('/api/health')
      .then((r) =>
        r.ok ? (r.json() as Promise<HealthResponse>) : Promise.reject(new Error(String(r.status))),
      )
      .then((body) => setHttp(body.ok ? 'ok' : 'failed'))
      .catch(() => setHttp('failed'));
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${location.host}/api/ws-probe`);
    const timer = setTimeout(() => setSocket('failed'), 6000);
    ws.onmessage = () => {
      clearTimeout(timer);
      setSocket('ok');
      ws.send('done');
    };
    ws.onerror = () => setSocket('failed');
    return () => {
      clearTimeout(timer);
      ws.close();
    };
  }, []);
  return { http, socket };
}

export function App() {
  const status = useBackendStatus();
  return (
    <main className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col items-center justify-center gap-8 px-4">
      <h1 className="font-display tracking-[0.3em] text-3xl text-[var(--color-gold)]">
        THE SYNDICATE
      </h1>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button className="btn-primary" type="button">
          Host game
        </button>
        <button className="btn-secondary" type="button">
          Join game
        </button>
      </div>
      <p className="text-sm text-[var(--color-muted)]" data-testid="backend-status">
        Server: {status.http} · Live connection: {status.socket}
      </p>
    </main>
  );
}
