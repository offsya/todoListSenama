import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError, type ApiClient, type Todo, type TodoPage } from '@todo/shared';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TodoClientProvider } from './context.js';
import { createQueryClient } from './query-client.js';
import { createSessionStore, type KeyValueStorage } from './session-store.js';
import {
  useCreateTodo,
  useDeleteTodo,
  useTodoList,
  useTodos,
  useUpdateTodo,
  type TodosQuery,
} from './todo-hooks.js';

const makeTodo = (id: string, text: string, fields: Partial<Todo> = {}): Todo => ({
  id,
  text,
  completed: false,
  dueDate: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...fields,
});

const [a, b, c] = [makeTodo('a', 'A'), makeTodo('b', 'B'), makeTodo('c', 'C')];

const pageOf = (items: Todo[], fields: Partial<TodoPage> = {}): TodoPage => ({
  items,
  page: 1,
  limit: 10,
  total: items.length,
  totalPages: Math.max(1, Math.ceil(items.length / 10)),
  ...fields,
});

const ALL: TodosQuery = { filter: 'all', page: 1, limit: 10 };
const ACTIVE: TodosQuery = { filter: 'active', page: 1, limit: 10 };

const serverError = () => new ApiError(500, 'INTERNAL_ERROR', 'Internal server error');

const otherSession = { token: 't2', user: { id: 'u2', email: 'b@example.com', createdAt: '' } };

/** A request the test settles by hand; settling returns a promise to pass to `act`. */
function deferred<T>() {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolvePromise = res;
    rejectPromise = rej;
  });
  const settled = () =>
    promise.then(
      () => undefined,
      () => undefined,
    );
  return {
    promise,
    resolve: (value: T) => {
      resolvePromise(value);
      return settled();
    },
    reject: (error: unknown) => {
      rejectPromise(error);
      return settled();
    },
  };
}

const memoryStorage: KeyValueStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

/**
 * The first list request returns `initial`; later ones (the resync after mutations) never
 * resolve, so assertions see exactly what the optimistic updates and rollbacks left in the cache.
 */
function setup(initial: Todo[] | Error, todos: Partial<ApiClient['todos']> = {}) {
  const list = vi.fn<ApiClient['todos']['list']>();
  if (initial instanceof Error) list.mockRejectedValueOnce(initial);
  else list.mockResolvedValueOnce(pageOf(initial));
  list.mockReturnValue(new Promise(() => undefined));

  const api = { todos: { list, ...todos } } as unknown as ApiClient;
  const sessionStore = createSessionStore(memoryStorage);
  sessionStore.set({ token: 't', user: { id: 'u1', email: 'a@example.com', createdAt: '' } });
  const queryClient = createQueryClient({ queries: { retry: false } });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TodoClientProvider api={api} sessionStore={sessionStore}>
        {children}
      </TodoClientProvider>
    </QueryClientProvider>
  );
  return { list, queryClient, sessionStore, wrapper };
}

const items = (page: TodoPage | undefined) => page?.items;
const texts = (page: TodoPage | undefined) => page?.items.map((todo) => todo.text);

describe('useTodos', () => {
  it('requests the page and caches it per user and query', async () => {
    const { list, queryClient, wrapper } = setup([a]);

    const { result } = renderHook(() => useTodos(ALL), { wrapper });

    await waitFor(() => expect(items(result.current.data)).toEqual([a]));
    expect(list).toHaveBeenCalledWith(ALL);
    expect(queryClient.getQueryData(['todos', 'u1', ALL])).toEqual(pageOf([a]));
  });

  it("drops the previous user's data when the session ends", async () => {
    const { list, queryClient, sessionStore, wrapper } = setup([a]);
    const { result } = renderHook(() => useTodos(ALL), { wrapper });
    await waitFor(() => expect(items(result.current.data)).toEqual([a]));

    // e.g. the API rejected the token, or another tab signed out
    act(() => sessionStore.set(null));

    expect(queryClient.getQueryData(['todos', 'u1', ALL])).toBeUndefined();
    expect(result.current.data).toBeUndefined();
    expect(list).toHaveBeenCalledOnce(); // no request without a session
  });

  it("does not show the previous user's page while the next user's one loads", async () => {
    const { sessionStore, wrapper } = setup([a]);
    const { result } = renderHook(() => useTodos(ALL), { wrapper });
    await waitFor(() => expect(items(result.current.data)).toEqual([a]));

    act(() => sessionStore.set(otherSession));

    expect(result.current.data).toBeUndefined();
    expect(result.current.isPending).toBe(true);
  });
});

