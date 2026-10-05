import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Todo, UpdateTodoInput } from '@todo/shared';
import { useSession, useTodoClient } from './context.js';

/** Cached per user, so signing in with another account never shows someone else's list. */
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

export function useTodos() {
  const { api } = useTodoClient();
  const queryKey = useTodosQueryKey();
  // Never ask for the list without a session, e.g. while a screen unmounts after sign-out.
  const signedIn = queryKey[1] !== undefined;
  return useQuery({ queryKey, queryFn: () => api.todos.list(), enabled: signedIn });
}

/**
 * One user's cached list. Edits are applied to it right away (optimistic updates). Responses of
 * overlapping requests can arrive in any order, so instead of trusting each response the list
 * is refetched once the last pending mutation has settled.
 */
function todosCache(queryClient: QueryClient, queryKey: TodosQueryKey) {
  return {
    userId: queryKey[1],
    get: () => queryClient.getQueryData<Todo[]>(queryKey),
    /** Updates a loaded list; never creates one, as a partial list would look complete. */
    update: (change: (todos: Todo[]) => Todo[]) =>
      queryClient.setQueryData<Todo[]>(queryKey, (todos) => todos && change(todos)),
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

export function useCreateTodo({ onError }: TodoMutationOptions = {}) {
  const { api } = useTodoClient();
  const todos = useTodosCache();

  return useMutation({
    mutationKey: TODO_MUTATION_KEY,
    mutationFn: (text: string) => api.todos.create({ text }),
    onMutate: () => ({ cache: todos.pin() }),
    onSuccess: async (created, _text, { cache }) => {
      // A list fetched before the todo existed must not replace the one that has it.
      await cache.cancelFetches();
      cache.update((list) => [created, ...list]);
    },
    onError: (error, _text, context) => {
      if (todos.isCurrent(context?.cache)) onError?.(error);
    },
    onSettled: (_created, _error, _text, context) => context?.cache.syncAfterLastMutation(),
  });
}

export interface UpdateTodoVariables {
  id: string;
  changes: UpdateTodoInput;
}

export function useUpdateTodo({ onError }: TodoMutationOptions = {}) {
  const { api } = useTodoClient();
  const todos = useTodosCache();

  const patch = (cache: TodosCache, id: string, changes: UpdateTodoInput) =>
    cache.update((list) => list.map((todo) => (todo.id === id ? { ...todo, ...changes } : todo)));

  return useMutation({
    mutationKey: TODO_MUTATION_KEY,
    mutationFn: ({ id, changes }: UpdateTodoVariables) => api.todos.update(id, changes),
    onMutate: async ({ id, changes }) => {
      const cache = todos.pin();
      await cache.cancelFetches();
      const previous = cache.get()?.find((todo) => todo.id === id);
      patch(cache, id, changes);
      return { cache, previous };
    },
    onError: (error, { id, changes }, context) => {
      // Undo only the fields this request changed: other edits may have landed meanwhile.
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
      const list = cache.get() ?? [];
      const index = list.findIndex((todo) => todo.id === id);
      cache.update((current) => current.filter((todo) => todo.id !== id));
      return { cache, removed: list[index], index };
    },
    onError: (error, _id, context) => {
      // Put the todo back where it was, unless the list already has it again.
      if (context?.removed) {
        const { cache, removed, index } = context;
        cache.update((list) => {
          if (list.some((todo) => todo.id === removed.id)) return list;
          const restored = [...list];
          restored.splice(Math.min(index, restored.length), 0, removed);
          return restored;
        });
      }
      if (todos.isCurrent(context?.cache)) onError?.(error);
    },
    onSettled: (_result, _error, _id, context) => context?.cache.syncAfterLastMutation(),
  });
}
