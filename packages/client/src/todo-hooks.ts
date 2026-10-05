import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Todo, UpdateTodoInput } from '@todo/shared';
import { useSession, useTodoClient } from './context.js';

/** Cached per user, so signing in with another account never shows someone else's list. */
export function useTodosQueryKey() {
  const userId = useSession()?.user.id;
  return ['todos', userId] as const;
}

export function useTodos() {
  const { api } = useTodoClient();
  const queryKey = useTodosQueryKey();
  return useQuery({ queryKey, queryFn: () => api.todos.list() });
}

export function useCreateTodo() {
  const { api } = useTodoClient();
  const queryClient = useQueryClient();
  const queryKey = useTodosQueryKey();

  return useMutation({
    mutationFn: (text: string) => api.todos.create({ text }),
    onSuccess: (created) => {
      queryClient.setQueryData<Todo[]>(queryKey, (todos = []) => [created, ...todos]);
    },
  });
}

/**
 * Edits and deletions are optimistic: the list changes instantly, and is rolled back and
 * refetched if the request fails.
 */
function useOptimisticTodos() {
  const queryClient = useQueryClient();
  const queryKey = useTodosQueryKey();

  return {
    async apply(change: (todos: Todo[]) => Todo[]) {
      // An in-flight refetch must not overwrite the optimistic state.
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Todo[]>(queryKey);
      queryClient.setQueryData<Todo[]>(queryKey, (todos) => todos && change(todos));
      return { previous };
    },
    rollback(snapshot: { previous?: Todo[] } | undefined) {
      if (snapshot?.previous) queryClient.setQueryData(queryKey, snapshot.previous);
      void queryClient.invalidateQueries({ queryKey });
    },
    replace(saved: Todo) {
      queryClient.setQueryData<Todo[]>(queryKey, (todos) =>
        todos?.map((todo) => (todo.id === saved.id ? saved : todo)),
      );
    },
  };
}

export interface UpdateTodoVariables {
  id: string;
  changes: UpdateTodoInput;
}

export function useUpdateTodo() {
  const { api } = useTodoClient();
  const optimistic = useOptimisticTodos();

  return useMutation({
    mutationFn: ({ id, changes }: UpdateTodoVariables) => api.todos.update(id, changes),
    onMutate: ({ id, changes }) =>
      optimistic.apply((todos) =>
        todos.map((todo) => (todo.id === id ? { ...todo, ...changes } : todo)),
      ),
    onError: (_error, _variables, snapshot) => optimistic.rollback(snapshot),
    onSuccess: (saved) => optimistic.replace(saved),
  });
}

export function useDeleteTodo() {
  const { api } = useTodoClient();
  const optimistic = useOptimisticTodos();

  return useMutation({
    mutationFn: (id: string) => api.todos.remove(id),
    onMutate: (id) => optimistic.apply((todos) => todos.filter((todo) => todo.id !== id)),
    onError: (_error, _id, snapshot) => optimistic.rollback(snapshot),
  });
}
