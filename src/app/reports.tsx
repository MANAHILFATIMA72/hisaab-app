import { Stack } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { listAccounts, listCategories, listTransactions, listUdhaar } from '@/db/repo';
import { monthName } from '@/i18n';
import { fromISODate, nextPeriod, previousPeriod, type Period } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { byCategory, inPeriod, insights, percentChange, summarize, type Insight } from '@/lib/reports';
import { totals as udhaarTotals, withBalances } from '@/lib/udhaar';
import { shareTransactionsCsv } from '@/services/data';
import { useApp, useLoad } from '@/state/app';
import { categoryMap, categoryName } from '@/state/labels';
import { Bars, Donut, Legend, type Slice } from '@/ui/charts';
import { Button, Card, Empty, IconButton, Row, Screen, SectionTitle, Text } from '@/ui/kit';

const MAX_SLICES = 6;

export default function Reports() {
  const { db, t, colors, money, date, period: current, settings, isRTL } = useApp();
  const [period, setPeriod] = useState<Period>(current);
  const startDay = settings.monthStartDay;

  const data = useLoad(
    async (d) => {
      // Six periods ending at the selected one, for the trend chart and comparison.
      const periods: Period[] = [period];
      for (let i = 0; i < 5; i++) periods.unshift(previousPeriod(periods[0], startDay));
      const [txs, categories, accounts, udhaar] = await Promise.all([
        listTransactions(d, { from: periods[0].start, to: period.end }),
        listCategories(d, true),
        listAccounts(d),
        listUdhaar(d),
      ]);
      const u = udhaarTotals(withBalances(udhaar.items, udhaar.payments));
      return {
        periods,
        txs,
        cats: categoryMap(categories),
        netWorth: accounts.reduce((a, b) => a + b.balance, 0) + u.toReceive - u.toPay,
      };
    },
    [period.start, startDay],
  );

  // The React compiler memoizes this, so no useMemo is needed.
  const view = (() => {
    if (!data) return null;
    const cur = inPeriod(data.txs, period);
    const prev = inPeriod(data.txs, data.periods[data.periods.length - 2]);
    const sCur = summarize(cur);
    const sPrev = summarize(prev);
    const slicesRaw = byCategory(cur);
    const named = slicesRaw.map((s) => {
      const c = s.categoryId ? data.cats.get(s.categoryId) : undefined;
      // Roll subcategories into their parent so the chart stays readable.
      const parent = c?.parent_id ? data.cats.get(c.parent_id) : c;
      return {
        key: parent?.id ?? 'none',
        label: categoryName(parent, t),
        color: parent?.color ?? colors.textSecondary,
        value: s.amount,
      };
    });
    const merged = new Map<string, Slice>();
    for (const n of named) {
      const m = merged.get(n.key);
      if (m) m.value += n.value;
      else merged.set(n.key, { label: n.label, color: n.color, value: n.value });
    }
    let slices = [...merged.values()].sort((a, b) => b.value - a.value);
    if (slices.length > MAX_SLICES) {
      const rest = slices.slice(MAX_SLICES - 1).reduce((a, s) => a + s.value, 0);
      slices = [
        ...slices.slice(0, MAX_SLICES - 1),
        { label: t('cat.other_expense'), color: colors.textSecondary, value: rest },
      ];
    }
    const bars = data.periods.map((p) => {
      const s = summarize(inPeriod(data.txs, p));
      return {
        label: monthName(fromISODate(p.end).getMonth(), settings.lang).slice(0, settings.lang === 'en' ? 3 : 10),
        income: s.income,
        expense: s.expense,
      };
    });
    return { sCur, sPrev, slices, bars, insights: insights(cur, prev) };
  })();

  const insightText = (i: Insight): string => {
    const name = (id: string | null) => categoryName(id ? data?.cats.get(id) : null, t);
    switch (i.kind) {
      case 'categoryUp':
        return t('reports.insightCategoryUp', { name: name(i.categoryId), percent: i.percent });
      case 'categoryDown':
        return t('reports.insightCategoryDown', { name: name(i.categoryId), percent: i.percent });
      case 'savedMore':
        return t('reports.insightSavedMore', { amount: money(i.amount, { ignoreHidden: true }) });
      case 'spentMore':
        return t('reports.insightSpentMore', { percent: i.percent });
      case 'topCategory':
        return t('reports.insightTop', { name: name(i.categoryId), percent: Math.round(i.share * 100) });
    }
  };

  const periodLabel = `${date(period.start)} – ${date(period.end)}`;
  const isCurrent = period.start === current.start;

  const shareSummary = () => {
    if (!view) return;
    const m = (v: number) => formatMoney(v, settings.currency);
    Share.share({
      message: t('reports.summaryText', {
        period: periodLabel,
        income: m(view.sCur.income),
        expense: m(view.sCur.expense),
        savings: m(view.sCur.savings),
        top: view.slices[0] ? `${view.slices[0].label} (${m(view.slices[0].value)})` : '-',
      }),
    });
  };

  const change = view ? percentChange(view.sCur.expense, view.sPrev.expense) : null;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('reports.title') }} />
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton
          icon={isRTL ? 'chevron-forward' : 'chevron-back'}
          label={t('tx.lastPeriod')}
          onPress={() => setPeriod(previousPeriod(period, startDay))}
        />
        <Text variant="label">{periodLabel}</Text>
        <IconButton
          icon={isRTL ? 'chevron-back' : 'chevron-forward'}
          label={t('common.next')}
          color={isCurrent ? colors.border : undefined}
          onPress={() => !isCurrent && setPeriod(nextPeriod(period, startDay))}
        />
      </Row>

      {view && (
        <>
          <Card>
            <Text variant="label" muted>
              {t('reports.summary')}
            </Text>
            <Row style={{ justifyContent: 'space-between' }}>
              <Stat
                label={t('home.income')}
                value={money(view.sCur.income, { ignoreHidden: true })}
                color={colors.income}
              />
              <Stat
                label={t('home.expense')}
                value={money(view.sCur.expense, { ignoreHidden: true })}
                color={colors.expense}
              />
              <Stat
                label={t('home.savings')}
                value={money(view.sCur.savings, { ignoreHidden: true })}
                color={colors.text}
              />
            </Row>
            {change !== null && (
              <Text variant="caption" color={change > 0 ? colors.danger : colors.income}>
                {change > 0 ? '▲' : '▼'} {Math.abs(change)}% {t('home.expense')} {t('reports.vsLast')}
              </Text>
            )}
          </Card>

          <SectionTitle>{t('reports.byCategory')}</SectionTitle>
          <Card>
            {view.slices.length === 0 ? (
              <Empty icon="pie-chart-outline" text={t('reports.noData')} />
            ) : (
              <View style={{ gap: Spacing.three }}>
                <Donut
                  slices={view.slices}
                  centerLabel={t('home.expense')}
                  centerValue={money(view.sCur.expense, { ignoreHidden: true })}
                />
                <Legend slices={view.slices} format={(v) => money(v, { ignoreHidden: true })} />
              </View>
            )}
          </Card>

          {view.insights.length > 0 && (
            <>
              <SectionTitle>{t('reports.insights')}</SectionTitle>
              <Card>
                {view.insights.map((i, idx) => (
                  <Text key={idx}>• {insightText(i)}</Text>
                ))}
              </Card>
            </>
          )}

          <SectionTitle>{t('reports.trend')}</SectionTitle>
          <Card>
            <Bars groups={view.bars} />
            <Row style={{ justifyContent: 'center', gap: Spacing.three }}>
              <Text variant="caption" color={colors.income}>
                ■ {t('home.income')}
              </Text>
              <Text variant="caption" color={colors.expense}>
                ■ {t('home.expense')}
              </Text>
            </Row>
          </Card>

          <Card>
            <Text variant="label" muted>
              {t('reports.netWorth')}
            </Text>
            <Text variant="title">{money(data?.netWorth ?? 0)}</Text>
            <Text variant="caption" muted>
              {t('reports.netWorthHint')}
            </Text>
          </Card>

          <Button
            kind="secondary"
            icon="share-social-outline"
            title={t('reports.shareSummary')}
            onPress={shareSummary}
          />
          <Button
            kind="secondary"
            icon="download-outline"
            title={t('reports.exportCsv')}
            onPress={() => shareTransactionsCsv(db, t, period.start, period.end)}
          />
        </>
      )}
    </Screen>
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
