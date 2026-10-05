import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { sessionStore } from '../lib/session';
import { resetApiMock, server } from './api-mock';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetApiMock();
  sessionStore.set(null);
});

afterAll(() => server.close());