describe('useTodoList', () => {
  it('pages forward and back, keeping the current page on screen while the next loads', async () => {
    const second = deferred<TodoPage>();
    const list = vi
      .fn<ApiClient['todos']['list']>()
      .mockResolvedValueOnce(pageOf([a], { totalPages: 2, total: 11 }))
      .mockReturnValueOnce(second.promise);
    const { wrapper } = setup([], { list });
    const { result } = renderHook(() => useTodoList(), { wrapper });
    await waitFor(() => expect(items(result.current.todos.data)).toEqual([a]));
    expect(result.current).toMatchObject({
      page: 1,
      totalPages: 2,
      hasPrevious: false,
      hasNext: true,
    });

    act(() => result.current.next());

    expect(result.current.page).toBe(2);
    expect(list).toHaveBeenLastCalledWith({ filter: 'all', page: 2, limit: 10 });
    expect(items(result.current.todos.data)).toEqual([a]);
    await act(() => second.resolve(pageOf([b], { page: 2, totalPages: 2, total: 11 })));
    await waitFor(() => expect(items(result.current.todos.data)).toEqual([b]));
    expect(result.current).toMatchObject({ hasPrevious: true, hasNext: false });

    act(() => result.current.previous());

    expect(result.current.page).toBe(1);
    expect(items(result.current.todos.data)).toEqual([a]); // from the cache
  });

  it('starts from the first page when the filter changes', async () => {
    const list = vi
      .fn<ApiClient['todos']['list']>()
      .mockResolvedValueOnce(pageOf([a], { totalPages: 3, total: 21 }))
      .mockResolvedValueOnce(pageOf([b], { page: 2, totalPages: 3, total: 21 }))
      .mockResolvedValueOnce(pageOf([c]));
    const { wrapper } = setup([], { list });
    const { result } = renderHook(() => useTodoList(), { wrapper });
    await waitFor(() => expect(result.current.hasNext).toBe(true));
    act(() => result.current.next());
    await waitFor(() => expect(items(result.current.todos.data)).toEqual([b]));

    act(() => result.current.setFilter('overdue'));

    expect(result.current).toMatchObject({ filter: 'overdue', page: 1 });
    await waitFor(() => expect(items(result.current.todos.data)).toEqual([c]));
    expect(list).toHaveBeenLastCalledWith({ filter: 'overdue', page: 1, limit: 10 });
  });

  it('steps back when the current page no longer exists', async () => {
    const list = vi
      .fn<ApiClient['todos']['list']>()
      .mockResolvedValueOnce(pageOf([a], { totalPages: 2, total: 11 }))
      .mockResolvedValueOnce(pageOf([b], { page: 2, totalPages: 2, total: 11 }))
      // The last todo of page 2 was deleted elsewhere.
      .mockResolvedValueOnce(pageOf([], { page: 2, totalPages: 1, total: 10 }))
      .mockResolvedValue(pageOf([a]));
    const { wrapper } = setup([], { list });
    const { result } = renderHook(() => useTodoList(), { wrapper });
    await waitFor(() => expect(result.current.hasNext).toBe(true));
    act(() => result.current.next());
    await waitFor(() => expect(items(result.current.todos.data)).toEqual([b]));

    await act(() => result.current.todos.refetch());

    await waitFor(() => expect(result.current.page).toBe(1));
    expect(items(result.current.todos.data)).toEqual([a]);
  });
});

