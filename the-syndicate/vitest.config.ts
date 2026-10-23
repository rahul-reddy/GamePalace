import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Property-based suites replay many complete matches; give them room on slow machines.
    testTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: { name: 'game-engine', root: 'packages/game-engine', include: ['test/**/*.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'shared', root: 'packages/shared', include: ['test/**/*.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'test-bots', root: 'packages/test-bots', include: ['test/**/*.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'worker-unit', root: 'apps/worker', include: ['test/**/*.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'web-unit', root: 'apps/web', include: ['src/**/*.test.ts'] },
      },
    ],
  },
});
