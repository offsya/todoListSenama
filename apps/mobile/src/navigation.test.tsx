import { getTodoFilter, type TodosQuery } from '@todo/client';
import { ApiError, type AuthResponse, type Todo, type TodoPage } from '@todo/shared';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { RefreshControl, type RefreshControlProps } from 'react-native';
import { queryClient } from './lib/query-client';
import { sessionStore } from './lib/session';

// Rendering the whole router is slow on a cold transform cache (first run, CI).
jest.setTimeout(30_000);

const SESSION_KEY = 'todo-app.session';

const mockSession: AuthResponse = {
  token: 'jwt-token',
  user: { id: 'u1', email: 'alice@example.com', createdAt: '2026-01-01T00:00:00.000Z' },
};

const makeTodo = (id: string, text: string, fields: Partial<Todo> = {}): Todo => ({
  id,
  text,
  completed: false,
  dueDate: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...fields,
});

const milk = makeTodo('t1', 'Buy milk');

const pageOf = (items: Todo[], page = 1, limit = 10): TodoPage => ({
  items: items.slice((page - 1) * limit, page * limit),
  page,
  limit,
  total: items.length,
  totalPages: Math.max(1, Math.ceil(items.length / limit)),
});

// The real screens, layout and session store run against a fake API and an in-memory keychain.
// The fake API keeps state like the real one: the app resyncs the list after every change.
let serverTodos: Todo[] = [];
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
  queryClient.clear();
  serverTodos = [milk];
  mockApi.todos.list.mockImplementation(
    ({ filter = 'all', page = 1, limit = 10 }: Partial<TodosQuery> = {}) =>
      Promise.resolve(
        pageOf(
          serverTodos.filter((todo) => getTodoFilter(filter).matches(todo)),
          page,
          limit,
        ),
      ),
  );
  mockApi.todos.create.mockImplementation(({ text }: { text: string }) => {
    const todo = makeTodo(`t${serverTodos.length + 1}`, text);
    serverTodos = [todo, ...serverTodos];
    return Promise.resolve(todo);
  });
  mockApi.todos.update.mockImplementation((id: string, changes: Partial<Todo>) => {
    serverTodos = serverTodos.map((todo) => (todo.id === id ? { ...todo, ...changes } : todo));
    return Promise.resolve(serverTodos.find((todo) => todo.id === id));
  });
  mockApi.todos.remove.mockImplementation((id: string) => {
    serverTodos = serverTodos.filter((todo) => todo.id !== id);
    return Promise.resolve(undefined);
  });
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
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SESSION_KEY, JSON.stringify(mockSession));
  });

  it('validates the form before calling the API', async () => {
    const app = renderApp();
    await app;

    await fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email is required')).toBeOnTheScreen();
    expect(screen.getByText('Password is required')).toBeOnTheScreen();
    expect(mockApi.auth.login).not.toHaveBeenCalled();
  });

  it('creates an account and opens the new, empty list', async () => {
    mockApi.auth.register.mockResolvedValue(mockSession);
    serverTodos = [];
    const app = renderApp();
    await app;

    await fireEvent.press(await screen.findByText('Create one'));
    await fireEvent.changeText(await screen.findByLabelText('Email'), 'alice@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct-horse-battery');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'correct-horse-batter');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Passwords do not match')).toBeOnTheScreen();
    expect(mockApi.auth.register).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'correct-horse-battery');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('Nothing to do yet. Add your first todo above.'),
    ).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/');
    // The API rejects unknown fields, so the confirmation must not be sent.
    expect(mockApi.auth.register).toHaveBeenCalledWith({
      email: 'alice@example.com',
      password: 'correct-horse-battery',
    });
  });

  it('shows a not-found screen for unknown links', async () => {
    const app = renderRouter('./src/app', { initialUrl: '/no-such-page' });
    await app;

    expect(await screen.findByText('Page not found')).toBeOnTheScreen();
    expect(screen.getByText('Back to my todos')).toBeOnTheScreen();
  });

  it('restores the session saved in the keychain', async () => {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(mockSession));
    await sessionStore.reload();
    const app = renderApp();
    await app;

    expect(await screen.findByText('Buy milk')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/');
  });

  it('returns to the sign-in screen after signing out', async () => {
    sessionStore.set(mockSession);
    const app = renderApp();
    await app;

    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('Welcome back')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/sign-in');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SESSION_KEY);
  });
});

