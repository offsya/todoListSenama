import { zodResolver } from '@hookform/resolvers/zod';
import { dueDateFromDay, useCreateTodo } from '@todo/client';
import { getErrorMessage, TODO_TEXT_MAX_LENGTH, todoTextSchema } from '@todo/shared';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/Button';
import styles from './NewTodoForm.module.css';

/** Focus target when the last visible todo is deleted. */
export const NEW_TODO_INPUT_ID = 'new-todo';

const newTodoFormSchema = z.object({
  text: todoTextSchema,
  /** `YYYY-MM-DD` from the date input, or empty for no due date. */
  dueDay: z.string().refine((day) => day === '' || dueDateFromDay(day) !== null, {
    error: 'Pick a valid date',
  }),
});

export function NewTodoForm() {
  const createTodo = useCreateTodo();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(newTodoFormSchema),
    defaultValues: { text: '', dueDay: '' },
  });

  const onSubmit = handleSubmit(({ text, dueDay }) => {
    const dueDate = dueDay ? dueDateFromDay(dueDay) : null;
    createTodo.mutate({ text, dueDate }, { onSuccess: () => reset() });
  });

  const error =
    errors.text?.message ??
    errors.dueDay?.message ??
    (createTodo.isError ? getErrorMessage(createTodo.error) : undefined);

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
          aria-invalid={errors.text || createTodo.isError ? true : undefined}
          aria-describedby={error ? 'new-todo-error' : undefined}
          // The page's main action; also gives focus a place after signing in, instead of <body>.
          autoFocus
          {...register('text')}
        />
        <input
          type="date"
          className={`${styles.input} ${styles.date}`}
          aria-label="Due date"
          title="Due date (optional)"
          aria-invalid={errors.dueDay ? true : undefined}
          aria-describedby={errors.dueDay ? 'new-todo-error' : undefined}
          {...register('dueDay')}
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
