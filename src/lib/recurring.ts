import { addDays, addMonths, type ISODate } from './dates';
import type { Frequency } from './types';

export function nextOccurrence(date: ISODate, frequency: Frequency, anchorDay?: number): ISODate {
  switch (frequency) {
    case 'daily':
      return addDays(date, 1);
    case 'weekly':
      return addDays(date, 7);
    case 'monthly':
      return addMonths(date, 1, anchorDay);
  }
}

/**
 * All due dates from `nextDate` up to and including `until`, plus the following next date.
 * Capped so a long-forgotten daily rule cannot flood the database.
 */
export function dueOccurrences(
  nextDate: ISODate,
  frequency: Frequency,
  until: ISODate,
  max = 366,
): { dates: ISODate[]; next: ISODate } {
  const anchorDay = Number(nextDate.slice(8, 10));
  const dates: ISODate[] = [];
  let cursor = nextDate;
  while (cursor <= until && dates.length < max) {
    dates.push(cursor);
    cursor = nextOccurrence(cursor, frequency, anchorDay);
  }
  return { dates, next: cursor };
}

/** Sum of occurrences that fall after `after` and on or before `until` (used for upcoming expenses). */
export function upcomingTotal(
  rules: { amount: number; frequency: Frequency; next_date: ISODate }[],
  after: ISODate,
  until: ISODate,
): number {
  let total = 0;
  for (const r of rules) {
    const anchorDay = Number(r.next_date.slice(8, 10));
    let cursor = r.next_date;
    let guard = 0;
    while (cursor <= until && guard < 400) {
      if (cursor > after) total += r.amount;
      cursor = nextOccurrence(cursor, r.frequency, anchorDay);
      guard += 1;
    }
  }
  return total;
}

/** Total of monthly bills (by due day) that fall after `after` and on or before `until`. */
export function upcomingBillsTotal(
  bills: { amount: number; due_day: number; active: number }[],
  after: ISODate,
  until: ISODate,
): number {
  let total = 0;
  for (const b of bills) {
    if (!b.active || !b.amount) continue;
    // Walk month by month from the month of `after`, clamping the due day to each month's length.
    let cursor = addMonths(`${after.slice(0, 7)}-01`, 0, b.due_day);
    while (cursor <= until) {
      if (cursor > after) total += b.amount;
      cursor = addMonths(`${cursor.slice(0, 7)}-01`, 1, b.due_day);
    }
  }
  return total;
}
