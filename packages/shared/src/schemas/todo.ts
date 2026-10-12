import { z } from 'zod';

export const TODO_TEXT_MAX_LENGTH = 500;

/** Upper bound for a todo's attachment, in bytes. */
export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
/** Name of the multipart field that carries the file in `POST /todos/:id/attachment`. */
export const ATTACHMENT_FIELD = 'file';

export const todoTextSchema = z
  .string({ error: 'Text must be a string' })
  .trim()
  .min(1, 'Text must not be empty')
  .max(TODO_TEXT_MAX_LENGTH, `Text must be at most ${TODO_TEXT_MAX_LENGTH} characters`);

/**
 * The moment the todo becomes overdue, as an ISO-8601 timestamp, or `null` for no due date.
 * Clients turn a picked calendar day into the end of that day in the user's time zone.
 */
export const dueDateSchema = z.iso
  .datetime({ offset: true, error: 'Due date must be an ISO-8601 date-time' })
  .nullable();

export const createTodoSchema = z.strictObject({
  text: todoTextSchema,
  dueDate: dueDateSchema.optional(),
});

export const updateTodoSchema = z
  .strictObject({
    text: todoTextSchema.optional(),
    completed: z.boolean({ error: 'Completed must be a boolean' }).optional(),
    dueDate: dueDateSchema.optional(),
  })
  .refine(
    (input) =>
      input.text !== undefined || input.completed !== undefined || input.dueDate !== undefined,
    { error: 'Provide at least one field to update: text, completed or dueDate' },
  );

export const TODO_FILTER_VALUES = ['all', 'active', 'done', 'overdue'] as const;

/**
 * - `all` — every todo;
 * - `active` — not completed, and the due date (if any) has not passed yet;
 * - `done` — completed;
 * - `overdue` — not completed, and the due date has passed.
 */
export type TodoFilter = (typeof TODO_FILTER_VALUES)[number];

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

const positiveInt = (name: string) =>
  z.coerce
    .number({ error: `${name} must be a number` })
    .int(`${name} must be an integer`)
    .min(1, `${name} must be at least 1`);

/** Query string of `GET /todos`. */
export const listTodosQuerySchema = z.object({
  filter: z
    .enum(TODO_FILTER_VALUES, { error: `Filter must be one of: ${TODO_FILTER_VALUES.join(', ')}` })
    .default('all'),
  page: positiveInt('Page').default(1),
  limit: positiveInt('Limit')
    .max(MAX_PAGE_SIZE, `Limit must be at most ${MAX_PAGE_SIZE}`)
    .default(DEFAULT_PAGE_SIZE),
});

export type CreateTodoInput = z.infer<typeof createTodoSchema>;
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;
export type ListTodosQuery = z.infer<typeof listTodosQuerySchema>;
