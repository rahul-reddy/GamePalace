import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'text-summary', 'json-summary', 'html'],
      reportsDirectory: '../../coverage/game-engine',
      thresholds: { branches: 90, statements: 90, functions: 90, lines: 90 },
    },
  },
});
