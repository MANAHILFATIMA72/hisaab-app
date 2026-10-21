// Dates are stored as local 'YYYY-MM-DD' strings so that a transaction never shifts day across time zones.

export type ISODate = string;

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today(): ISODate {
  return toISODate(new Date());
}

export function addDays(s: ISODate, days: number): ISODate {
  const d = fromISODate(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Adds months while clamping to the last valid day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(s: ISODate, months: number, preferredDay?: number): ISODate {
  const d = fromISODate(s);
  const day = preferredDay ?? d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
  return toISODate(target);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const ms = fromISODate(to).getTime() - fromISODate(from).getTime();
  return Math.round(ms / 86_400_000);
}

export type Period = { start: ISODate; end: ISODate };

/**
 * The budget month that contains `date`, given the user's month start day (salary day).
 * With startDay 25, Oct 3 falls in Sep 25 – Oct 24.
 */
export function periodContaining(date: ISODate, startDay: number): Period {
  const d = fromISODate(date);
  const clampDay = (y: number, m: number) => Math.min(startDay, daysInMonth(y, m));
  let year = d.getFullYear();
  let month = d.getMonth();
  if (d.getDate() < clampDay(year, month)) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }
  const start = new Date(year, month, clampDay(year, month));
  const nextMonth = new Date(year, month + 1, 1);
  const nextStart = new Date(
    nextMonth.getFullYear(),
    nextMonth.getMonth(),
    clampDay(nextMonth.getFullYear(), nextMonth.getMonth()),
  );
  nextStart.setDate(nextStart.getDate() - 1);
  return { start: toISODate(start), end: toISODate(nextStart) };
}

export function previousPeriod(p: Period, startDay: number): Period {
  return periodContaining(addDays(p.start, -1), startDay);
}

export function nextPeriod(p: Period, startDay: number): Period {
  return periodContaining(addDays(p.end, 1), startDay);
}

/** Days left in the period including today. */
export function daysLeftInPeriod(p: Period, date: ISODate): number {
  return Math.max(1, daysBetween(date, p.end) + 1);
}
