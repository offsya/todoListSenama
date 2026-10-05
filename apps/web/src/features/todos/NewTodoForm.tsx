import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateTodo } from '@todo/client';
import { createTodoSchema, getErrorMessage, TODO_TEXT_MAX_LENGTH } from '@todo/shared';
import { useForm } from 'react-hook-form';
import { Button } from '../../components/Button';
import styles from './NewTodoForm.module.css';

/** Focus target when the last visible todo is deleted. */
export const NEW_TODO_INPUT_ID = 'new-todo';

export function NewTodoForm() {
  const createTodo = useCreateTodo();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createTodoSchema),
    defaultValues: { text: '' },
  });

  const onSubmit = handleSubmit(({ text }) => {
    createTodo.mutate(text, { onSuccess: () => reset() });
  });

  const error =
    errors.text?.message ?? (createTodo.isError ? getErrorMessage(createTodo.error) : undefined);

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.row}>
        <input
          id={NEW_TODO_INPUT_ID}
          className={styles.input}
          placeholder="What needs to be done?"
          aria-label="New todo"
          autoComplete="off"
          maxLength={TODO_TEXT_MAX_LENGTH}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'new-todo-error' : undefined}
          // The page's main action; also gives focus a place after signing in, instead of <body>.
          autoFocus
          {...register('text')}
        />
        <Button type="submit" loading={createTodo.isPending}>
          Add
        </Button>
      </div>
      {error && (
        <p id="new-todo-error" className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
