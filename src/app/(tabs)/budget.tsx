import { useState } from 'react';
import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { listBudgets, listCategories, setBudget, spentByCategory } from '@/db/repo';
import { budgetStatus, progress } from '@/lib/budget';
import type { Category } from '@/lib/types';
import { useApp, useLoad } from '@/state/app';
import { categoryName } from '@/state/labels';
import { AmountPrompt } from '@/ui/amount-prompt';
import { Button, Card, CategoryIcon, Divider, ProgressBar, Row, Screen, SectionTitle, Text } from '@/ui/kit';

type Editing = { categoryId: string | null; title: string; initial?: number } | null;

export default function BudgetScreen() {
  const { db, t, colors, money, period, date, changed } = useApp();
  const [editing, setEditing] = useState<Editing>(null);

  const data = useLoad(
    async (d) => {
      const [budgets, categories, spent] = await Promise.all([
        listBudgets(d),
        listCategories(d),
        spentByCategory(d, period),
      ]);
      const limits = new Map(budgets.map((b) => [b.category_id, b.amount]));
      const expenseCats = categories.filter((c) => c.kind === 'expense' && !c.parent_id);
      const totalSpent = [...spent.values()].reduce((a, b) => a + b, 0);
      const budgetedSpent = expenseCats.filter((c) => limits.has(c.id)).reduce((a, c) => a + (spent.get(c.id) ?? 0), 0);
      return { limits, expenseCats, spent, totalSpent, unbudgeted: totalSpent - budgetedSpent };
    },
    [period.start, period.end],
  );

  if (!data) return <Screen>{null}</Screen>;
  const overall = data.limits.get(null) ?? 0;

  const statusColor = (spent: number, limit: number) => {
    const s = budgetStatus(spent, limit);
    return s === 'over' ? colors.danger : s === 'warning' ? colors.warning : colors.primary;
  };

  const sorted = [...data.expenseCats].sort((a, b) => {
    const la = data.limits.has(a.id) ? 1 : 0;
    const lb = data.limits.has(b.id) ? 1 : 0;
    return lb - la || (data.spent.get(b.id) ?? 0) - (data.spent.get(a.id) ?? 0);
  });

  return (
    <Screen>
      <Text muted>{t('budget.period', { start: date(period.start), end: date(period.end) })}</Text>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="heading">{t('budget.monthly')}</Text>
          <Button
            kind="ghost"
            title={overall ? t('common.edit') : t('budget.setLimit')}
            onPress={() => setEditing({ categoryId: null, title: t('budget.monthly'), initial: overall })}
          />
        </Row>
        {overall > 0 ? (
          <>
            <Text variant="title">
              {t('budget.spentOf', {
                spent: money(data.totalSpent, { ignoreHidden: true }),
                limit: money(overall, { ignoreHidden: true }),
              })}
            </Text>
            <ProgressBar value={progress(data.totalSpent, overall)} color={statusColor(data.totalSpent, overall)} />
            <Text variant="caption" color={data.totalSpent > overall ? colors.danger : colors.textSecondary}>
              {data.totalSpent > overall
                ? t('budget.over', { amount: money(data.totalSpent - overall, { ignoreHidden: true }) })
                : t('budget.left', { amount: money(overall - data.totalSpent, { ignoreHidden: true }) })}
            </Text>
          </>
        ) : (
          <Text muted>{t('budget.monthlyHint')}</Text>
        )}
        <Text variant="caption" muted>
          {t('budget.suggestion')}
        </Text>
      </Card>

      <SectionTitle>{t('budget.byCategory')}</SectionTitle>
      <Card>
        {sorted.map((c, i) => (
          <View key={c.id}>
            {i > 0 && <Divider />}
            <CategoryBudgetRow
              category={c}
              spent={data.spent.get(c.id) ?? 0}
              limit={data.limits.get(c.id)}
              color={statusColor(data.spent.get(c.id) ?? 0, data.limits.get(c.id) ?? 0)}
              onPress={() =>
                setEditing({ categoryId: c.id, title: categoryName(c, t), initial: data.limits.get(c.id) })
              }
            />
          </View>
        ))}
      </Card>

      <AmountPrompt
        visible={!!editing}
        title={editing?.title ?? ''}
        hint={editing?.categoryId === null ? t('budget.monthlyHint') : undefined}
        initial={editing?.initial}
        onClose={() => setEditing(null)}
        onRemove={
          editing?.initial
            ? async () => {
                await setBudget(db, editing.categoryId, 0);
                setEditing(null);
                changed();
              }
            : undefined
        }
        onSave={async (minor) => {
          if (!editing) return;
          await setBudget(db, editing.categoryId, minor);
          setEditing(null);
          changed();
        }}
      />
    </Screen>
  );
}

function CategoryBudgetRow({
  category,
  spent,
  limit,
  color,
  onPress,
}: {
  category: Category;
  spent: number;
  limit?: number;
  color: string;
  onPress: () => void;
}) {
  const { t, money, colors } = useApp();
  return (
    <View style={{ paddingVertical: Spacing.two, gap: Spacing.one }}>
      <Row gap={Spacing.three}>
        <CategoryIcon icon={category.icon} color={category.color} size={34} />
        <View style={{ flex: 1 }}>
          <Text variant="label">{categoryName(category, t)}</Text>
          <Text variant="caption" muted>
            {limit
              ? t('budget.spentOf', {
                  spent: money(spent, { ignoreHidden: true }),
                  limit: money(limit, { ignoreHidden: true }),
                })
              : money(spent, { ignoreHidden: true })}
          </Text>
        </View>
        <Button kind="ghost" title={limit ? t('common.edit') : t('budget.setLimit')} onPress={onPress} />
      </Row>
      {limit ? <ProgressBar value={progress(spent, limit)} color={color} /> : null}
      {limit && spent > limit ? (
        <Text variant="caption" color={colors.danger}>
          {t('budget.over', { amount: money(spent - limit, { ignoreHidden: true }) })}
        </Text>
      ) : null}
    </View>
  );
}
