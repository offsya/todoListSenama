import { z } from 'zod';

export const TODO_TEXT_MAX_LENGTH = 500;

export const todoTextSchema = z
  .string({ error: 'Text must be a string' })
  .trim()
  .min(1, 'Text must not be empty')
  .max(TODO_TEXT_MAX_LENGTH, `Text must be at most ${TODO_TEXT_MAX_LENGTH} characters`);

export const createTodoSchema = z.strictObject({
  text: todoTextSchema,
});

export const updateTodoSchema = z
  .strictObject({
    text: todoTextSchema.optional(),
    completed: z.boolean({ error: 'Completed must be a boolean' }).optional(),
  })
  .refine((input) => input.text !== undefined || input.completed !== undefined, {
    error: 'Provide at least one field to update: text or completed',
  });

export type CreateTodoInput = z.infer<typeof createTodoSchema>;
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;
