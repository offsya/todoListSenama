import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Todo, UpdateTodoInput } from '@todo/shared';
import { useSession, useTodoClient } from './context.js';

/** Cached per user, so signing in with another account never shows someone else's list. */
export function useTodosQueryKey() {
  const userId = useSession()?.user.id;
  return ['todos', userId] as const;
}

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
 * Edits are applied to the cache right away (optimistic updates). Responses of overlapping
 * requests can arrive in any order, so instead of trusting each response the list is refetched
 * once the last pending mutation has settled.
 */
function useTodosCache() {
  const queryClient = useQueryClient();
  const queryKey = useTodosQueryKey();

  return {
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

export function useCreateTodo({ onError }: TodoMutationOptions = {}) {
  const { api } = useTodoClient();
  const cache = useTodosCache();

  return useMutation({
    mutationKey: TODO_MUTATION_KEY,
    mutationFn: (text: string) => api.todos.create({ text }),
    onSuccess: async (created) => {
      // A list fetched before the todo existed must not replace the one that has it.
      await cache.cancelFetches();
      cache.update((todos) => [created, ...todos]);
    },
    onError,
    onSettled: cache.syncAfterLastMutation,
  });
}

export interface UpdateTodoVariables {
  id: string;
  changes: UpdateTodoInput;
}

export function useUpdateTodo({ onError }: TodoMutationOptions = {}) {
  const { api } = useTodoClient();
  const cache = useTodosCache();

  const patch = (id: string, changes: UpdateTodoInput) =>
    cache.update((todos) => todos.map((todo) => (todo.id === id ? { ...todo, ...changes } : todo)));

  return useMutation({
    mutationKey: TODO_MUTATION_KEY,
    mutationFn: ({ id, changes }: UpdateTodoVariables) => api.todos.update(id, changes),
    onMutate: async ({ id, changes }) => {
      await cache.cancelFetches();
      const previous = cache.get()?.find((todo) => todo.id === id);
      patch(id, changes);
      return { previous };
    },
    onError: (error, { id, changes }, context) => {
      // Undo only the fields this request changed: other edits may have landed meanwhile.
      const previous = context?.previous;
      if (previous) {
        const fields = Object.keys(changes) as (keyof UpdateTodoInput)[];
        patch(id, Object.fromEntries(fields.map((field) => [field, previous[field]])));
      }
      onError?.(error);
    },
    onSettled: cache.syncAfterLastMutation,
  });
}

export function useDeleteTodo({ onError }: TodoMutationOptions = {}) {
  const { api } = useTodoClient();
  const cache = useTodosCache();

  return useMutation({
    mutationKey: TODO_MUTATION_KEY,
    mutationFn: (id: string) => api.todos.remove(id),
    onMutate: async (id) => {
      await cache.cancelFetches();
      const todos = cache.get() ?? [];
      const index = todos.findIndex((todo) => todo.id === id);
      cache.update((current) => current.filter((todo) => todo.id !== id));
      return { removed: todos[index], index };
    },
    onError: (error, _id, context) => {
      // Put the todo back where it was, unless the list already has it again.
      const removed = context?.removed;
      if (removed) {
        cache.update((todos) => {
          if (todos.some((todo) => todo.id === removed.id)) return todos;
          const restored = [...todos];
          restored.splice(Math.min(context.index, restored.length), 0, removed);
          return restored;
        });
      }
      onError?.(error);
    },
    onSettled: cache.syncAfterLastMutation,
  });
}
