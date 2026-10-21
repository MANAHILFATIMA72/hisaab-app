import type { Period } from './dates';
import type { Transaction } from './types';

export type Summary = { income: number; expense: number; savings: number };

export function summarize(txs: Pick<Transaction, 'type' | 'amount'>[]): Summary {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { income, expense, savings: income - expense };
}

export type CategorySlice = { categoryId: string | null; amount: number; share: number };

export function byCategory(
  txs: Pick<Transaction, 'type' | 'amount' | 'category_id'>[],
  type: 'expense' | 'income' = 'expense',
): CategorySlice[] {
  const map = new Map<string | null, number>();
  let total = 0;
  for (const t of txs) {
    if (t.type !== type) continue;
    map.set(t.category_id, (map.get(t.category_id) ?? 0) + t.amount);
    total += t.amount;
  }
  return [...map.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount, share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export function inPeriod<T extends { date: string }>(txs: T[], p: Period): T[] {
  return txs.filter((t) => t.date >= p.start && t.date <= p.end);
}

/** Percent change from previous to current; null when there is nothing to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export type Insight =
  | { kind: 'categoryUp'; categoryId: string | null; percent: number }
  | { kind: 'categoryDown'; categoryId: string | null; percent: number }
  | { kind: 'savedMore'; amount: number }
  | { kind: 'spentMore'; percent: number }
  | { kind: 'topCategory'; categoryId: string | null; share: number };

/** Simple, explainable insights comparing this period with the previous one. */
export function insights(
  current: Pick<Transaction, 'type' | 'amount' | 'category_id'>[],
  previous: Pick<Transaction, 'type' | 'amount' | 'category_id'>[],
): Insight[] {
  const out: Insight[] = [];
  const cur = summarize(current);
  const prev = summarize(previous);
  const totalChange = percentChange(cur.expense, prev.expense);
  if (totalChange !== null && totalChange >= 10) out.push({ kind: 'spentMore', percent: totalChange });
  if (prev.income > 0 && cur.savings > prev.savings && cur.savings > 0) {
    out.push({ kind: 'savedMore', amount: cur.savings - prev.savings });
  }

  const prevByCat = new Map(byCategory(previous).map((s) => [s.categoryId, s.amount]));
  const changes = byCategory(current)
    .map((s) => ({ s, pct: percentChange(s.amount, prevByCat.get(s.categoryId) ?? 0) }))
    .filter((c): c is { s: CategorySlice; pct: number } => c.pct !== null && Math.abs(c.pct) >= 20)
    // Ignore tiny categories so insights stay meaningful.
    .filter((c) => c.s.share >= 0.05)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 2);
  for (const c of changes) {
    out.push({
      kind: c.pct > 0 ? 'categoryUp' : 'categoryDown',
      categoryId: c.s.categoryId,
      percent: Math.abs(c.pct),
    });
  }

  const top = byCategory(current)[0];
  if (top && top.share >= 0.3) out.push({ kind: 'topCategory', categoryId: top.categoryId, share: top.share });
  return out;
}
