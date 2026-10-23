import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'game-engine', root: 'packages/game-engine', include: ['test/**/*.test.ts'] },
      },
      { test: { name: 'shared', root: 'packages/shared', include: ['test/**/*.test.ts'] } },
      { test: { name: 'test-bots', root: 'packages/test-bots', include: ['test/**/*.test.ts'] } },
      { test: { name: 'worker-unit', root: 'apps/worker', include: ['test/**/*.test.ts'] } },
      { test: { name: 'web-unit', root: 'apps/web', include: ['src/**/*.test.ts'] } },
    ],
  },
});
