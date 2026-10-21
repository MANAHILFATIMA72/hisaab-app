import type { SQLiteDatabase } from 'expo-sqlite';

import { listBudgets, listCategories, markAlertSent, spentByCategory } from '@/db/repo';
import type { TFunction } from '@/i18n';
import { crossedThresholds } from '@/lib/budget';
import type { Period } from '@/lib/dates';
import { categoryName } from '@/state/labels';

import { notifyNow } from './notifications';

/**
 * Called after an expense is saved. Fires an 80% or 100% alert for the category budget and
 * the overall budget, at most once per threshold per period. Returns the messages it fired.
 */
export async function checkBudgetAlerts(
  db: SQLiteDatabase,
  period: Period,
  t: TFunction,
  expense: { categoryId: string | null; amount: number },
): Promise<string[]> {
  const budgets = await listBudgets(db);
  if (!budgets.length) return [];
  const spent = await spentByCategory(db, period);
  const categories = await listCategories(db, true);
  const cat = categories.find((c) => c.id === expense.categoryId);
  const rollupId = cat?.parent_id ?? cat?.id ?? null;
  const totalSpent = [...spent.values()].reduce((a, b) => a + b, 0);

  const messages: string[] = [];
  for (const b of budgets) {
    let after: number;
    let name: string;
    if (b.category_id === null) {
      after = totalSpent;
      name = t('budget.overall');
    } else if (b.category_id === rollupId) {
      after = spent.get(b.category_id) ?? 0;
      name = categoryName(
        categories.find((c) => c.id === b.category_id),
        t,
      );
    } else continue;

    for (const level of crossedThresholds(after - expense.amount, expense.amount, b.amount)) {
      const fresh = await markAlertSent(db, `${period.start}:${b.category_id ?? 'total'}:${level}`);
      if (!fresh) continue;
      const msg = level === 80 ? t('budget.alert80', { name }) : t('budget.alert100', { name });
      messages.push(msg);
      await notifyNow(t('budget.alert80Title'), msg);
    }
  }
  return messages;
}
