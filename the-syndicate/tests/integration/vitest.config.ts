import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Integration and security tests talk to a real `wrangler dev` (workerd runtime,
// Durable Objects with SQLite, alarms) over real HTTP and WebSockets.
export default defineConfig({
  test: {
    root: resolve(import.meta.dirname, '../..'),
    include: ['tests/integration/**/*.test.ts', 'tests/security/**/*.test.ts'],
    globalSetup: ['tests/integration/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
