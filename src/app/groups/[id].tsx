import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Linking, Share, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { deleteGroup, deleteSettlement, getGroup } from '@/db/groups-repo';
import { formatMoney } from '@/lib/money';
import { whatsAppUrl } from '@/lib/udhaar';
import { useApp, useLoad } from '@/state/app';
import {
  Button,
  Card,
  CategoryIcon,
  Divider,
  Empty,
  IconButton,
  ListRow,
  Row,
  Screen,
  SectionTitle,
  Text,
} from '@/ui/kit';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, t, colors, money, date, settings, changed } = useApp();
  const data = useLoad((d) => getGroup(d, id), [id]);

  if (data === undefined) return <Screen>{null}</Screen>;
  if (data === null)
    return (
      <Screen>
        <Empty text={t('common.empty')} />
      </Screen>
    );

  const g = data;
  const name = (memberId: string) => g.members.find((m) => m.id === memberId)?.name ?? '?';
  const meId = g.me?.id ?? '';
  const myNet = g.net[meId] ?? 0;
  const plain = (m: number) => formatMoney(m, settings.currency);

  const summaryText = () => {
    const lines = [
      t('groups.summaryHeader', { group: g.group.name }),
      t('groups.summaryTotal', { amount: plain(g.total) }),
    ];
    if (g.transfers.length === 0) lines.push(t('groups.summaryDone'));
    for (const tr of g.transfers)
      lines.push(t('groups.summaryLine', { from: name(tr.from), to: name(tr.to), amount: plain(tr.amount) }));
    return lines.join('\n');
  };

  const share = () => {
    const text = summaryText();
    Linking.openURL(whatsAppUrl('', text)).catch(() => Share.share({ message: text }));
  };

  const remind = (memberId: string, amount: number) => {
    const m = g.members.find((x) => x.id === memberId);
    if (!m) return;
    const msg = t('groups.remindMessage', { name: m.name, group: g.group.name, amount: plain(amount) });
    Linking.openURL(whatsAppUrl(m.phone, msg));
  };

  const remove = () =>
    Alert.alert(t('common.confirmDelete'), t('groups.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteGroup(db, g.group.id);
          changed();
          router.back();
        },
      },
    ]);

  type Activity =
    | { kind: 'bill'; date: string; created: number; e: (typeof g.expenses)[number] }
    | { kind: 'pay'; date: string; created: number; s: (typeof g.settlements)[number] };
  const activity: Activity[] = [
    ...g.expenses.map((e) => ({ kind: 'bill' as const, date: e.date, created: e.created_at, e })),
    ...g.settlements.map((s) => ({ kind: 'pay' as const, date: s.date, created: s.created_at, s })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: g.group.name,
          headerRight: () => (
            <Row>
              <IconButton
                icon="create-outline"
                label={t('common.edit')}
                onPress={() => router.push(`/groups/edit/${g.group.id}`)}
              />
              <IconButton icon="trash-outline" label={t('common.delete')} onPress={remove} />
            </Row>
          ),
        }}
      />

      <Card>
        <Text variant="label" muted>
          {g.members.map((m) => m.name).join(', ')}
        </Text>
        <Text variant="bigAmount" color={myNet > 0 ? colors.income : myNet < 0 ? colors.expense : colors.textSecondary}>
          {myNet > 0
            ? t('groups.youGet', { amount: money(myNet, { ignoreHidden: true }) })
            : myNet < 0
              ? t('groups.youOwe', { amount: money(-myNet, { ignoreHidden: true }) })
              : t('groups.settled')}
        </Text>
        <Text variant="caption" muted>
          {t('groups.totalSpent', { amount: money(g.total, { ignoreHidden: true }) })}
        </Text>
      </Card>

      <Button
        title={t('groups.addExpense')}
        icon="add-circle-outline"
        onPress={() => router.push(`/groups/bill/new?group=${g.group.id}`)}
      />
      <Row>
        <Button
          kind="secondary"
          icon="swap-horizontal"
          title={t('groups.settleUp')}
          style={{ flex: 1 }}
          onPress={() => router.push(`/groups/settle?group=${g.group.id}`)}
        />
        <Button kind="secondary" icon="logo-whatsapp" title={t('groups.share')} style={{ flex: 1 }} onPress={share} />
      </Row>

      <SectionTitle>{t('groups.whoOwes')}</SectionTitle>
      <Card style={{ paddingVertical: Spacing.one }}>
        {g.transfers.length === 0 ? (
          <Empty
            icon="checkmark-done-circle-outline"
            text={g.expenses.length ? t('groups.summaryDone') : t('groups.noBills')}
          />
        ) : (
          g.transfers.map((tr, i) => (
            <View key={`${tr.from}-${tr.to}`}>
              {i > 0 && <Divider />}
              <ListRow
                title={t('groups.owes', { from: name(tr.from), to: name(tr.to) })}
                subtitle={money(tr.amount, { ignoreHidden: true })}
                right={
                  <Row gap={Spacing.one}>
                    {tr.to === meId && (
                      <IconButton
                        icon="logo-whatsapp"
                        label={t('groups.remind')}
                        color={colors.income}
                        onPress={() => remind(tr.from, tr.amount)}
                      />
                    )}
                    <Button
                      kind="ghost"
                      title={t('groups.markPaid')}
                      onPress={() =>
                        router.push(
                          `/groups/settle?group=${g.group.id}&from=${tr.from}&to=${tr.to}&amount=${tr.amount}`,
                        )
                      }
                    />
                  </Row>
                }
              />
            </View>
          ))
        )}
      </Card>

      <SectionTitle>{t('groups.balances')}</SectionTitle>
      <Card style={{ paddingVertical: Spacing.one }}>
        {g.members.map((m, i) => {
          const n = g.net[m.id] ?? 0;
          return (
            <View key={m.id}>
              {i > 0 && <Divider />}
              <ListRow
                title={m.name}
                right={
                  <Text variant="amount" color={n > 0 ? colors.income : n < 0 ? colors.expense : colors.textSecondary}>
                    {n === 0 ? '—' : money(n, { sign: true, ignoreHidden: true })}
                  </Text>
                }
              />
            </View>
          );
        })}
      </Card>

      <SectionTitle
        action={
          <Button
            kind="ghost"
            icon="add"
            title={t('common.add')}
            onPress={() => router.push(`/groups/bill/new?group=${g.group.id}&monthly=1`)}
          />
        }>
        {t('groups.recurring')}
      </SectionTitle>
      <Card style={{ paddingVertical: Spacing.one }}>
        {g.recurring.length === 0 ? (
          <Text variant="caption" muted style={{ paddingVertical: Spacing.two }}>
            {t('groups.recurringHint')}
          </Text>
        ) : (
          g.recurring.map((r, i) => (
            <View key={r.id}>
              {i > 0 && <Divider />}
              <ListRow
                left={<CategoryIcon icon="repeat" color={colors.primary} size={34} />}
                title={r.title}
                subtitle={`${money(r.amount, { ignoreHidden: true })} · ${r.active ? t('groups.nextOn', { date: date(r.next_date) }) : t('tx.paused')}`}
                chevron
                onPress={() => router.push(`/groups/bill/${r.id}?group=${g.group.id}&monthly=1`)}
              />
            </View>
          ))
        )}
      </Card>

      <SectionTitle>{t('groups.activity')}</SectionTitle>
      <Card style={{ paddingVertical: Spacing.one }}>
        {activity.length === 0 ? (
          <Empty icon="receipt-outline" text={t('groups.noBills')} />
        ) : (
          activity.map((a, i) => (
            <View key={a.kind === 'bill' ? a.e.id : a.s.id}>
              {i > 0 && <Divider />}
              {a.kind === 'bill' ? (
                <ListRow
                  left={<CategoryIcon icon="receipt" color={colors.expense} size={34} />}
                  title={a.e.title}
                  subtitle={`${date(a.e.date)} · ${t('groups.paidByLine', { name: name(a.e.paid_by), amount: money(a.e.amount, { ignoreHidden: true }) })}`}
                  right={
                    <Text variant="caption" muted>
                      {a.e.shares[meId]
                        ? t('groups.yourShare', { amount: money(a.e.shares[meId], { ignoreHidden: true }) })
                        : t('groups.notInvolved')}
                    </Text>
                  }
                  onPress={() => router.push(`/groups/bill/${a.e.id}?group=${g.group.id}`)}
                />
              ) : (
                <ListRow
                  left={<CategoryIcon icon="checkmark-circle" color={colors.income} size={34} />}
                  title={t('groups.paidLine', { from: name(a.s.from_member), to: name(a.s.to_member) })}
                  subtitle={`${date(a.s.date)} · ${money(a.s.amount, { ignoreHidden: true })}`}
                  right={
                    <IconButton
                      icon="close"
                      label={t('common.delete')}
                      color={colors.textSecondary}
                      onPress={() =>
                        Alert.alert(t('common.confirmDelete'), undefined, [
                          { text: t('common.cancel'), style: 'cancel' },
                          {
                            text: t('common.delete'),
                            style: 'destructive',
                            onPress: async () => {
                              await deleteSettlement(db, a.s.id);
                              changed();
                            },
                          },
                        ])
                      }
                    />
                  }
                />
              )}
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}
