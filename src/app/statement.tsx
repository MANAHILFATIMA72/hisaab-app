import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { listAccounts } from '@/db/repo';
import { previousPeriod, today } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { sharePdfReport, shareStatementPdf } from '@/services/data';
import { useApp, useLoad } from '@/state/app';
import { Button, Card, Chips, DateField, Field, Screen, Text } from '@/ui/kit';
import { showInterstitial } from '@/services/ads';
import { PageEndAd } from '@/ui/ad-banner';

type Range = 'this' | 'last' | 'three' | 'year' | 'all' | 'custom';

export default function StatementScreen() {
  const { db, t, period, settings, date, isRTL } = useApp();
  const accounts = useLoad((d) => listAccounts(d));
  const [range, setRange] = useState<Range>('this');
  const [accountId, setAccountId] = useState<string>('all');
  const [from, setFrom] = useState<string>(period.start);
  const [to, setTo] = useState<string>(today());
  const [busy, setBusy] = useState(false);

  const resolve = (): { from: string; to: string } => {
    const last = previousPeriod(period, settings.monthStartDay);
    switch (range) {
      case 'this':
        return { from: period.start, to: period.end };
      case 'last':
        return { from: last.start, to: last.end };
      case 'three':
        return { from: previousPeriod(last, settings.monthStartDay).start, to: period.end };
      case 'year':
        return { from: `${today().slice(0, 4)}-01-01`, to: `${today().slice(0, 4)}-12-31` };
      case 'all':
        return { from: '2000-01-01', to: today() };
      case 'custom':
        return from <= to ? { from, to } : { from: to, to: from };
    }
  };

  const opts = { t, money: (m: number) => formatMoney(m, settings.currency), date, rtl: isRTL };

  const run = async (kind: 'statement' | 'report') => {
    setBusy(true);
    try {
      await showInterstitial();
      const r = resolve();
      if (kind === 'statement') await shareStatementPdf(db, opts, r.from, r.to, accountId === 'all' ? null : accountId);
      else await sharePdfReport(db, opts, r.from, r.to);
    } catch {
      Alert.alert(t('statement.title'), t('statement.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('statement.title') }} />
      <Text muted>{t('statement.intro')}</Text>
      <Field label={t('statement.period')}>
        <Chips<Range>
          options={[
            { value: 'this', label: t('tx.thisPeriod') },
            { value: 'last', label: t('tx.lastPeriod') },
            { value: 'three', label: t('statement.threeMonths') },
            { value: 'year', label: t('statement.thisYear') },
            { value: 'all', label: t('tx.allTime') },
            { value: 'custom', label: t('statement.custom') },
          ]}
          value={range}
          onChange={setRange}
        />
      </Field>
      {range === 'custom' && (
        <Card>
          <Field label={t('statement.from')}>
            <DateField value={from} onChange={(v) => v && setFrom(v)} />
          </Field>
          <Field label={t('statement.to')}>
            <DateField value={to} onChange={(v) => v && setTo(v)} />
          </Field>
        </Card>
      )}
      <Field label={t('tx.account')}>
        <Chips
          options={[
            { value: 'all', label: t('statement.allAccounts') },
            ...(accounts ?? []).map((a) => ({ value: a.id, label: a.name })),
          ]}
          value={accountId}
          onChange={setAccountId}
        />
      </Field>
      <Button
        title={t('statement.create')}
        icon="document-text-outline"
        disabled={busy}
        onPress={() => run('statement')}
      />
      <Button
        kind="secondary"
        title={t('statement.summaryPdf')}
        icon="pie-chart-outline"
        disabled={busy}
        onPress={() => run('report')}
      />
      <PageEndAd />
    </Screen>
  );
}
