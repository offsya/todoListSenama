import type { AuthResponse } from '@todo/shared';
import { renderRouter, screen } from 'expo-router/testing-library';
import { queryClient } from './lib/query-client';
import { sessionStore } from './lib/session';

// Rendering the whole router is slow on a cold transform cache (first run, CI).
jest.setTimeout(30_000);

// Unlike navigation.test.tsx, the real API client runs here, only `fetch` is faked: the point is
// the wiring between a 401 response, the session store and the route guards.
jest.mock('expo-secure-store', () => {
  const keychain = new Map<string, string>();
  return {
    getItemAsync: jest.fn((key: string) => Promise.resolve(keychain.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      keychain.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      keychain.delete(key);
      return Promise.resolve();
    }),
  };
});

const expiredSession: AuthResponse = {
  token: 'expired-token',
  user: { id: 'u1', email: 'alice@example.com', createdAt: '2026-01-01T00:00:00.000Z' },
};

/** The parts of a fetch Response the API client reads. */
const jsonResponse = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  text: () => Promise.resolve(JSON.stringify(body)),
});

const fetchMock = jest.fn();

beforeEach(() => {
  globalThis.fetch = fetchMock;
  queryClient.clear();
});

it('returns to the sign-in screen when the API rejects the stored token', async () => {
  fetchMock.mockResolvedValue(
    jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Token has expired' } }),
  );
  sessionStore.set(expiredSession);
  const app = renderRouter('./src/app', { initialUrl: '/' });
  await app;

  expect(await screen.findByText('Welcome back')).toBeOnTheScreen();
  expect(app.getPathname()).toBe('/sign-in');
  expect(sessionStore.getState().session).toBeNull();
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringMatching(/\/todos$/),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer expired-token' }),
    }),
  );
});
