import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { listBudgets, listCategories, listEventBudgets, setBudget, spentByCategory, totalsInRange } from '@/db/repo';
import {
  budgetStatus,
  dailyAllowanceBudget,
  fiftyThirtyTwenty,
  isNeed,
  progress,
  rolloverAmount,
  roundUpFriendly,
  suggestLimits,
} from '@/lib/budget';
import { previousPeriod } from '@/lib/dates';
import type { Category } from '@/lib/types';
import { useApp, useLoad } from '@/state/app';
import { categoryName } from '@/state/labels';
import { AmountPrompt } from '@/ui/amount-prompt';
import {
  Button,
  Card,
  CategoryIcon,
  Divider,
  ListRow,
  ProgressBar,
  Row,
  Screen,
  SectionTitle,
  Text,
  ToggleRow,
} from '@/ui/kit';

type Editing =
  | { kind: 'limit'; categoryId: string | null; title: string; initial?: number }
  | { kind: 'daily' | 'rule'; title: string; hint: string; initial?: number }
  | null;

export default function BudgetScreen() {
  const { db, t, colors, money, period, date, changed, settings, setSetting } = useApp();
  const [editing, setEditing] = useState<Editing>(null);

  const data = useLoad(
    async (d) => {
      const prev = previousPeriod(period, settings.monthStartDay);
      const prev2 = previousPeriod(prev, settings.monthStartDay);
      const [budgets, categories, spent, prevSpent, prev2Spent, prevTotals, events] = await Promise.all([
        listBudgets(d),
        listCategories(d),
        spentByCategory(d, period),
        spentByCategory(d, prev),
        spentByCategory(d, prev2),
        totalsInRange(d, prev.start, prev.end),
        listEventBudgets(d),
      ]);
      const limits = new Map(budgets.map((b) => [b.category_id, b.amount]));
      const expenseCats = categories.filter((c) => c.kind === 'expense' && !c.parent_id);
      const totalSpent = [...spent.values()].reduce((a, b) => a + b, 0);
      const budgetedSpent = expenseCats.filter((c) => limits.has(c.id)).reduce((a, c) => a + (spent.get(c.id) ?? 0), 0);
      const needsSpent = expenseCats.filter((c) => isNeed(c.key)).reduce((a, c) => a + (spent.get(c.id) ?? 0), 0);
      return {
        limits,
        expenseCats,
        spent,
        totalSpent,
        needsSpent,
        unbudgeted: totalSpent - budgetedSpent,
        history: [prevSpent, prev2Spent].filter((h) => h.size > 0),
        prevExpense: prevTotals.expense,
        events,
      };
    },
    [period.start, period.end, settings.monthStartDay],
  );

  if (!data) return <Screen>{null}</Screen>;
  const baseOverall = data.limits.get(null) ?? 0;
  const carried = settings.budgetRollover && baseOverall ? rolloverAmount(baseOverall, data.prevExpense) : 0;
  const overall = baseOverall + carried;
  const ruleIncome = Number(settings.ruleIncome) || 0;
  const rule = ruleIncome ? fiftyThirtyTwenty(ruleIncome) : null;

  const applySuggestion = () => {
    const limits = suggestLimits(data.history);
    if (!limits.size) {
      Alert.alert(t('budget.tplSuggest'), t('budget.tplSuggestNone'));
      return;
    }
    Alert.alert(t('budget.tplSuggest'), t('budget.tplSuggestConfirm', { count: limits.size }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.apply'),
        onPress: async () => {
          for (const [catId, amount] of limits) await setBudget(db, catId, amount);
          await setBudget(db, null, roundUpFriendly([...limits.values()].reduce((a, b) => a + b, 0)));
          changed();
        },
      },
    ]);
  };

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
            onPress={() =>
              setEditing({ kind: 'limit', categoryId: null, title: t('budget.monthly'), initial: baseOverall })
            }
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
        {carried > 0 && (
          <Text variant="caption" color={colors.income}>
            {t('budget.rolloverHint', { amount: money(carried, { ignoreHidden: true }) })}
          </Text>
        )}
        <ToggleRow
          title={t('budget.rollover')}
          value={settings.budgetRollover}
          onChange={(v) => setSetting('budgetRollover', v)}
        />
      </Card>

      <SectionTitle>{t('budget.templates')}</SectionTitle>
      <Text variant="caption" muted>
        {t('budget.templatesHint')}
      </Text>
      <Card style={{ paddingVertical: Spacing.one }}>
        <ListRow
          icon="sunny-outline"
          title={t('budget.tplDaily')}
          subtitle={t('budget.tplDailyHint')}
          chevron
          onPress={() => setEditing({ kind: 'daily', title: t('budget.tplDaily'), hint: t('budget.tplDailyPrompt') })}
        />
        <Divider />
        <ListRow
          icon="pie-chart-outline"
          title={t('budget.tpl503020')}
          subtitle={t('budget.tpl503020Hint')}
          chevron
          onPress={() =>
            setEditing({
              kind: 'rule',
              title: t('budget.tpl503020'),
              hint: t('budget.tpl503020Prompt'),
              initial: ruleIncome || undefined,
            })
          }
        />
        <Divider />
        <ListRow
          icon="analytics-outline"
          title={t('budget.tplSuggest')}
          subtitle={t('budget.tplSuggestHint')}
          chevron
          onPress={applySuggestion}
        />
      </Card>

      {rule && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="label" style={{ flex: 1 }}>
              {t('budget.ruleTitle')}
            </Text>
            <Button kind="ghost" title={t('common.remove')} onPress={() => setSetting('ruleIncome', '')} />
          </Row>
          <RuleRow label={t('budget.needs')} spent={data.needsSpent} target={rule.needs} />
          <RuleRow label={t('budget.wants')} spent={data.totalSpent - data.needsSpent} target={rule.wants} />
          <Text variant="caption" muted>
            {t('budget.ruleSave', { amount: money(rule.savings, { ignoreHidden: true }) })}
          </Text>
        </Card>
      )}

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
                setEditing({
                  kind: 'limit',
                  categoryId: c.id,
                  title: categoryName(c, t),
                  initial: data.limits.get(c.id),
                })
              }
            />
          </View>
        ))}
      </Card>

      <SectionTitle
        action={<Button kind="ghost" icon="add" title={t('common.add')} onPress={() => router.push('/event/new')} />}>
        {t('budget.events')}
      </SectionTitle>
      <Card style={{ paddingVertical: Spacing.one }}>
        {data.events.length === 0 ? (
          <Text variant="caption" muted style={{ paddingVertical: Spacing.two }}>
            {t('budget.eventsHint')}
          </Text>
        ) : (
          data.events.map((e, i) => (
            <View key={e.id} style={{ paddingVertical: Spacing.two, gap: Spacing.one }}>
              {i > 0 && <Divider />}
              <ListRow
                title={`${e.name}  #${e.tag}`}
                subtitle={t('budget.spentOf', {
                  spent: money(e.spent, { ignoreHidden: true }),
                  limit: money(e.amount, { ignoreHidden: true }),
                })}
                chevron
                onPress={() => router.push(`/event/${e.id}`)}
              />
              <ProgressBar value={progress(e.spent, e.amount)} color={statusColor(e.spent, e.amount)} />
            </View>
          ))
        )}
      </Card>

      <AmountPrompt
        visible={!!editing}
        title={editing?.title ?? ''}
        hint={
          editing?.kind === 'limit'
            ? editing.categoryId === null
              ? t('budget.monthlyHint')
              : undefined
            : editing?.hint
        }
        initial={editing?.initial}
        onClose={() => setEditing(null)}
        onRemove={
          editing?.kind === 'limit' && editing.initial
            ? async () => {
                await setBudget(db, editing.categoryId, 0);
                setEditing(null);
                changed();
              }
            : undefined
        }
        onSave={async (minor) => {
          if (!editing) return;
          if (editing.kind === 'limit') await setBudget(db, editing.categoryId, minor);
          if (editing.kind === 'daily') await setBudget(db, null, dailyAllowanceBudget(minor, period));
          if (editing.kind === 'rule') {
            await setBudget(db, null, fiftyThirtyTwenty(minor).spending);
            await setSetting('ruleIncome', String(minor));
          }
          setEditing(null);
          changed();
        }}
      />
    </Screen>
  );
}

function RuleRow({ label, spent, target }: { label: string; spent: number; target: number }) {
  const { t, money, colors } = useApp();
  return (
    <View style={{ gap: Spacing.one }}>
      <Text variant="caption">{label}</Text>
      <Text variant="caption" muted>
        {t('budget.spentOf', {
          spent: money(spent, { ignoreHidden: true }),
          limit: money(target, { ignoreHidden: true }),
        })}
      </Text>
      <ProgressBar value={progress(spent, target)} color={spent > target ? colors.danger : colors.primary} />
    </View>
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
