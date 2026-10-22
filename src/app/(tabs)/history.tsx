import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { listAccounts, listCategories, listTags, listTransactions, type TxFilter } from '@/db/repo';
import { previousPeriod } from '@/lib/dates';
import { parseAmount } from '@/lib/money';
import { summarize } from '@/lib/reports';
import type { Transaction, TxType } from '@/lib/types';
import { useApp, useLoad } from '@/state/app';
import { categoryMap, categoryName } from '@/state/labels';
import { Card, Chips, Empty, Fab, Input, Row, Text } from '@/ui/kit';
import { TxRow } from '@/ui/tx-row';

type Range = 'this' | 'last' | 'all';

type Item = { kind: 'header'; date: string; net: number } | { kind: 'tx'; tx: Transaction };

export default function History() {
  const { t, colors, period, settings, money, date, isRTL } = useApp();
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<Range>('this');
  const [type, setType] = useState<TxType | 'all'>('all');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [accountId, setAccountId] = useState<string>('all');
  const [tag, setTag] = useState<string>('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const filter: TxFilter = useMemo(() => {
    const p = range === 'this' ? period : range === 'last' ? previousPeriod(period, settings.monthStartDay) : null;
    return {
      from: p?.start,
      to: p?.end,
      type: type === 'all' ? undefined : type,
      categoryId: categoryId === 'all' ? undefined : categoryId,
      accountId: accountId === 'all' ? undefined : accountId,
      search,
      tag: tag === 'all' ? undefined : tag,
      minAmount: parseAmount(minAmount) ?? undefined,
      maxAmount: parseAmount(maxAmount) ?? undefined,
    };
  }, [range, period, settings.monthStartDay, type, categoryId, accountId, search, tag, minAmount, maxAmount]);

  const data = useLoad(
    async (db) => {
      const [txs, categories, accounts, tags] = await Promise.all([
        listTransactions(db, filter),
        listCategories(db, true),
        listAccounts(db, true),
        listTags(db),
      ]);
      return {
        txs,
        tags,
        categories,
        catMap: categoryMap(categories),
        accounts,
        accMap: new Map(accounts.map((a) => [a.id, a])),
      };
    },
    [filter],
  );

  const items = useMemo<Item[]>(() => {
    if (!data) return [];
    const out: Item[] = [];
    let current = '';
    for (const tx of data.txs) {
      if (tx.date !== current) {
        current = tx.date;
        const day = summarize(data.txs.filter((x) => x.date === current));
        out.push({ kind: 'header', date: current, net: day.income - day.expense });
      }
      out.push({ kind: 'tx', tx });
    }
    return out;
  }, [data]);

  const totals = data ? summarize(data.txs) : null;

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={{ flex: 1, backgroundColor: colors.background, direction: isRTL ? 'rtl' : 'ltr' }}>
      <View style={{ padding: Spacing.three, gap: Spacing.two }}>
        <Row>
          <View style={{ flex: 1 }}>
            <Input value={search} onChangeText={setSearch} placeholder={t('common.search')} returnKeyType="search" />
          </View>
          <Pressable
            accessibilityLabel={t('tx.filters')}
            onPress={() => setShowFilters((s) => !s)}
            style={{ padding: Spacing.two }}>
            <Ionicons name={showFilters ? 'options' : 'options-outline'} size={26} color={colors.primary} />
          </Pressable>
        </Row>
        <Chips<Range>
          wrap={false}
          options={[
            { value: 'this', label: t('tx.thisPeriod') },
            { value: 'last', label: t('tx.lastPeriod') },
            { value: 'all', label: t('tx.allTime') },
          ]}
          value={range}
          onChange={setRange}
        />
        {showFilters && data && (
          <Card>
            <Chips<TxType | 'all'>
              wrap={false}
              options={[
                { value: 'all', label: t('tx.allTypes') },
                { value: 'expense', label: t('tx.expense') },
                { value: 'income', label: t('tx.income') },
                { value: 'transfer', label: t('tx.transfer') },
              ]}
              value={type}
              onChange={setType}
            />
            <Chips
              wrap={false}
              options={[
                { value: 'all', label: t('tx.allCategories') },
                ...data.categories.filter((c) => !c.archived).map((c) => ({ value: c.id, label: categoryName(c, t) })),
              ]}
              value={categoryId}
              onChange={setCategoryId}
            />
            <Chips
              wrap={false}
              options={[
                { value: 'all', label: t('tx.allAccounts') },
                ...data.accounts.map((a) => ({ value: a.id, label: a.name })),
              ]}
              value={accountId}
              onChange={setAccountId}
            />
            {data.tags.length > 0 && (
              <Chips
                wrap={false}
                options={[
                  { value: 'all', label: t('tx.allTags') },
                  ...data.tags.map((x) => ({ value: x, label: `#${x}` })),
                ]}
                value={tag}
                onChange={setTag}
              />
            )}
            <Row>
              <View style={{ flex: 1 }}>
                <Input
                  value={minAmount}
                  onChangeText={setMinAmount}
                  placeholder={t('tx.minAmount')}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  value={maxAmount}
                  onChangeText={setMaxAmount}
                  placeholder={t('tx.maxAmount')}
                  keyboardType="decimal-pad"
                />
              </View>
            </Row>
          </Card>
        )}
        {totals && (
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="caption" muted>
              {t('tx.results', { count: data?.txs.length ?? 0 })}
            </Text>
            <Text variant="caption">
              <Text variant="caption" color={colors.income}>
                +{money(totals.income, { ignoreHidden: true })}
              </Text>
              {'   '}
              <Text variant="caption" color={colors.expense}>
                -{money(totals.expense, { ignoreHidden: true })}
              </Text>
            </Text>
          </Row>
        )}
      </View>
      <FlatList
        data={items}
        keyExtractor={(it) => (it.kind === 'header' ? `h-${it.date}` : it.tx.id)}
        contentContainerStyle={{ paddingHorizontal: Spacing.three, paddingBottom: 120 }}
        ListEmptyComponent={<Empty icon="search" text={t('common.empty')} />}
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <Row style={{ justifyContent: 'space-between', marginTop: Spacing.three }}>
              <Text variant="label" muted>
                {date(item.date)}
              </Text>
              <Text variant="caption" muted>
                {money(item.net, { sign: true, ignoreHidden: true })}
              </Text>
            </Row>
          ) : data ? (
            <TxRow tx={item.tx} categories={data.catMap} accounts={data.accMap} />
          ) : null
        }
      />
      <Fab label={t('tx.add')} onPress={() => router.push('/tx/new')} />
    </SafeAreaView>
  );
}
