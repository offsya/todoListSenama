import type { Todo, TodoFilter } from '@todo/shared';

export type { TodoFilter };

export interface TodoFilterOption {
  value: TodoFilter;
  label: string;
  /**
   * Mirrors the server-side filter, so optimistic updates can take a todo out of a filtered
   * page right away (e.g. one marked done leaves "Active").
   */
  matches: (todo: Todo, now?: number) => boolean;
  /** Shown when nothing matches the filter. */
  emptyMessage: string;
}

/** Whether the due date of an unfinished todo has passed. */
export function isOverdue(todo: Todo, now = Date.now()): boolean {
  return !todo.completed && todo.dueDate !== null && Date.parse(todo.dueDate) < now;
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
    matches: (todo, now) => !todo.completed && !isOverdue(todo, now),
    emptyMessage: 'No active todos. Nice work!',
  },
  {
    value: 'done',
    label: 'Done',
    matches: (todo) => todo.completed,
    emptyMessage: 'No completed todos yet.',
  },
  {
    value: 'overdue',
    label: 'Overdue',
    matches: (todo, now) => isOverdue(todo, now),
    emptyMessage: 'Nothing overdue.',
  },
];

export function getTodoFilter(value: TodoFilter): TodoFilterOption {
  return TODO_FILTERS.find((option) => option.value === value) ?? TODO_FILTERS[0]!;
}
