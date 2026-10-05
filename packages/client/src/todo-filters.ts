import type { Todo } from '@todo/shared';

export type TodoFilter = 'all' | 'active' | 'completed';

export interface TodoFilterOption {
  value: TodoFilter;
  label: string;
  matches: (todo: Todo) => boolean;
  /** Shown when nothing matches the filter. */
  emptyMessage: string;
}

export const TODO_FILTERS: readonly TodoFilterOption[] = [
  {
    value: 'all',
    label: 'All',
    matches: () => true,
    emptyMessage: 'Nothing to do yet. Add your first todo above.',
  },
  {
    value: 'active',
    label: 'Active',
    matches: (todo) => !todo.completed,
    emptyMessage: 'No active todos. Nice work!',
  },
  {
    value: 'completed',
    label: 'Completed',
    matches: (todo) => todo.completed,
    emptyMessage: 'No completed todos yet.',
  },
];

export function getTodoFilter(value: TodoFilter): TodoFilterOption {
  return TODO_FILTERS.find((option) => option.value === value) ?? TODO_FILTERS[0]!;
}
