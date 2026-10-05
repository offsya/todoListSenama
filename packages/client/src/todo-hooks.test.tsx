import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError, type ApiClient, type Todo } from '@todo/shared';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TodoClientProvider } from './context.js';
import { createSessionStore, type KeyValueStorage } from './session-store.js';
import { useDeleteTodo, useTodos, useUpdateTodo } from './todo-hooks.js';

const todo: Todo = {
  id: 't1',
  text: 'Buy milk',
  completed: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const noopStorage: KeyValueStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function setup(todos: Partial<ApiClient['todos']>) {
  const api = {
    todos: { list: vi.fn(() => Promise.resolve([todo])), ...todos },
  } as unknown as ApiClient;
  const sessionStore = createSessionStore(noopStorage);
  sessionStore.set({ token: 't', user: { id: 'u1', email: 'a@example.com', createdAt: '' } });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TodoClientProvider api={api} sessionStore={sessionStore}>
        {children}
      </TodoClientProvider>
    </QueryClientProvider>
  );
  return { api, queryClient, wrapper };
}

describe('todo hooks', () => {
  it('caches todos per user', async () => {
    const { queryClient, wrapper } = setup({});

    const { result } = renderHook(() => useTodos(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([todo]));
    expect(queryClient.getQueryData(['todos', 'u1'])).toEqual([todo]);
  });

  it('applies an update optimistically and keeps the saved version', async () => {
    const saved = { ...todo, completed: true, updatedAt: '2026-01-02T00:00:00.000Z' };
    let respond: (value: Todo) => void = () => undefined;
    const update = vi.fn(() => new Promise<Todo>((resolve) => (respond = resolve)));
    const { wrapper } = setup({ update });

    const { result } = renderHook(() => ({ todos: useTodos(), update: useUpdateTodo() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.todos.data).toEqual([todo]));

    act(() => result.current.update.mutate({ id: todo.id, changes: { completed: true } }));
    await waitFor(() => expect(result.current.todos.data?.[0]?.completed).toBe(true));

    act(() => respond(saved));
    await waitFor(() => expect(result.current.todos.data).toEqual([saved]));
  });

  it('rolls back a failed update', async () => {
    const update = vi.fn(() =>
      Promise.reject(new ApiError(500, 'INTERNAL_ERROR', 'Internal server error')),
    );
    const { wrapper } = setup({ update });

    const { result } = renderHook(() => ({ todos: useTodos(), update: useUpdateTodo() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.todos.data).toEqual([todo]));

    act(() => result.current.update.mutate({ id: todo.id, changes: { text: 'Hacked' } }));

    await waitFor(() => expect(result.current.update.isError).toBe(true));
    expect(result.current.todos.data).toEqual([todo]);
  });

  it('removes a deleted todo right away and restores it if the request fails', async () => {
    let fail: (error: Error) => void = () => undefined;
    const remove = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)));
    const { wrapper } = setup({ remove });

    const { result } = renderHook(() => ({ todos: useTodos(), remove: useDeleteTodo() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.todos.data).toEqual([todo]));

    act(() => result.current.remove.mutate(todo.id));
    await waitFor(() => expect(result.current.todos.data).toEqual([]));

    act(() => fail(new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the server.')));
    await waitFor(() => expect(result.current.todos.data).toEqual([todo]));
  });
});
