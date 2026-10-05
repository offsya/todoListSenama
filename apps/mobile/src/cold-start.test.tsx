import type { AuthResponse } from '@todo/shared';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import * as SplashScreen from 'expo-splash-screen';

// Rendering the whole router is slow on a cold transform cache (first run, CI).
jest.setTimeout(30_000);

// A file of its own: the session store is a module singleton, and only a fresh module registry
// starts it in the "loading" state, as on a real app launch.

const session: AuthResponse = {
  token: 'jwt-token',
  user: { id: 'u1', email: 'alice@example.com', createdAt: '2026-01-01T00:00:00.000Z' },
};

// The keychain answers only when the test says so, like a slow device.
let mockFinishKeychainRead: (value: string | null) => void = () => undefined;

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(
    () =>
      new Promise<string | null>((resolve) => {
        mockFinishKeychainRead = resolve;
      }),
  ),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-splash-screen', () => ({
  ...jest.requireActual<object>('expo-splash-screen'),
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('./lib/api', () => ({
  api: { todos: { list: jest.fn(() => Promise.resolve([])) } },
}));

it('keeps the splash screen up until the stored session has been read', async () => {
  const app = renderRouter('./src/app', { initialUrl: '/' });
  await app;

  // Neither the sign-in screen nor the list: the guards cannot decide yet.
  expect(screen.queryByText('Welcome back')).not.toBeOnTheScreen();
  expect(screen.queryByLabelText('New todo')).not.toBeOnTheScreen();
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled();

  await act(() => {
    mockFinishKeychainRead(JSON.stringify(session));
    return Promise.resolve();
  });

  expect(
    await screen.findByText('Nothing to do yet. Add your first todo above.'),
  ).toBeOnTheScreen();
  expect(app.getPathname()).toBe('/');
  expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
});
