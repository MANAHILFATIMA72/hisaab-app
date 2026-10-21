import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { listAccounts, listCategories, listTransactions, listUdhaar } from '@/db/repo';
import { calculateZakat } from '@/lib/zakat';
import { parseAmount, toMajor } from '@/lib/money';
import { totals as udhaarTotals, withBalances } from '@/lib/udhaar';
import { useApp, useLoad } from '@/state/app';
import { Card, Chips, Field, Input, Row, Screen, Text } from '@/ui/kit';

type Fields = {
  cash: string;
  bank: string;
  goldTola: string;
  silverTola: string;
  goldPrice: string;
  silverPrice: string;
  stock: string;
  receivables: string;
  liabilities: string;
};

const minor = (v: string) => (v.trim() ? (parseAmount(v) ?? 0) : 0);
const num = (v: string) => {
  const n = parseFloat(v.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

type Prefill = { cash: number; bank: number; receivables: number; liabilities: number; charity: number };

export default function Zakat() {
  const prefill = useLoad(async (d) => {
    const year = new Date().getFullYear();
    const [accounts, udhaar, categories, charityTx] = await Promise.all([
      listAccounts(d),
      listUdhaar(d),
      listCategories(d, true),
      listTransactions(d, { type: 'expense', from: `${year}-01-01`, to: `${year}-12-31` }),
    ]);
    const charityIds = new Set(
      categories
        .filter((c) => c.key === 'charity' || categories.some((p) => p.key === 'charity' && p.id === c.parent_id))
        .map((c) => c.id),
    );
    const u = udhaarTotals(withBalances(udhaar.items, udhaar.payments));
    const positive = (types: string[]) =>
      accounts.filter((a) => types.includes(a.type)).reduce((s, a) => s + Math.max(0, a.balance), 0);
    return {
      cash: positive(['cash']),
      bank: positive(['bank', 'wallet']),
      receivables: u.toReceive,
      liabilities: u.toPay,
      charity: charityTx
        .filter((x) => x.category_id && charityIds.has(x.category_id))
        .reduce((s, x) => s + x.amount, 0),
    };
  });

  if (!prefill) return null;
  return <ZakatForm prefill={prefill} />;
}

function ZakatForm({ prefill }: { prefill: Prefill }) {
  const { t, colors, money, settings, setSetting } = useApp();
  const [standard, setStandard] = useState<'silver' | 'gold'>('silver');
  const s = (m: number) => (m ? String(toMajor(m)) : '');
  const [f, setF] = useState<Fields>({
    cash: s(prefill.cash),
    bank: s(prefill.bank),
    goldTola: '',
    silverTola: '',
    goldPrice: settings.zakatGoldPrice,
    silverPrice: settings.zakatSilverPrice,
    stock: '',
    receivables: s(prefill.receivables),
    liabilities: s(prefill.liabilities),
  });

  const set = (k: keyof Fields) => (v: string) => setF({ ...f, [k]: v });
  const result = calculateZakat({
    cash: minor(f.cash),
    bank: minor(f.bank),
    goldTola: num(f.goldTola),
    silverTola: num(f.silverTola),
    goldPricePerTola: minor(f.goldPrice),
    silverPricePerTola: minor(f.silverPrice),
    businessStock: minor(f.stock),
    receivables: minor(f.receivables),
    liabilities: minor(f.liabilities),
    nisabStandard: standard,
  });
  const m = (v: number) => money(v, { ignoreHidden: true });
  const priceMissing = standard === 'silver' ? !minor(f.silverPrice) : !minor(f.goldPrice);

  const amountInput = (k: keyof Fields, label: string) => (
    <Field label={label}>
      <Input value={f[k]} onChangeText={set(k)} keyboardType="decimal-pad" placeholder="0" />
    </Field>
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: t('zakat.title') }} />
      <Text muted>{t('zakat.intro')}</Text>

      <Card style={{ borderColor: colors.primary }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="label" muted>
            {t('zakat.net')}
          </Text>
          <Text variant="label">{m(result.net)}</Text>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="label" muted>
            {t('zakat.nisabValue')}
          </Text>
          <Text variant="label">{priceMissing ? '—' : m(result.nisab)}</Text>
        </Row>
        <Text variant="label" muted>
          {t('zakat.due')}
        </Text>
        {priceMissing ? (
          <Text muted>{t('zakat.pricesHint')}</Text>
        ) : result.eligible ? (
          <Text variant="bigAmount" color={colors.primary}>
            {m(result.zakat)}
          </Text>
        ) : (
          <Text>{t('zakat.notDue')}</Text>
        )}
      </Card>

      <Field label={t('zakat.nisab')}>
        <Chips
          options={[
            { value: 'silver', label: t('zakat.nisabSilver') },
            { value: 'gold', label: t('zakat.nisabGold') },
          ]}
          value={standard}
          onChange={(v) => setStandard(v as 'silver' | 'gold')}
        />
      </Field>

      <Text variant="caption" muted>
        {t('zakat.pricesHint')}
      </Text>
      <Row>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Field label={t('zakat.goldPrice')}>
            <Input
              value={f.goldPrice}
              onChangeText={(v) => {
                set('goldPrice')(v);
                setSetting('zakatGoldPrice', v);
              }}
              keyboardType="decimal-pad"
              placeholder="0"
            />
          </Field>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Field label={t('zakat.silverPrice')}>
            <Input
              value={f.silverPrice}
              onChangeText={(v) => {
                set('silverPrice')(v);
                setSetting('zakatSilverPrice', v);
              }}
              keyboardType="decimal-pad"
              placeholder="0"
            />
          </Field>
        </View>
      </Row>

      <Text variant="caption" muted>
        {t('zakat.fromApp')}
      </Text>
      {amountInput('cash', t('zakat.cash'))}
      {amountInput('bank', t('zakat.bank'))}
      <Row>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Field label={t('zakat.gold')}>
            <Input value={f.goldTola} onChangeText={set('goldTola')} keyboardType="decimal-pad" placeholder="0" />
          </Field>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Field label={t('zakat.silver')}>
            <Input value={f.silverTola} onChangeText={set('silverTola')} keyboardType="decimal-pad" placeholder="0" />
          </Field>
        </View>
      </Row>
      {amountInput('stock', t('zakat.stock'))}
      {amountInput('receivables', t('zakat.receivables'))}
      {amountInput('liabilities', t('zakat.liabilities'))}

      <Card>
        <Text variant="label" muted>
          {t('zakat.charityThisYear')}
        </Text>
        <Text variant="heading" color={colors.income}>
          {m(prefill.charity)}
        </Text>
      </Card>

      <Text variant="caption" muted>
        {t('zakat.disclaimer')}
      </Text>
    </Screen>
  );
}
