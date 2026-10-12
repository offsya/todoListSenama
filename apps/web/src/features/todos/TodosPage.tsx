import {
  getTodoFilter,
  TODO_FILTERS,
  useDeleteTodo,
  useTodoList,
  useUpdateTodo,
} from '@todo/client';
import { getErrorMessage, type TodoPage } from '@todo/shared';
import { useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { NewTodoForm } from './NewTodoForm';
import { TodoItem } from './TodoItem';
import styles from './TodosPage.module.css';

export function TodosPage() {
  const list = useTodoList();
  const { todos, filter } = list;
  // Edits are optimistic: a failed one is rolled back and reported here, because the item
  // itself may already be filtered out of view.
  const [actionError, setActionError] = useState<unknown>(null);
  const updateTodo = useUpdateTodo({ onError: setActionError });
  const deleteTodo = useDeleteTodo({ onError: setActionError });
  const activeFilter = getTodoFilter(filter);

  const retryButton = (
    <Button variant="ghost" onClick={() => void todos.refetch()}>
      Retry
    </Button>
  );

  const renderList = ({ items }: TodoPage) =>
    items.length === 0 ? (
      <p className={styles.empty}>{activeFilter.emptyMessage}</p>
    ) : (
      <ul className={styles.list} aria-label="Todos" aria-busy={todos.isPlaceholderData}>
        {items.map((todo) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            leavesViewOnToggle={!activeFilter.matches({ ...todo, completed: !todo.completed })}
            onToggle={(completed) => updateTodo.mutate({ id: todo.id, changes: { completed } })}
            onRename={(text) => updateTodo.mutate({ id: todo.id, changes: { text } })}
            onDelete={() => deleteTodo.mutate(todo.id)}
          />
        ))}
      </ul>
    );

  const renderContent = () => {
    // Keep showing loaded todos when a background refresh fails.
    if (todos.data) return renderList(todos.data);
    if (todos.isPending) {
      return (
        <div className={styles.state}>
          <Spinner label="Loading todos" />
        </div>
      );
    }
    return (
      <div className={styles.state}>
        <Alert action={retryButton}>{getErrorMessage(todos.error)}</Alert>
      </div>
    );
  };

  const total = todos.data?.total;

  return (
    <section className={styles.page}>
      <title>My todos · Todo</title>
      <header className={styles.header}>
        <h1 className={styles.title}>My todos</h1>
        {total !== undefined && (
          <p className={styles.summary}>{total === 1 ? '1 todo' : `${total} todos`}</p>
        )}
      </header>

      <NewTodoForm />

      {actionError !== null && (
        <Alert
          action={
            <Button variant="ghost" onClick={() => setActionError(null)}>
              Dismiss
            </Button>
          }
        >
          {getErrorMessage(actionError)}
        </Alert>
      )}
      {todos.data && todos.isError && (
        <Alert action={retryButton}>
          Could not refresh the list: {getErrorMessage(todos.error)}
        </Alert>
      )}

      <div className={styles.card}>
        <div className={styles.toolbar}>
          <div className={styles.filters} role="group" aria-label="Filter todos">
            {TODO_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={styles.filter}
                aria-pressed={filter === option.value}
                onClick={() => list.setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {renderContent()}

        {todos.data && (
          <nav className={styles.pagination} aria-label="Pages">
            <Button variant="ghost" disabled={!list.hasPrevious} onClick={list.previous}>
              ← Previous
            </Button>
            <span className={styles.pageInfo} aria-live="polite">
              Page {list.page} of {list.totalPages}
            </span>
            <Button variant="ghost" disabled={!list.hasNext} onClick={list.next}>
              Next →
            </Button>
          </nav>
        )}
      </div>
    </section>
  );
}
