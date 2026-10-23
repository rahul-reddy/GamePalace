import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = Number(process.env.INTEGRATION_PORT ?? 8791);
export const BASE_URL = `http://127.0.0.1:${PORT}`;
let child: ChildProcess | undefined;

async function waitForHealth(deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE_URL}/api/health`);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('wrangler dev did not become healthy');
}

export async function setup(): Promise<void> {
  process.env.SYNDICATE_BASE_URL = BASE_URL;
  if (process.env.SYNDICATE_EXTERNAL_SERVER) return waitForHealth(Date.now() + 5_000);
  const root = resolve(import.meta.dirname, '../..');
  const worker = resolve(root, 'apps/worker');
  // Each run starts from an empty store so results never depend on earlier runs.
  rmSync(resolve(root, '.wrangler/integration-state'), { recursive: true, force: true });
  if (!existsSync(resolve(root, 'apps/web/dist/index.html'))) {
    throw new Error('Build the web app first (pnpm build) so the Worker has assets to serve.');
  }
  child = spawn(
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
      resolve(root, '.wrangler/integration-state'),
    ],
    { cwd: worker, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
  );
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', (d: Buffer) => {
    const text = d.toString();
    if (/error/i.test(text)) process.stderr.write(`[wrangler] ${text}`);
  });
  await waitForHealth(Date.now() + 90_000);
}

export async function teardown(): Promise<void> {
  if (!child?.pid) return;
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  else child.kill('SIGTERM');
}
