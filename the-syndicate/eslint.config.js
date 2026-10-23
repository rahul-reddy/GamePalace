import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.wrangler/**',
      'playwright-report/**',
      'test-results/**',
      'reports/**',
      'artifacts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': 'off',
    },
  },
  {
    // The engine must stay deterministic: no ambient randomness or clocks.
    files: ['packages/game-engine/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use rngFor(seed, ...) in the engine.' },
        { object: 'Date', property: 'now', message: 'The engine takes time as input.' },
        { object: 'crypto', property: 'getRandomValues', message: 'Seeds come from the server.' },
      ],
      'no-restricted-globals': ['error', 'setTimeout', 'setInterval', 'fetch'],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'packages/ui/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
);
