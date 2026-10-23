import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Starts and kills its own server; runs alone.
export default defineConfig({
  test: {
    root: resolve(import.meta.dirname, '../..'),
    include: ['tests/recovery/**/*.test.ts'],
    testTimeout: 240_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