describe('useUpdateTodo', () => {
  it('applies the change right away and resyncs after the request', async () => {
    const request = deferred<Todo>();
    const update = vi.fn(() => request.promise);
    const { list, wrapper } = setup([a], { update });
    const { result } = renderHook(() => ({ todos: useTodos(ALL), update: useUpdateTodo() }), {
      wrapper,
    });
    await waitFor(() => expect(items(result.current.todos.data)).toEqual([a]));

    act(() => result.current.update.mutate({ id: 'a', changes: { completed: true } }));
    await waitFor(() => expect(result.current.todos.data?.items[0]?.completed).toBe(true));

    await act(() => request.resolve({ ...a, completed: true }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('takes a todo out of a filter it no longer matches', async () => {
    const update = vi.fn(() => new Promise<Todo>(() => undefined));
    const { wrapper } = setup([a, b], { update });
    const { result } = renderHook(() => ({ todos: useTodos(ACTIVE), update: useUpdateTodo() }), {
      wrapper,
    });
    await waitFor(() => expect(items(result.current.todos.data)).toEqual([a, b]));

    act(() => result.current.update.mutate({ id: 'a', changes: { completed: true } }));

    await waitFor(() => expect(texts(result.current.todos.data)).toEqual(['B']));
    expect(result.current.todos.data?.total).toBe(1);
  });

  it('reverts only the failed change when edits overlap', async () => {
    const failing = deferred<Todo>();
    const succeeding = deferred<Todo>();
    const update = vi
      .fn<ApiClient['todos']['update']>()
      .mockReturnValueOnce(failing.promise)
      .mockReturnValueOnce(succeeding.promise);
    const onError = vi.fn();
    const { wrapper } = setup([a, b], { update });
    const { result } = renderHook(
      () => ({ todos: useTodos(ALL), update: useUpdateTodo({ onError }) }),
      { wrapper },
    );
    await waitFor(() => expect(items(result.current.todos.data)).toEqual([a, b]));

    act(() => result.current.update.mutate({ id: 'a', changes: { completed: true } }));
    act(() => result.current.update.mutate({ id: 'b', changes: { text: 'B2' } }));
    await act(() => succeeding.resolve({ ...b, text: 'B2' }));
    await act(() => failing.reject(serverError()));

    await waitFor(() =>
      expect(items(result.current.todos.data)).toEqual([a, { ...b, text: 'B2' }]),
    );
    // Reported although the latest call succeeded.
    expect(onError).toHaveBeenCalledOnce();
  });

  it('reports every failure, not only the latest one', async () => {
    const update = vi.fn(() => Promise.reject(serverError()));
    const onError = vi.fn();
    const { wrapper } = setup([a, b], { update });
    const { result } = renderHook(
      () => ({ todos: useTodos(ALL), update: useUpdateTodo({ onError }) }),
      { wrapper },
    );
    await waitFor(() => expect(items(result.current.todos.data)).toEqual([a, b]));

    act(() => result.current.update.mutate({ id: 'a', changes: { completed: true } }));
    act(() => result.current.update.mutate({ id: 'b', changes: { completed: true } }));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(2));
    expect(items(result.current.todos.data)).toEqual([a, b]);
  });
});

describe('useDeleteTodo', () => {
  it('removes the todo right away and puts it back in place if the request fails', async () => {
    const request = deferred<undefined>();
    const remove = vi.fn(() => request.promise);
    const { wrapper } = setup([a, b, c], { remove });
    const { result } = renderHook(() => ({ todos: useTodos(ALL), remove: useDeleteTodo() }), {
      wrapper,
    });
    await waitFor(() => expect(items(result.current.todos.data)).toEqual([a, b, c]));

    act(() => result.current.remove.mutate('b'));
    await waitFor(() => expect(texts(result.current.todos.data)).toEqual(['A', 'C']));
    expect(result.current.todos.data?.total).toBe(2);

    await act(() => request.reject(serverError()));

    await waitFor(() => expect(result.current.todos.data).toEqual(pageOf([a, b, c])));
  });

  it('does not bring back a todo deleted while another edit failed', async () => {
    const failingUpdate = deferred<Todo>();
    const update = vi.fn(() => failingUpdate.promise);
    const remove = vi.fn(() => Promise.resolve(undefined));
    const { wrapper } = setup([a, b], { update, remove });
    const { result } = renderHook(
      () => ({ todos: useTodos(ALL), update: useUpdateTodo(), remove: useDeleteTodo() }),
      { wrapper },
    );
    await waitFor(() => expect(items(result.current.todos.data)).toEqual([a, b]));

    act(() => result.current.update.mutate({ id: 'a', changes: { completed: true } }));
    act(() => result.current.remove.mutate('b'));
    await waitFor(() => expect(remove).toHaveBeenCalled());
    await act(() => failingUpdate.reject(serverError()));

    await waitFor(() => expect(items(result.current.todos.data)).toEqual([a]));
  });
});

describe('useCreateTodo', () => {
  it('adds the created todo to the first page and resyncs', async () => {
    const create = vi.fn(() => Promise.resolve(c));
    const { list, wrapper } = setup([a, b], { create });
    const { result } = renderHook(() => ({ todos: useTodos(ALL), create: useCreateTodo() }), {
      wrapper,
    });
    await waitFor(() => expect(items(result.current.todos.data)).toEqual([a, b]));

    act(() => result.current.create.mutate({ text: 'C' }));

    await waitFor(() => expect(texts(result.current.todos.data)).toEqual(['C', 'A', 'B']));
    expect(result.current.todos.data?.total).toBe(3);
    expect(create).toHaveBeenCalledWith({ text: 'C' });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('leaves out a filter the new todo does not match', async () => {
    const overdue = makeTodo('c', 'C', { dueDate: '2020-01-01T00:00:00.000Z' });
    const create = vi.fn(() => Promise.resolve(overdue));
    const { wrapper } = setup([a], { create });
    const { result } = renderHook(() => ({ todos: useTodos(ACTIVE), create: useCreateTodo() }), {
      wrapper,
    });
    await waitFor(() => expect(items(result.current.todos.data)).toEqual([a]));

    act(() => result.current.create.mutate({ text: 'C', dueDate: overdue.dueDate }));

    await waitFor(() => expect(result.current.create.isSuccess).toBe(true));
    expect(items(result.current.todos.data)).toEqual([a]);
  });

  it("keeps a todo created just before switching accounts out of the next user's list", async () => {
    const request = deferred<Todo>();
    const create = vi.fn(() => request.promise);
    const list = vi
      .fn<ApiClient['todos']['list']>()
      .mockResolvedValueOnce(pageOf([a]))
      .mockResolvedValueOnce(pageOf([b]))
      .mockReturnValue(new Promise(() => undefined));
    const { queryClient, sessionStore, wrapper } = setup([], { create, list });
    const { result } = renderHook(() => ({ todos: useTodos(ALL), create: useCreateTodo() }), {
      wrapper,
    });
    await waitFor(() => expect(items(result.current.todos.data)).toEqual([a]));

    act(() => result.current.create.mutate({ text: 'C' }));
    // Another tab signs in as someone else before the request returns.
    act(() => sessionStore.set(otherSession));
    await waitFor(() => expect(items(result.current.todos.data)).toEqual([b]));
    await act(() => request.resolve(c));

    await waitFor(() => expect(result.current.create.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['todos', 'u2', ALL])).toEqual(pageOf([b]));
  });

  it("does not report a failure of the previous user's request", async () => {
    const request = deferred<Todo>();
    const create = vi.fn(() => request.promise);
    const onError = vi.fn();
    const { sessionStore, wrapper } = setup([a], { create });
    const { result } = renderHook(
      () => ({ todos: useTodos(ALL), create: useCreateTodo({ onError }) }),
      { wrapper },
    );
    await waitFor(() => expect(items(result.current.todos.data)).toEqual([a]));

    act(() => result.current.create.mutate({ text: 'C' }));
    act(() => sessionStore.set(otherSession));
    await act(() => request.reject(serverError()));

    await waitFor(() => expect(result.current.create.isError).toBe(true));
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not make up a list when none was loaded', async () => {
    const create = vi.fn(() => Promise.resolve(c));
    const { list, queryClient, wrapper } = setup(serverError(), { create });
    const { result } = renderHook(() => ({ todos: useTodos(ALL), create: useCreateTodo() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.todos.isError).toBe(true));

    act(() => result.current.create.mutate({ text: 'C' }));

    // The list is fetched again instead of showing a "complete" list with just one todo.
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(queryClient.getQueryData(['todos', 'u1', ALL])).toBeUndefined();
  });
});