describe('todo list', () => {
  beforeEach(() => {
    sessionStore.set(mockSession);
  });

  it('adds a todo', async () => {
    const app = renderApp();
    await app;

    await fireEvent.changeText(await screen.findByLabelText('New todo'), 'Buy bread');
    await fireEvent.press(screen.getByRole('button', { name: 'Add todo' }));

    expect(await screen.findByText('Buy bread')).toBeOnTheScreen();
    expect(mockApi.todos.create).toHaveBeenCalledWith({ text: 'Buy bread', dueDate: null });
  });

  it('marks a todo as completed', async () => {
    const app = renderApp();
    await app;

    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Buy milk' }));

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Buy milk' })).toBeChecked());
    expect(mockApi.todos.update).toHaveBeenCalledWith('t1', { completed: true });
  });

  it('renames a todo', async () => {
    const app = renderApp();
    await app;

    await fireEvent.press(await screen.findByRole('button', { name: 'Edit "Buy milk"' }));
    const input = screen.getByLabelText('Edit todo');
    await fireEvent.changeText(input, 'Buy oat milk');
    await fireEvent(input, 'submitEditing');

    expect(await screen.findByText('Buy oat milk')).toBeOnTheScreen();
    expect(mockApi.todos.update).toHaveBeenCalledWith('t1', { text: 'Buy oat milk' });
  });

  it('reports a failed edit and rolls it back', async () => {
    mockApi.todos.update.mockRejectedValue(
      new ApiError(500, 'INTERNAL_ERROR', 'Internal server error'),
    );
    const app = renderApp();
    await app;

    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Buy milk' }));

    expect(await screen.findByText('Internal server error')).toBeOnTheScreen();
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked(),
    );
  });

  it('deletes a todo', async () => {
    const app = renderApp();
    await app;

    await fireEvent.press(await screen.findByRole('button', { name: 'Delete "Buy milk"' }));

    await waitFor(() => expect(screen.queryByText('Buy milk')).not.toBeOnTheScreen());
    expect(mockApi.todos.remove).toHaveBeenCalledWith('t1');
  });

  it('does not create duplicates when return is pressed twice', async () => {
    mockApi.todos.create.mockImplementation(() => new Promise(() => undefined)); // slow network
    const app = renderApp();
    await app;

    const input = await screen.findByLabelText('New todo');
    await fireEvent.changeText(input, 'Buy bread');
    await fireEvent(input, 'submitEditing');
    await fireEvent(input, 'submitEditing');

    expect(mockApi.todos.create).toHaveBeenCalledTimes(1);
  });

  it('shows the refresh spinner only when the user pulls to refresh', async () => {
    // React Native's Jest mock keeps the last mounted RefreshControl in a static field.
    const refreshControl = () =>
      (RefreshControl as unknown as { latestRef?: { props: RefreshControlProps } }).latestRef
        ?.props;
    const app = renderApp();
    await app;
    await screen.findByText('Buy milk');
    mockApi.todos.list.mockImplementation(() => new Promise(() => undefined)); // resyncs hang

    // An edit resyncs the list in the background: no spinner for that.
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Buy milk' }));
    await waitFor(() => expect(mockApi.todos.list).toHaveBeenCalledTimes(2));
    // renderRouter uses fake timers, and React Query notifies React on a timer: flush it so the
    // screen renders the background refetch before the assertion.
    await act(() => {
      jest.runOnlyPendingTimers();
      return Promise.resolve();
    });
    expect(refreshControl()?.refreshing).toBe(false);

    await act(() => {
      refreshControl()?.onRefresh?.();
      return Promise.resolve();
    });
    await waitFor(() => expect(refreshControl()?.refreshing).toBe(true));
  });

  it('filters todos on the server', async () => {
    serverTodos = [
      makeTodo('t3', 'Late', { dueDate: '2020-01-01T00:00:00.000Z' }),
      makeTodo('t2', 'Finished', { completed: true }),
      milk,
    ];
    const app = renderApp();
    await app;
    await screen.findByText('Late');

    await fireEvent.press(screen.getByRole('tab', { name: 'Overdue' }));
    await waitFor(() => expect(screen.queryByText('Buy milk')).not.toBeOnTheScreen());
    expect(screen.getByText('Late')).toBeOnTheScreen();
    expect(screen.getByText('Overdue · Jan 1, 2020')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('tab', { name: 'Done' }));
    expect(await screen.findByText('Finished')).toBeOnTheScreen();
    expect(screen.queryByText('Late')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('tab', { name: 'Active' }));
    expect(await screen.findByText('Buy milk')).toBeOnTheScreen();
    expect(screen.queryByText('Finished')).not.toBeOnTheScreen();

    expect(mockApi.todos.list).toHaveBeenCalledWith({ filter: 'overdue', page: 1, limit: 10 });
    expect(mockApi.todos.list).toHaveBeenCalledWith({ filter: 'done', page: 1, limit: 10 });
    expect(mockApi.todos.list).toHaveBeenCalledWith({ filter: 'active', page: 1, limit: 10 });
  });

  it('pages through the todos with Next and Previous', async () => {
    serverTodos = Array.from({ length: 12 }, (_, i) => makeTodo(`t${12 - i}`, `Todo ${12 - i}`));
    const app = renderApp();
    await app;
    await screen.findByText('Todo 12');
    expect(screen.getByText('Page 1 of 2')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '‹ Previous' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: 'Next ›' }));

    expect(await screen.findByText('Todo 1')).toBeOnTheScreen();
    expect(screen.queryByText('Todo 12')).not.toBeOnTheScreen();
    expect(screen.getByText('Page 2 of 2')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Next ›' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: '‹ Previous' }));

    expect(await screen.findByText('Todo 12')).toBeOnTheScreen();
    expect(screen.getByText('Page 1 of 2')).toBeOnTheScreen();
  });
});
