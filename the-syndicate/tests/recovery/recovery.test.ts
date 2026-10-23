// Kills the local runtime mid-match and restarts it on the same persisted storage.
// Proves: state survives a crash or redeploy, every seat resumes with its token,
// and phase deadlines are durable alarms that fire after a restart with nobody
// connected (the HTTP summary used to observe it never advances the room itself).
import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RoomSummary } from '@syndicate/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { allReady, api, Client, room, startMatch } from '../integration/client';

const PORT = 8793;
const URL = `http://127.0.0.1:${PORT}`;
const ROOT = resolve(import.meta.dirname, '../..');
const STATE = resolve(ROOT, '.wrangler/recovery-state');
let server: ChildProcess | undefined;

async function startServer(): Promise<void> {
  server = spawn(
    'pnpm',
    [
      'exec',
      'wrangler',
      'dev',
      '--port',
      String(PORT),
      '--ip',
      '127.0.0.1',
      '--var',
      'TEST_MODE:1',
      '--persist-to',
      STATE,
    ],
    {
      cwd: resolve(ROOT, 'apps/worker'),
      stdio: 'ignore',
      shell: process.platform === 'win32',
      // Own process group on POSIX so the whole tree can be killed at once.
      detached: process.platform !== 'win32',
    },
  );
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${URL}/api/health`)).ok) return;
    } catch {
      // starting
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}

async function killServer(): Promise<void> {
  const pid = server?.pid;
  if (!pid) return;
  await new Promise<void>((done) => {
    const killer =
      process.platform === 'win32'
        ? spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
        : spawn('kill', ['-9', `-${pid}`], { stdio: 'ignore' });
    killer.on('exit', () => done());
  });
  // Wait until the port is really closed.
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${URL}/api/health`);
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      return;
    }
  }
}

afterAll(async () => {
  await killServer();
});

describe('crash and restart recovery (real workerd, persisted storage)', () => {
  it('resumes every seat and fires deadlines after the runtime is killed mid-match', async () => {
    rmSync(STATE, { recursive: true, force: true });
    process.env.SYNDICATE_BASE_URL = URL;
    await startServer();
    const clients = await room(4, { beginner: false, pace: 'fast' });
    const code = clients[0]?.seat.roomCode as string;
    await startMatch(clients);
    await allReady(clients); // -> intelligence, round 1
    const before = clients.map((c) => c.view);
    expect(before[0]?.phase).toBe('INTELLIGENCE');
    const deadline = before[0]?.phaseEndsAt as number;

    // Crash: no clean shutdown, sockets drop.
    await killServer();
    for (const c of clients) c.close();
    await startServer();

    // Nobody reconnects yet: the persisted alarm alone must advance the phase.
    const waitUntil = deadline + 20_000;
    let summary: RoomSummary | null = null;
    while (Date.now() < waitUntil) {
      const r = await api<RoomSummary>(`/api/rooms/${code}`);
      summary = r.body;
      if (summary.phase !== 'INTELLIGENCE') break;
      await new Promise((res) => setTimeout(res, 1000));
    }
    expect(summary?.phase).toBe('NEGOTIATION');

    // Every seat comes back with the same identity, role, credits and history.
    const resumed: Client[] = [];
    for (const c of clients) resumed.push(await Client.connect(c.seat, `${c.name} (resumed)`));
    for (const [i, c] of resumed.entries()) {
      const was = before[i];
      expect(c.view?.self.id).toBe(was?.self.id);
      expect(c.view?.self.role?.id).toBe(was?.self.role?.id);
      expect(c.view?.self.objective?.id).toBe(was?.self.objective?.id);
      expect(c.view?.self.credits).toBe(was?.self.credits);
      expect(c.view?.self.intel).toEqual(was?.self.intel);
      expect(c.view?.round).toBe(1);
      expect(c.view?.phase).toBe('NEGOTIATION');
    }
    // And the match carries on normally.
    await allReady(resumed);
    await Promise.all(resumed.map((c) => c.until((v) => v.phase === 'COMMITMENT')));
    await Promise.all(resumed.map((c) => c.ok({ type: 'commit', amount: 1 })));
    await Promise.all(resumed.map((c) => c.until((v) => v.phase === 'RESOLUTION')));
    for (const c of resumed) c.close();
  }, 240_000);
});
