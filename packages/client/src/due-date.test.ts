import type { Todo } from '@todo/shared';
import { describe, expect, it } from 'vitest';
import { dayFromDate, dueDateFromDay, formatDueDate } from './due-date.js';
import { getTodoFilter, isOverdue } from './todo-filters.js';

describe('dueDateFromDay', () => {
  it('returns the end of that day in local time', () => {
    const local = new Date(dueDateFromDay('2030-05-01')!);

    expect([local.getFullYear(), local.getMonth(), local.getDate()]).toEqual([2030, 4, 1]);
    expect([local.getHours(), local.getMinutes(), local.getSeconds()]).toEqual([23, 59, 59]);
  });

  it.each([[''], ['2030-5-1'], ['2030-02-31'], ['tomorrow']])('rejects %j', (day) => {
    expect(dueDateFromDay(day)).toBeNull();
  });

  it('round-trips with dayFromDate', () => {
    expect(dayFromDate(new Date(dueDateFromDay('2030-12-31')!))).toBe('2030-12-31');
  });
});

describe('formatDueDate', () => {
  const now = new Date(2030, 4, 10, 12, 0);
  const endOf = (day: number, month = 4, year = 2030) =>
    new Date(year, month, day, 23, 59, 59, 999).toISOString();

  it.each([
    [endOf(10), 'Today'],
    [endOf(11), 'Tomorrow'],
    [endOf(9), 'Yesterday'],
    [endOf(20), 'May 20'],
    [endOf(3, 0, 2031), 'Jan 3, 2031'],
  ])('%s → %s', (dueDate, label) => {
    expect(formatDueDate(dueDate, now)).toBe(label);
  });
});

describe('filters', () => {
  const now = Date.parse('2030-05-10T12:00:00.000Z');
  const todo = (completed: boolean, dueDate: string | null): Todo => ({
    id: '1',
    text: 'T',
    completed,
    dueDate,
    attachment: null,
    createdAt: '',
    updatedAt: '',
  });
  const past = '2030-05-10T11:59:59.999Z';
  const future = '2030-05-10T12:00:00.000Z';

  it.each([
    ['active', todo(false, null), true],
    ['active', todo(false, future), true],
    ['active', todo(false, past), false],
    ['active', todo(true, future), false],
    ['done', todo(true, past), true],
    ['done', todo(false, null), false],
    ['overdue', todo(false, past), true],
    ['overdue', todo(false, future), false],
    ['overdue', todo(false, null), false],
    ['overdue', todo(true, past), false],
    ['all', todo(true, past), true],
  ] as const)('%s, %j → %s', (filter, item, expected) => {
    expect(getTodoFilter(filter).matches(item, now)).toBe(expected);
  });

  it('never counts a completed todo as overdue', () => {
    expect(isOverdue(todo(true, past), now)).toBe(false);
    expect(isOverdue(todo(false, past), now)).toBe(true);
  });
});
