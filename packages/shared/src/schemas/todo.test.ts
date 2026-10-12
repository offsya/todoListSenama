import { describe, expect, it } from 'vitest';
import {
  createTodoSchema,
  listTodosQuerySchema,
  TODO_TEXT_MAX_LENGTH,
  updateTodoSchema,
} from './todo.js';

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
      'Provide at least one field to update: text, completed or dueDate',
    );
  });

  it('rejects a non-boolean status', () => {
    expect(updateTodoSchema.safeParse({ completed: 'yes' }).success).toBe(false);
  });

  it('does not allow changing the owner', () => {
    expect(updateTodoSchema.safeParse({ text: 'Hi', owner: 'someone-else' }).success).toBe(false);
  });
});

describe('due date', () => {
  it.each([['2030-05-01T20:59:59.999Z'], ['2030-05-01T23:59:59+03:00'], [null]])(
    'accepts %j',
    (dueDate) => {
      expect(createTodoSchema.safeParse({ text: 'Pay rent', dueDate }).success).toBe(true);
      expect(updateTodoSchema.safeParse({ dueDate }).success).toBe(true);
    },
  );

  it.each([['2030-05-01'], ['tomorrow'], [1_900_000_000_000]])('rejects %j', (dueDate) => {
    expect(createTodoSchema.safeParse({ text: 'Pay rent', dueDate }).success).toBe(false);
  });
});

describe('listTodosQuerySchema', () => {
  it('defaults to the first page of 10 todos, all of them', () => {
    expect(listTodosQuerySchema.parse({})).toEqual({ filter: 'all', page: 1, limit: 10 });
  });

  it('parses query string values', () => {
    expect(listTodosQuerySchema.parse({ filter: 'overdue', page: '3', limit: '25' })).toEqual({
      filter: 'overdue',
      page: 3,
      limit: 25,
    });
  });

  it.each([
    [{ filter: 'later' }],
    [{ page: '0' }],
    [{ page: '1.5' }],
    [{ limit: '101' }],
    [{ limit: 'ten' }],
  ])('rejects %j', (query) => {
    expect(listTodosQuerySchema.safeParse(query).success).toBe(false);
  });
});
