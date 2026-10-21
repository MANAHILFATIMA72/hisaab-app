import { Stack } from 'expo-router';
import { Alert, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { deleteRecurring, listAccounts, listCategories, listRecurring, saveRecurring } from '@/db/repo';
import { useApp, useLoad } from '@/state/app';
import { categoryMap, categoryName } from '@/state/labels';
import { Button, Card, CategoryIcon, Divider, Empty, IconButton, ListRow, Row, Screen } from '@/ui/kit';

export default function RecurringScreen() {
  const { db, t, colors, money, date, changed } = useApp();
  const data = useLoad(async (d) => {
    const [rules, categories, accounts] = await Promise.all([
      listRecurring(d),
      listCategories(d, true),
      listAccounts(d, true),
    ]);
    return { rules, cats: categoryMap(categories), accounts: new Map(accounts.map((a) => [a.id, a.name])) };
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: t('tx.recurringList') }} />
      <Card style={{ paddingVertical: Spacing.one }}>
        {!data?.rules.length ? (
          <Empty icon="repeat" text={t('common.empty')} />
        ) : (
          data.rules.map((r, i) => {
            const cat = r.category_id ? data.cats.get(r.category_id) : undefined;
            const title =
              r.type === 'transfer'
                ? t('tx.transferTo', { name: data.accounts.get(r.to_account_id ?? '') ?? '' })
                : categoryName(cat, t);
            return (
              <View key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                {i > 0 && <Divider />}
                <ListRow
                  left={<CategoryIcon icon={cat?.icon ?? 'repeat'} color={cat?.color ?? colors.textSecondary} />}
                  title={`${title} · ${money(r.amount, { ignoreHidden: true })}`}
                  subtitle={[
                    t(`tx.${r.frequency}`),
                    r.active ? t('tx.nextOn', { date: date(r.next_date) }) : t('tx.paused'),
                    r.note,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  right={
                    <Row gap={0}>
                      <Button
                        kind="ghost"
                        title={r.active ? t('tx.stop') : t('tx.resume')}
                        onPress={async () => {
                          await saveRecurring(db, { ...r, active: r.active ? 0 : 1 });
                          changed();
                        }}
                      />
                      <IconButton
                        icon="trash-outline"
                        label={t('common.delete')}
                        onPress={() =>
                          Alert.alert(t('common.confirmDelete'), undefined, [
                            { text: t('common.cancel'), style: 'cancel' },
                            {
                              text: t('common.delete'),
                              style: 'destructive',
                              onPress: async () => {
                                await deleteRecurring(db, r.id);
                                changed();
                              },
                            },
                          ])
                        }
                      />
                    </Row>
                  }
                />
              </View>
            );
          })
        )}
      </Card>
    </Screen>
  );
}
