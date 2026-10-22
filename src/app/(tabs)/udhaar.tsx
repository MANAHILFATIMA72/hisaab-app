import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { listGroups, type GroupSummary } from '@/db/groups-repo';
import { listUdhaar } from '@/db/repo';
import { today } from '@/lib/dates';
import { myTotals } from '@/lib/groups';
import { isOverdue, totals, withBalances } from '@/lib/udhaar';
import { useApp, useLoad } from '@/state/app';
import { Button, Card, CategoryIcon, Divider, Empty, Fab, ListRow, Row, Screen, Segmented, Text } from '@/ui/kit';

export default function LenaDena() {
  const { view: initialView } = useLocalSearchParams<{ view?: 'people' | 'groups' }>();
  const { t, colors, money, date } = useApp();
  const [view, setView] = useState<'people' | 'groups'>(initialView ?? 'people');
  const [tab, setTab] = useState<'open' | 'settled'>('open');
  const data = useLoad(async (db) => {
    const [{ items, payments }, groups] = await Promise.all([listUdhaar(db), listGroups(db)]);
    const all = withBalances(items, payments);
    const u = totals(all);
    const g = myTotals(groups.map((x) => x.myNet));
    return { all, groups, totals: { toReceive: u.toReceive + g.toReceive, toPay: u.toPay + g.toPay } };
  });

  const now = today();
  const shown = (data?.all ?? []).filter((u) => (tab === 'open' ? !u.settled : u.settled));
  // Overdue first, then nearest due date, then newest.
  shown.sort((a, b) => {
    const oa = isOverdue(a, now) ? 0 : 1;
    const ob = isOverdue(b, now) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
  });

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Row>
          <Card style={{ flex: 1 }}>
            <Text variant="caption" muted>
              {t('udhaar.toReceive')}
            </Text>
            <Text variant="heading" color={colors.income}>
              {money(data?.totals.toReceive ?? 0, { ignoreHidden: true })}
            </Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text variant="caption" muted>
              {t('udhaar.toPay')}
            </Text>
            <Text variant="heading" color={colors.expense}>
              {money(data?.totals.toPay ?? 0, { ignoreHidden: true })}
            </Text>
          </Card>
        </Row>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'people', label: t('lenaDena.people') },
            { value: 'groups', label: t('lenaDena.groups') },
          ]}
        />
        {view === 'groups' ? (
          <GroupList groups={data?.groups ?? []} />
        ) : (
          <>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'open', label: t('udhaar.open') },
                { value: 'settled', label: t('udhaar.history') },
              ]}
            />
            <Card style={{ paddingVertical: Spacing.one }}>
              {shown.length === 0 ? (
                <Empty icon="people-outline" text={tab === 'open' ? t('udhaar.emptyHint') : t('common.empty')} />
              ) : (
                shown.map((u, i) => {
                  const overdue = isOverdue(u, now);
                  const given = u.direction === 'given';
                  const sub = [
                    given ? t('udhaar.given') : t('udhaar.taken'),
                    u.due_date ? (overdue ? t('udhaar.overdue') : t('udhaar.dueOn', { date: date(u.due_date) })) : null,
                    u.reason || null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <View key={u.id}>
                      {i > 0 && <Divider />}
                      <ListRow
                        onPress={() => router.push(`/udhaar/${u.id}`)}
                        left={
                          <CategoryIcon
                            icon={given ? 'arrow-up' : 'arrow-down'}
                            color={given ? colors.income : colors.expense}
                          />
                        }
                        title={u.person}
                        subtitle={sub}
                        right={
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text variant="amount" color={given ? colors.income : colors.expense}>
                              {money(u.settled ? u.amount : u.remaining, { ignoreHidden: true })}
                            </Text>
                            {overdue && (
                              <Text variant="caption" color={colors.danger}>
                                {t('udhaar.overdue')}
                              </Text>
                            )}
                          </View>
                        }
                      />
                    </View>
                  );
                })
              )}
            </Card>
          </>
        )}
      </Screen>
      {view === 'groups' ? (
        <Fab label={t('groups.add')} onPress={() => router.push('/groups/edit/new')} />
      ) : (
        <Fab label={t('udhaar.add')} onPress={() => router.push('/udhaar/edit/new')} />
      )}
    </View>
  );
}

function GroupList({ groups }: { groups: GroupSummary[] }) {
  const { t, colors, money } = useApp();
  if (!groups.length) {
    return (
      <Card>
        <Empty icon="people-circle-outline" text={t('groups.noGroups')} />
        <Button title={t('groups.add')} icon="add" onPress={() => router.push('/groups/edit/new')} />
      </Card>
    );
  }
  return (
    <Card style={{ paddingVertical: Spacing.one }}>
      {groups.map((g, i) => (
        <View key={g.group.id}>
          {i > 0 && <Divider />}
          <ListRow
            onPress={() => router.push(`/groups/${g.group.id}`)}
            left={<CategoryIcon icon={g.group.icon} color={colors.primary} />}
            title={g.group.name}
            subtitle={t('groups.listSubtitle', { members: g.members.length, bills: g.count })}
            right={
              <Text
                variant="label"
                color={g.myNet > 0 ? colors.income : g.myNet < 0 ? colors.expense : colors.textSecondary}>
                {g.myNet > 0
                  ? t('groups.youGet', { amount: money(g.myNet, { ignoreHidden: true }) })
                  : g.myNet < 0
                    ? t('groups.youOwe', { amount: money(-g.myNet, { ignoreHidden: true }) })
                    : t('groups.settled')}
              </Text>
            }
          />
        </View>
      ))}
    </Card>
  );
}
