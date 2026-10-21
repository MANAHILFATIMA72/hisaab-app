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
