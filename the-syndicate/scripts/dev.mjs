// Local development: the Worker (rooms, API) on :8787 and Vite (hot reload) on :5173.
// Open http://localhost:5173 ; Vite proxies /api (including WebSockets) to the Worker.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

// The Worker serves built assets in production; in dev it only needs the folder to exist.
if (!existsSync('apps/web/dist')) {
  mkdirSync('apps/web/dist', { recursive: true });
  writeFileSync(
    'apps/web/dist/index.html',
    '<!doctype html><title>Run the Vite dev server</title>',
  );
}
const shell = process.platform === 'win32';
const procs = [
  spawn(
    'pnpm',
    [
      '--filter',
      '@syndicate/worker',
      'exec',
      'wrangler',
      'dev',
      '--port',
      '8787',
      '--var',
      'TEST_MODE:1',
    ],
    { stdio: 'inherit', shell },
  ),
  spawn('pnpm', ['--filter', '@syndicate/web', 'exec', 'vite', '--host'], {
    stdio: 'inherit',
    shell,
  }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs)
  p.on('exit', (code) => {
    if (code) {
      stop();
      process.exit(code);
    }
  });
