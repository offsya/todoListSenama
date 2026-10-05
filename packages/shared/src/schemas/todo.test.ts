import { describe, expect, it } from 'vitest';
import { createTodoSchema, TODO_TEXT_MAX_LENGTH, updateTodoSchema } from './todo.js';

describe('createTodoSchema', () => {
  it('trims the text', () => {
    expect(createTodoSchema.parse({ text: '  Buy milk  ' })).toEqual({ text: 'Buy milk' });
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['too long', 'a'.repeat(TODO_TEXT_MAX_LENGTH + 1)],
    ['not a string', 123],
    ['missing', undefined],
  ])('rejects text that is %s', (_, text) => {
    expect(createTodoSchema.safeParse({ text }).success).toBe(false);
  });

  it('accepts text of the maximum length', () => {
    expect(createTodoSchema.safeParse({ text: 'a'.repeat(TODO_TEXT_MAX_LENGTH) }).success).toBe(
      true,
    );
  });
});

describe('updateTodoSchema', () => {
  it.each([
    [{ text: 'New text' }],
    [{ completed: true }],
    [{ text: 'New text', completed: false }],
  ])('accepts a partial update %j', (input) => {
    expect(updateTodoSchema.safeParse(input).success).toBe(true);
  });

  it('requires at least one field', () => {
    const result = updateTodoSchema.safeParse({});

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'Provide at least one field to update: text or completed',
    );
  });

  it('rejects a non-boolean status', () => {
    expect(updateTodoSchema.safeParse({ completed: 'yes' }).success).toBe(false);
  });

  it('does not allow changing the owner', () => {
    expect(updateTodoSchema.safeParse({ text: 'Hi', owner: 'someone-else' }).success).toBe(false);
  });
});
