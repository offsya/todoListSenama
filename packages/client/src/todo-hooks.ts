import {
  hashKey,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import {
  DEFAULT_PAGE_SIZE,
  type CreateTodoInput,
  type Todo,
  type TodoFilter,
  type TodoPage,
  type UpdateTodoInput,
} from '@todo/shared';
import { useState } from 'react';
import { useSession, useTodoClient } from './context.js';
import { getTodoFilter } from './todo-filters.js';

export interface TodosQuery {
  filter: TodoFilter;
  page: number;
  limit: number;
}

/**
 * Prefix of every cached page of the signed-in user's todos. Cached per user, so signing in with
 * another account never shows someone else's list.
 */
export function useTodosQueryKey() {
  const userId = useSession()?.user.id;
  return ['todos', userId] as const;
}

type TodosQueryKey = ReturnType<typeof useTodosQueryKey>;

/** Shared by all todo mutations, so the list can be resynced once the last of them settles. */
const TODO_MUTATION_KEY = ['todos'] as const;

export interface TodoMutationOptions {
  /**
   * Called for every failed request. Prefer it over the mutation's `error`, which only reflects
   * the latest call: with several edits in flight an earlier failure would go unnoticed.
   */
  onError?: (error: unknown) => void;
}

/** One page of the current user's todos, filtered on the server. */
export function useTodos({ filter, page, limit }: TodosQuery) {
  const { api } = useTodoClient();
  const [, userId] = useTodosQueryKey();
  // Never ask for the list without a session, e.g. while a screen unmounts after sign-out.
  const signedIn = userId !== undefined;
  return useQuery({
    queryKey: ['todos', userId, { filter, page, limit }] as const,
    queryFn: () => api.todos.list({ filter, page, limit }),
    enabled: signedIn,
    // Keep the current page on screen while the next one loads, but never show the previous
    // user's page to the next one.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === userId ? previous : undefined,
  });
}

/**
 * The list screen state shared by the web and mobile apps: the filter, the page and the page
 * of todos they select. Changing the filter starts again from the first page.
 */
export function useTodoList({ limit = DEFAULT_PAGE_SIZE }: { limit?: number } = {}) {
  const [filter, setFilterState] = useState<TodoFilter>('all');
  const [page, setPage] = useState(1);
  const todos = useTodos({ filter, page, limit });

  // The page is gone (its last todo was deleted, or completed under "Active"): step back to the
  // new last page. Adjusting state while rendering avoids rendering the empty page first.
  const lastPage = todos.isPlaceholderData ? undefined : todos.data?.totalPages;
  if (lastPage !== undefined && page > lastPage) setPage(lastPage);

  const totalPages = todos.data?.totalPages ?? 1;
  return {
    todos,
    filter,
    setFilter: (next: TodoFilter) => {
      setFilterState(next);
      setPage(1);
    },
    page,
    totalPages,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
    previous: () => setPage((current) => Math.max(1, current - 1)),
    next: () => setPage((current) => Math.min(totalPages, current + 1)),
  };
}

interface CachedPage {
  key: QueryKey;
  query: TodosQuery;
  data: TodoPage;
}

/**
 * All cached pages of one user. Edits are applied to them right away (optimistic updates).
 * Responses of overlapping requests can arrive in any order, so instead of trusting each
 * response the pages are refetched once the last pending mutation has settled.
 */
function todosCache(queryClient: QueryClient, queryKey: TodosQueryKey) {
  const pages = (): CachedPage[] =>
    queryClient
      .getQueriesData<TodoPage>({ queryKey })
      .flatMap(([key, data]) => (data ? [{ key, query: key[2] as TodosQuery, data }] : []));

  return {
    userId: queryKey[1],
    pages,
    /** Updates loaded pages; never creates one, as a partial page would look complete. */
    update: (change: (page: TodoPage, query: TodosQuery, key: QueryKey) => TodoPage) => {
      for (const { key, query, data } of pages()) {
        queryClient.setQueryData<TodoPage>(key, change(data, query, key));
      }
    },
    /** Stops in-flight refetches from overwriting optimistic changes with older data. */
    cancelFetches: () => queryClient.cancelQueries({ queryKey }),
    syncAfterLastMutation: () => {
      if (queryClient.isMutating({ mutationKey: TODO_MUTATION_KEY }) === 1) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  };
}

type TodosCache = ReturnType<typeof todosCache>;

/**
 * Mutations pin the cache of the user who starts them in `onMutate` and work through that from
 * then on. TanStack Query runs the later callbacks of a pending mutation with the options of
 * the latest render, which may already belong to the next user (signed out, or switched
 * accounts in another tab): going through the current query key would put one user's todo
 * into another user's list.
 */
function useTodosCache() {
  const queryClient = useQueryClient();
  const queryKey = useTodosQueryKey();

  return {
    pin: () => todosCache(queryClient, queryKey),
    /** Whether the user who started a mutation is still the one signed in. */
    isCurrent: (cache: TodosCache | undefined) => cache?.userId === queryKey[1],
  };
}

const removeFromPage = (page: TodoPage, id: string): TodoPage => {
  if (!page.items.some((todo) => todo.id === id)) return page;
  return { ...page, items: page.items.filter((todo) => todo.id !== id), total: page.total - 1 };
};

export function useCreateTodo({ onError }: TodoMutationOptions = {}) {
  const { api } = useTodoClient();
  const todos = useTodosCache();

  return useMutation({
    mutationKey: TODO_MUTATION_KEY,
    mutationFn: (input: CreateTodoInput) => api.todos.create(input),
    onMutate: () => ({ cache: todos.pin() }),
    onSuccess: async (created, _input, { cache }) => {
      // A page fetched before the todo existed must not replace the one that has it.
      await cache.cancelFetches();
      // Newest first: it goes to the top of the first page of every filter that shows it.
      // Other pages shift by one; the resync below brings them in line.
      cache.update((page, query) =>
        query.page === 1 && getTodoFilter(query.filter).matches(created)
          ? {
              ...page,
              items: [created, ...page.items].slice(0, query.limit),
              total: page.total + 1,
            }
          : page,
      );
    },
    onError: (error, _input, context) => {
      if (todos.isCurrent(context?.cache)) onError?.(error);
    },
    onSettled: (_created, _error, _input, context) => context?.cache.syncAfterLastMutation(),
  });
}

export interface UpdateTodoVariables {
  id: string;
  changes: UpdateTodoInput;
}

export function useUpdateTodo({ onError }: TodoMutationOptions = {}) {
  const { api } = useTodoClient();
  const todos = useTodosCache();

  const patch = (cache: TodosCache, id: string, changes: Partial<Todo>) =>
    cache.update((page) => ({
      ...page,
      items: page.items.map((todo) => (todo.id === id ? { ...todo, ...changes } : todo)),
    }));

  return useMutation({
    mutationKey: TODO_MUTATION_KEY,
    mutationFn: ({ id, changes }: UpdateTodoVariables) => api.todos.update(id, changes),
    onMutate: async ({ id, changes }) => {
      const cache = todos.pin();
      await cache.cancelFetches();
      const previous = cache
        .pages()
        .flatMap(({ data }) => data.items)
        .find((todo) => todo.id === id);
      patch(cache, id, changes);
      // A todo that no longer matches a filter leaves that filter's pages, like it will on the
      // server (e.g. a todo marked done disappears from "Active").
      cache.update((page, query) => {
        const todo = page.items.find((item) => item.id === id);
        return todo && !getTodoFilter(query.filter).matches(todo) ? removeFromPage(page, id) : page;
      });
      return { cache, previous };
    },
    onError: (error, { id, changes }, context) => {
      // Undo only the fields this request changed: other edits may have landed meanwhile.
      // Pages the todo has left get it back with the resync.
      if (context?.previous) {
        const { cache, previous } = context;
        const fields = Object.keys(changes) as (keyof UpdateTodoInput)[];
        patch(cache, id, Object.fromEntries(fields.map((field) => [field, previous[field]])));
      }
      if (todos.isCurrent(context?.cache)) onError?.(error);
    },
    onSettled: (_todo, _error, _variables, context) => context?.cache.syncAfterLastMutation(),
  });
}

export function useDeleteTodo({ onError }: TodoMutationOptions = {}) {
  const { api } = useTodoClient();
  const todos = useTodosCache();

  return useMutation({
    mutationKey: TODO_MUTATION_KEY,
    mutationFn: (id: string) => api.todos.remove(id),
    onMutate: async (id) => {
      const cache = todos.pin();
      await cache.cancelFetches();
      // Where the todo was on each page, to put it back if the request fails.
      const removed = cache.pages().flatMap(({ key, data }) => {
        const index = data.items.findIndex((todo) => todo.id === id);
        return index === -1 ? [] : [{ key, index, todo: data.items[index]! }];
      });
      cache.update((page) => removeFromPage(page, id));
      return { cache, removed };
    },
    onError: (error, _id, context) => {
      // Put the todo back where it was, unless the page already has it again.
      if (context) {
        const { cache, removed } = context;
        const positions = new Map(removed.map((entry) => [hashKey(entry.key), entry]));
        cache.update((page, _query, key) => {
          const entry = positions.get(hashKey(key));
          if (!entry || page.items.some((todo) => todo.id === entry.todo.id)) return page;
          const items = [...page.items];
          items.splice(Math.min(entry.index, items.length), 0, entry.todo);
          return { ...page, items, total: page.total + 1 };
        });
      }
      if (todos.isCurrent(context?.cache)) onError?.(error);
    },
    onSettled: (_result, _error, _id, context) => context?.cache.syncAfterLastMutation(),
  });
}
