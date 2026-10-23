// Load test against a server you control (default: a local `wrangler dev` this script
// starts). Opens many rooms with representative table sizes, plays rounds over real
// WebSockets and reports latency percentiles. Never point it at infrastructure you
// do not own.
//
//   pnpm test:load                       # 100 rooms, 2 rounds each, local server
//   pnpm test:load -- --rooms 20 --rounds 1
//   SYNDICATE_BASE_URL=http://127.0.0.1:8787 pnpm test:load   # use a running server
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client, commandId, createRoom, joinRoom } from '../tests/integration/client';

interface Options {
  rooms: number;
  rounds: number;
  concurrency: number;
}

function parse(argv: string[]): Options {
  const o: Options = { rooms: 100, rounds: 2, concurrency: 25 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--rooms') o.rooms = Number(argv[++i]);
    if (argv[i] === '--rounds') o.rounds = Number(argv[++i]);
    if (argv[i] === '--concurrency') o.concurrency = Number(argv[++i]);
  }
  return o;
}

const samples: Record<string, number[]> = { join: [], ack: [], fanout: [], connect: [] };
let errors = 0;

function pctl(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}

/** Sends a command and records the time to its acknowledgement. */
async function timed(c: Client, command: Parameters<Client['command']>[0]): Promise<void> {
  const started = performance.now();
  const ack = await c.command(command, { id: commandId() });
  samples.ack?.push(performance.now() - started);
  if (!ack.ok) errors++;
}

/** Everyone presses ready; records how long until every client sees the next phase. */
async function advance(clients: Client[]): Promise<void> {
  const version = clients[0]?.view?.phaseVersion ?? 0;
  const started = performance.now();
  await Promise.all(clients.map((c) => timed(c, { type: 'setReady', ready: true })));
  await Promise.all(clients.map((c) => c.until((v) => v.phaseVersion > version, 30_000)));
  samples.fanout?.push(performance.now() - started);
}

async function playRoom(index: number, rounds: number): Promise<void> {
  const players = 4 + (index % 9);
  let t = performance.now();
  const hostSeat = await createRoom('Host', 'fox', {
    length: 'standard',
    beginner: false,
    pace: 'relaxed',
  });
  samples.join?.push(performance.now() - t);
  const seats = [hostSeat];
  for (let i = 2; i <= players; i++) {
    t = performance.now();
    seats.push(await joinRoom(hostSeat.roomCode, `P${i}`));
    samples.join?.push(performance.now() - t);
  }
  const clients: Client[] = [];
  for (const seat of seats) {
    t = performance.now();
    clients.push(await Client.connect(seat));
    samples.connect?.push(performance.now() - t);
  }
  try {
    await Promise.all(clients.slice(1).map((c) => timed(c, { type: 'setReady', ready: true })));
    await timed(clients[0] as Client, { type: 'start' });
    await Promise.all(clients.map((c) => c.until((v) => v.phase === 'ROLE_REVEAL')));
    await advance(clients); // -> intelligence
    for (let r = 0; r < rounds; r++) {
      await Promise.all(
        clients.map((c, i) => (i % 3 === 0 ? timed(c, { type: 'buyIntel' }) : Promise.resolve())),
      );
      await advance(clients); // -> negotiation
      await Promise.all(
        clients.map((c, i) =>
          i % 2 === 0 ? timed(c, { type: 'chat', kind: 'preset', text: 'in2' }) : Promise.resolve(),
        ),
      );
      await advance(clients); // -> commitment
      const version = clients[0]?.view?.phaseVersion ?? 0;
      const started = performance.now();
      await Promise.all(clients.map((c, i) => timed(c, { type: 'commit', amount: i % 4 })));
      await Promise.all(clients.map((c) => c.until((v) => v.phaseVersion > version, 30_000)));
      samples.fanout?.push(performance.now() - started);
      await advance(clients); // -> summary
      await advance(clients); // -> next intelligence (or reckoning)
    }
  } finally {
    for (const c of clients) c.close();
  }
}

async function startServer(port: number): Promise<ChildProcess> {
  const root = resolve(import.meta.dirname, '..');
  const state = resolve(root, '.wrangler/load-state');
  rmSync(state, { recursive: true, force: true });
  const child = spawn(
    'pnpm',
    [
      'exec',
      'wrangler',
      'dev',
      '--port',
      String(port),
      '--ip',
      '127.0.0.1',
      '--var',
      'TEST_MODE:1',
      '--persist-to',
      state,
    ],
    {
      cwd: resolve(root, 'apps/worker'),
      stdio: 'ignore',
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32',
    },
  );
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 180; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return child;
    } catch {
      // starting
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}

/** Stops the server tree and waits for it, so its storage directory is released. */
async function stop(child: ChildProcess | null): Promise<void> {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    await new Promise<void>((done) =>
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).on(
        'exit',
        () => done(),
      ),
    );
  } else {
    process.kill(-child.pid, 'SIGTERM');
  }
}

async function main(): Promise<void> {
  const opts = parse(process.argv.slice(2));
  let server: ChildProcess | null = null;
  if (!process.env.SYNDICATE_BASE_URL) {
    server = await startServer(8794);
    process.env.SYNDICATE_BASE_URL = 'http://127.0.0.1:8794';
  }
  const started = Date.now();
  let failedRooms = 0;
  let next = 0;
  const worker = async () => {
    while (next < opts.rooms) {
      const index = next++;
      try {
        await playRoom(index, opts.rounds);
      } catch (err) {
        failedRooms++;
        console.error(`room ${index}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(opts.concurrency, opts.rooms) }, worker));
  } finally {
    await stop(server);
  }
  const seconds = (Date.now() - started) / 1000;
  const players = Array.from({ length: opts.rooms }, (_, i) => 4 + (i % 9)).reduce(
    (a, b) => a + b,
    0,
  );
  const row = (name: string) => {
    const v = samples[name] ?? [];
    return `| ${name} | ${v.length} | ${pctl(v, 50).toFixed(1)} | ${pctl(v, 95).toFixed(1)} | ${pctl(v, 99).toFixed(1)} | ${Math.max(0, ...v).toFixed(1)} |`;
  };
  const report = [
    '# Load test report',
    '',
    `- Target: ${process.env.SYNDICATE_BASE_URL} (${server ? 'local wrangler dev started by this script' : 'existing server'})`,
    `- Machine: ${process.platform}, Node ${process.version}; client and server share this machine`,
    `- Rooms: ${opts.rooms} (${players} players, ${opts.concurrency} rooms in flight at once), ${opts.rounds} round(s) each`,
    `- Failed rooms: ${failedRooms}; rejected commands: ${errors}; wall time ${seconds.toFixed(1)} s`,
    '',
    '| Measure (ms) | Samples | p50 | p95 | p99 | max |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    row('ack'),
    row('fanout'),
    row('join'),
    row('connect'),
    '',
    '`ack`: command sent until its acknowledgement. `fanout`: last player done until every player in the room has the next phase. `join`: create/join HTTP request. `connect`: socket open + hello until first state.',
    '',
    'Local numbers measure the code path, not Cloudflare production latency (no network distance, one machine for client and server).',
  ].join('\n');
  mkdirSync('reports/load', { recursive: true });
  writeFileSync('reports/load/report.md', report);
  writeFileSync(
    'reports/load/samples.json',
    JSON.stringify({ opts, failedRooms, errors, samples }, null, 2),
  );
  console.log(report);
  if (failedRooms > 0) process.exit(1);
}

await main();
