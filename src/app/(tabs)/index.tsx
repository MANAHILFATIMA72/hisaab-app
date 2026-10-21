import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import {
  listAccounts,
  listBills,
  listBudgets,
  listCategories,
  listRecurring,
  listTransactions,
  listUdhaar,
  totalsInRange,
} from '@/db/repo';
import { budgetStatus, progress, safeToSpend } from '@/lib/budget';
import { today } from '@/lib/dates';
import { upcomingBillsTotal, upcomingTotal } from '@/lib/recurring';
import { totals as udhaarTotals, withBalances } from '@/lib/udhaar';
import { useApp, useLoad } from '@/state/app';
import { categoryMap } from '@/state/labels';
import { Button, Card, Divider, Empty, Fab, ProgressBar, Row, Screen, SectionTitle, Text } from '@/ui/kit';
import { TxRow } from '@/ui/tx-row';

export default function Home() {
  const { t, colors, money, period, settings, setSetting, isRTL } = useApp();

  const data = useLoad(
    async (db) => {
      const now = today();
      const [accounts, budgets, monthTotals, todayTotals, recurring, bills, udhaar, recent, categories] =
        await Promise.all([
          listAccounts(db),
          listBudgets(db),
          totalsInRange(db, period.start, period.end),
          totalsInRange(db, now, now),
          listRecurring(db),
          listBills(db),
          listUdhaar(db),
          listTransactions(db, { limit: 6 }),
          listCategories(db, true),
        ]);
      const overall = budgets.find((b) => b.category_id === null)?.amount ?? 0;
      const upcomingRecurring = upcomingTotal(
        recurring.filter((r) => r.active && r.type === 'expense'),
        now,
        period.end,
      );
      const upcoming = upcomingRecurring + upcomingBillsTotal(bills, now, period.end);
      return {
        total: accounts.reduce((a, b) => a + b.balance, 0),
        overall,
        month: monthTotals,
        safe: safeToSpend({
          period,
          today: now,
          budget: overall,
          income: monthTotals.income,
          spent: monthTotals.expense,
          upcoming,
          spentToday: todayTotals.expense,
        }),
        udhaar: udhaarTotals(withBalances(udhaar.items, udhaar.payments)),
        recent,
        categories: categoryMap(categories),
        accounts: new Map(accounts.map((a) => [a.id, a])),
      };
    },
    [period.start, period.end],
  );

  if (!data) return <Screen>{null}</Screen>;
  const usage = data.overall ? progress(data.month.expense, data.overall) : 0;
  const status = budgetStatus(data.month.expense, data.overall);

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text color={colors.onPrimary}>{t('home.totalBalance')}</Text>
            <Pressable
              hitSlop={12}
              accessibilityLabel={t('settings.hideBalances')}
              onPress={() => setSetting('hideBalances', !settings.hideBalances)}>
              <Ionicons name={settings.hideBalances ? 'eye-off' : 'eye'} size={20} color={colors.onPrimary} />
            </Pressable>
          </Row>
          <Text variant="bigAmount" color={colors.onPrimary}>
            {money(data.total)}
          </Text>
          <Pressable onPress={() => router.push('/accounts')}>
            <Text variant="caption" color={colors.onPrimary}>
              {t('accounts.title')} {isRTL ? '‹' : '›'}
            </Text>
          </Pressable>
        </Card>

        <Card>
          <Text variant="label" muted>
            {t('home.safeToSpend')}
          </Text>
          {data.safe.basis === 'none' ? (
            <>
              <Text muted>{t('home.safeNoBudget')}</Text>
              <Button kind="secondary" title={t('home.setBudget')} onPress={() => router.push('/budget')} />
            </>
          ) : (
            <>
              <Text variant="bigAmount" color={data.safe.today > 0 ? colors.income : colors.danger}>
                {money(data.safe.today, { ignoreHidden: true })}
              </Text>
              <Text variant="caption" muted>
                {t('home.safeToSpendHint', {
                  perDay: money(data.safe.perDay, { ignoreHidden: true }),
                  days: data.safe.daysLeft,
                })}
              </Text>
            </>
          )}
        </Card>

        <Card>
          <Text variant="label" muted>
            {t('home.thisMonth')}
          </Text>
          <Row style={{ justifyContent: 'space-between' }}>
            <Stat
              label={t('home.income')}
              value={money(data.month.income, { ignoreHidden: true })}
              color={colors.income}
            />
            <Stat
              label={t('home.expense')}
              value={money(data.month.expense, { ignoreHidden: true })}
              color={colors.expense}
            />
            <Stat
              label={t('home.savings')}
              value={money(data.month.income - data.month.expense, { ignoreHidden: true })}
              color={colors.text}
            />
          </Row>
          {data.overall > 0 && (
            <View style={{ gap: Spacing.one, marginTop: Spacing.one }}>
              <ProgressBar
                value={usage}
                color={status === 'over' ? colors.danger : status === 'warning' ? colors.warning : colors.primary}
              />
              <Text variant="caption" muted>
                {status === 'over'
                  ? t('home.overBudget', { amount: money(data.month.expense - data.overall, { ignoreHidden: true }) })
                  : t('home.budgetUsed', { percent: Math.round(usage * 100) })}
              </Text>
            </View>
          )}
        </Card>

        {(data.udhaar.toReceive > 0 || data.udhaar.toPay > 0) && (
          <Card onPress={() => router.push('/udhaar')}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Stat
                label={t('home.toReceive')}
                value={money(data.udhaar.toReceive, { ignoreHidden: true })}
                color={colors.income}
              />
              <Stat
                label={t('home.toPay')}
                value={money(data.udhaar.toPay, { ignoreHidden: true })}
                color={colors.expense}
              />
            </Row>
          </Card>
        )}

        <SectionTitle
          action={
            <Pressable onPress={() => router.push('/history')}>
              <Text variant="label" color={colors.primary}>
                {t('common.seeAll')}
              </Text>
            </Pressable>
          }>
          {t('home.recent')}
        </SectionTitle>
        <Card style={{ paddingVertical: Spacing.one }}>
          {data.recent.length === 0 ? (
            <Empty icon="receipt-outline" text={t('home.noTransactions')} />
          ) : (
            data.recent.map((tx, i) => (
              <View key={tx.id}>
                {i > 0 && <Divider />}
                <TxRow tx={tx} categories={data.categories} accounts={data.accounts} />
              </View>
            ))
          )}
        </Card>
      </Screen>
      <Fab label={t('tx.add')} onPress={() => router.push('/tx/new')} />
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <Text variant="amount" color={color}>
        {value}
      </Text>
    </View>
  );
}
