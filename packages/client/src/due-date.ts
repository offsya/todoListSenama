/**
 * Due dates are picked as calendar days and stored as a moment: the end of that day in the
 * user's time zone. A todo due "today" is therefore overdue only after midnight.
 */

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `2030-05-01` → the ISO timestamp of 23:59:59.999 local time that day; `null` for bad input. */
export function dueDateFromDay(day: string): string | null {
  const match = DAY_PATTERN.exec(day);
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const end = new Date(year, month - 1, date, 23, 59, 59, 999);
  // new Date() rolls 2030-02-31 over into March; refuse that instead.
  if (end.getFullYear() !== year || end.getMonth() !== month - 1 || end.getDate() !== date) {
    return null;
  }
  return end.toISOString();
}

/** The local calendar day of a moment, as `YYYY-MM-DD` (the value of `<input type="date">`). */
export function dayFromDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole local days from `now` to the due date: 0 today, 1 tomorrow, -1 yesterday. */
function daysUntil(dueDate: Date, now: Date): number {
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((startOfDay(dueDate) - startOfDay(now)) / DAY_MS);
}

/** Short label for a due date: "Today", "Tomorrow", "Yesterday" or "May 1" (plus the year if needed). */
export function formatDueDate(dueDate: string, now = new Date()): string {
  const date = new Date(dueDate);
  const days = daysUntil(date, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  });
}
