import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { listGroups } from '@/db/groups-repo';
import {
  listAccounts,
  listBills,
  listCategories,
  listRecurring,
  listTransactions,
  listUdhaar,
  overallBudget,
  totalsInRange,
} from '@/db/repo';
import { budgetStatus, progress, safeToSpend } from '@/lib/budget';
import { previousPeriod, today } from '@/lib/dates';
import { myTotals } from '@/lib/groups';
import { upcomingBillsTotal, upcomingTotal } from '@/lib/recurring';
import { totals as udhaarTotals, withBalances } from '@/lib/udhaar';
import { useApp, useLoad } from '@/state/app';
import { categoryMap } from '@/state/labels';
import {
  Button,
  Card,
  Divider,
  Empty,
  Fab,
  ProgressBar,
  Row,
  Screen,
  SectionTitle,
  Text,
  type IconName,
} from '@/ui/kit';
import { TxRow } from '@/ui/tx-row';

export default function Home() {
  const { t, colors, money, period, settings, setSetting, isRTL } = useApp();

  const data = useLoad(
    async (db) => {
      const now = today();
      const [accounts, monthTotals, todayTotals, recurring, bills, udhaar, recent, categories, groups] =
        await Promise.all([
          listAccounts(db),
          totalsInRange(db, period.start, period.end),
          totalsInRange(db, now, now),
          listRecurring(db),
          listBills(db),
          listUdhaar(db),
          listTransactions(db, { limit: 6 }),
          listCategories(db, true),
          listGroups(db),
        ]);
      const overall = (
        await overallBudget(db, period, previousPeriod(period, settings.monthStartDay), settings.budgetRollover)
      ).total;
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
        udhaar: (() => {
          const u = udhaarTotals(withBalances(udhaar.items, udhaar.payments));
          const g = myTotals(groups.map((x) => x.myNet));
          return { toReceive: u.toReceive + g.toReceive, toPay: u.toPay + g.toPay };
        })(),
        groups,
        recent,
        categories: categoryMap(categories),
        accounts: new Map(accounts.map((a) => [a.id, a])),
      };
    },
    [period.start, period.end, settings.budgetRollover, settings.monthStartDay],
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

        <Row>
          <QuickAction icon="remove-circle" label={t('home.quickExpense')} onPress={() => router.push('/tx/new')} />
          <QuickAction
            icon="people"
            label={t('home.quickSplit')}
            onPress={() =>
              data.groups.length === 1
                ? router.push(`/groups/bill/new?group=${data.groups[0].group.id}`)
                : data.groups.length
                  ? router.push({ pathname: '/udhaar', params: { view: 'groups' } })
                  : router.push('/groups/edit/new')
            }
          />
          <QuickAction
            icon="swap-vertical"
            label={t('home.quickUdhaar')}
            onPress={() => router.push('/udhaar/edit/new')}
          />
          <QuickAction icon="clipboard" label={t('home.quickSms')} onPress={() => router.push('/tx/new?sms=1')} />
        </Row>

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
            <Text variant="label" muted>
              {t('home.lenaDena')}
            </Text>
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

function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 4, opacity: pressed ? 0.6 : 1 })}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      <Text variant="caption" center numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
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
