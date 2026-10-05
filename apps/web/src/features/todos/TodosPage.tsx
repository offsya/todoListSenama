import {
  getTodoFilter,
  TODO_FILTERS,
  useDeleteTodo,
  useTodos,
  useUpdateTodo,
  type TodoFilter,
} from '@todo/client';
import { getErrorMessage, type Todo } from '@todo/shared';
import { useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { NewTodoForm } from './NewTodoForm';
import { TodoItem } from './TodoItem';
import styles from './TodosPage.module.css';

export function TodosPage() {
  const todos = useTodos();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const [filter, setFilter] = useState<TodoFilter>('all');

  // Edits are optimistic, so failures are reported here: the item itself may be filtered out.
  const actionError = updateTodo.error ?? deleteTodo.error;
  const dismissActionError = () => {
    updateTodo.reset();
    deleteTodo.reset();
  };

  const renderList = (items: Todo[]) => {
    const activeFilter = getTodoFilter(filter);
    const visible = items.filter(activeFilter.matches);

    return (
      <>
        <div className={styles.toolbar}>
          <div className={styles.filters} role="group" aria-label="Filter todos">
            {TODO_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={styles.filter}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
                <span className={styles.count}>{items.filter(option.matches).length}</span>
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className={styles.empty}>{activeFilter.emptyMessage}</p>
        ) : (
          <ul className={styles.list} aria-label="Todos">
            {visible.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={(completed) => updateTodo.mutate({ id: todo.id, changes: { completed } })}
                onRename={(text) => updateTodo.mutate({ id: todo.id, changes: { text } })}
                onDelete={() => deleteTodo.mutate(todo.id)}
              />
            ))}
          </ul>
        )}
      </>
    );
  };

  const activeCount = todos.data?.filter((todo) => !todo.completed).length ?? 0;

  return (
    <section className={styles.page}>
      <title>My todos · Todo</title>
      <header className={styles.header}>
        <h1 className={styles.title}>My todos</h1>
        {todos.data && todos.data.length > 0 && (
          <p className={styles.summary}>
            {activeCount === 0 ? 'All done' : `${activeCount} left to do`}
          </p>
        )}
      </header>

      <NewTodoForm />

      {actionError && (
        <Alert
          action={
            <Button variant="ghost" onClick={dismissActionError}>
              Dismiss
            </Button>
          }
        >
          {getErrorMessage(actionError)}
        </Alert>
      )}

      <div className={styles.card}>
        {todos.isPending ? (
          <div className={styles.state}>
            <Spinner label="Loading todos" />
          </div>
        ) : todos.isError ? (
          <div className={styles.state}>
            <Alert
              action={
                <Button variant="ghost" onClick={() => void todos.refetch()}>
                  Retry
                </Button>
              }
            >
              {getErrorMessage(todos.error)}
            </Alert>
          </div>
        ) : (
          renderList(todos.data)
        )}
      </div>
    </section>
  );
}
