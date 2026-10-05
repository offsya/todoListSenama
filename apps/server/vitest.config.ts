import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      // A cheap hash keeps the suite fast; production uses the default cost of 15.
      PASSWORD_HASH_COST: '10',
      // Rate limits have dedicated tests with their own app instances.
      AUTH_RATE_LIMIT_MAX: '10000',
      TODOS_RATE_LIMIT_MAX: '10000',
    },
    // The first run downloads the MongoDB binary, which can take a while.
    hookTimeout: 120_000,
  },
});
