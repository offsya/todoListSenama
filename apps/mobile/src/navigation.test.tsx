import type { AuthResponse, Todo } from '@todo/shared';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { sessionStore } from './lib/session';

const mockSession: AuthResponse = {
  token: 'jwt-token',
  user: { id: 'u1', email: 'alice@example.com', createdAt: '2026-01-01T00:00:00.000Z' },
};

const mockTodos: Todo[] = [
  {
    id: 't1',
    text: 'Buy milk',
    completed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

// The real screens, layout and session store run against a fake API and an in-memory keychain.
const mockApi = {
  auth: { login: jest.fn(), register: jest.fn(), me: jest.fn() },
  todos: { list: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() },
};

jest.mock('./lib/api', () => ({ api: mockApi }));

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

beforeEach(() => {
  sessionStore.set(null);
  mockApi.todos.list.mockResolvedValue(mockTodos);
});

// Renders the real route files from src/app. With the async Testing Library v14 the result is a
// promise carrying the router helpers (getPathname...): await it, but keep the original object.
const renderApp = () => renderRouter('./src/app', { initialUrl: '/' });

describe('navigation', () => {
  it('does not open the todo list without a session', async () => {
    const app = renderApp();
    await app;

    expect(await screen.findByText('Welcome back')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/sign-in');
    expect(mockApi.todos.list).not.toHaveBeenCalled();
  });

  it('signs in, keeps the token in the keychain and shows the todos', async () => {
    mockApi.auth.login.mockResolvedValue(mockSession);
    const app = renderApp();
    await app;

    await fireEvent.changeText(await screen.findByLabelText('Email'), 'alice@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct-horse-battery');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Buy milk')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/');
    expect(mockApi.auth.login).toHaveBeenCalledWith({
      email: 'alice@example.com',
      password: 'correct-horse-battery',
    });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'todo-app.session',
      JSON.stringify(mockSession),
    );
  });

  it('validates the form before calling the API', async () => {
    const app = renderApp();
    await app;

    await fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email is required')).toBeOnTheScreen();
    expect(screen.getByText('Password is required')).toBeOnTheScreen();
    expect(mockApi.auth.login).not.toHaveBeenCalled();
  });

  it('returns to the sign-in screen after signing out', async () => {
    sessionStore.set(mockSession);
    const app = renderApp();
    await app;

    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('Welcome back')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/sign-in');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('todo-app.session');
  });
});
