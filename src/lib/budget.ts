import { daysLeftInPeriod, type ISODate, type Period } from './dates';

export type BudgetStatus = 'ok' | 'warning' | 'over';

export function budgetStatus(spent: number, limit: number): BudgetStatus {
  if (limit <= 0) return 'ok';
  if (spent >= limit) return 'over';
  if (spent >= limit * 0.8) return 'warning';
  return 'ok';
}

export function progress(spent: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(1, spent / limit);
}

/**
 * Which alert thresholds (80, 100) were crossed by adding `added` to `before`.
 * Used to fire a budget alert exactly once when a transaction pushes spending over a line.
 */
export function crossedThresholds(before: number, added: number, limit: number): (80 | 100)[] {
  if (limit <= 0 || added <= 0) return [];
  const after = before + added;
  const out: (80 | 100)[] = [];
  if (before < limit * 0.8 && after >= limit * 0.8 && after < limit) out.push(80);
  if (before < limit && after >= limit) out.push(100);
  return out;
}

export type SafeToSpendInput = {
  period: Period;
  today: ISODate;
  /** Monthly overall budget, or 0 when the user has not set one. */
  budget: number;
  /** Income received in this period, used when there is no budget. */
  income: number;
  /** Expenses already made in this period. */
  spent: number;
  /** Known upcoming expenses before the period ends (recurring + bills). */
  upcoming: number;
  /** Expenses already made today (so today's allowance shrinks as you spend). */
  spentToday: number;
};

export type SafeToSpend = {
  /** What can still be spent today without breaking the month. Never negative. */
  today: number;
  /** Per-day allowance for the remaining days, computed from the start of today. */
  perDay: number;
  /** Remaining for the whole period after upcoming expenses. Can be negative. */
  remaining: number;
  daysLeft: number;
  basis: 'budget' | 'income' | 'none';
};

export function safeToSpend(input: SafeToSpendInput): SafeToSpend {
  const basis = input.budget > 0 ? 'budget' : input.income > 0 ? 'income' : 'none';
  const pool = basis === 'budget' ? input.budget : basis === 'income' ? input.income : 0;
  const daysLeft = daysLeftInPeriod(input.period, input.today);
  const spentBeforeToday = input.spent - input.spentToday;
  const availableFromToday = pool - spentBeforeToday - input.upcoming;
  const perDay = Math.max(0, Math.floor(availableFromToday / daysLeft));
  return {
    today: Math.max(0, perDay - input.spentToday),
    perDay,
    remaining: pool - input.spent - input.upcoming,
    daysLeft,
    basis,
  };
}

// ---------- Templates and suggestions ----------

/** Category keys counted as needs in the 50/30/20 rule. Everything else is a want. */
export const NEED_KEYS = new Set([
  'rent',
  'hostel_rent',
  'mess',
  'groceries',
  'bills',
  'transport',
  'fees',
  'books',
  'printing',
  'health',
  'internet',
  'mobile',
  'kids',
  'house_help',
  'laundry',
  'committee',
  'staff',
  'stock',
  'tools',
]);

export function isNeed(key: string | null): boolean {
  return !!key && NEED_KEYS.has(key);
}

/** 50% needs, 30% wants, 20% savings. The spending budget is needs + wants. */
export function fiftyThirtyTwenty(income: number) {
  const needs = Math.round(income * 0.5);
  const wants = Math.round(income * 0.3);
  return { needs, wants, savings: income - needs - wants, spending: needs + wants };
}

/** Rounds up to a friendly number: Rs 100 steps below Rs 5,000, Rs 500 steps above. */
export function roundUpFriendly(minor: number): number {
  if (minor <= 0) return 0;
  const step = minor < 5000_00 ? 100_00 : 500_00;
  return Math.ceil(minor / step) * step;
}

/**
 * Suggested limit per category from what was spent in recent months (FR-28): the average,
 * rounded up to a friendly number. Months with no spending in a category still count, so a
 * one-off purchase does not become a monthly limit.
 */
export function suggestLimits(history: Map<string, number>[]): Map<string, number> {
  const out = new Map<string, number>();
  if (!history.length) return out;
  const ids = new Set(history.flatMap((h) => [...h.keys()]));
  for (const id of ids) {
    const avg = history.reduce((a, h) => a + (h.get(id) ?? 0), 0) / history.length;
    const limit = roundUpFriendly(avg);
    if (limit > 0) out.set(id, limit);
  }
  return out;
}

/** Monthly budget from a daily allowance, e.g. Rs 500 a day for a 30 day month = Rs 15,000. */
export function dailyAllowanceBudget(perDay: number, period: Period): number {
  return perDay * daysLeftInPeriod(period, period.start);
}

/** Unused budget carried into the next month (FR-32). Overspending is not carried as a penalty. */
export function rolloverAmount(previousBudget: number, previousSpent: number): number {
  return Math.max(0, previousBudget - previousSpent);
}
