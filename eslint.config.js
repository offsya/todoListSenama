import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/coverage/',
    'apps/mobile/.expo/',
    'apps/mobile/android/',
    'apps/mobile/ios/',
    'apps/mobile/expo-env.d.ts',
  ]),

  {
    files: ['**/*.{js,cjs,mjs,ts,tsx}'],
    extends: [js.configs.recommended],
  },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Allow `onClick={async () => ...}` in JSX; floating promises are still reported.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  // Node.js code: API server, shared package and tooling configs.
  {
    files: ['apps/server/**/*.ts', 'packages/shared/**/*.ts', '**/*.config.{js,cjs,mjs,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.cjs', 'apps/mobile/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },

  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },

  // Must stay last: turns off stylistic rules that conflict with Prettier.
  prettier,
]);
