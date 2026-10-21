import { router, Stack } from 'expo-router';
import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { listAccounts } from '@/db/repo';
import { useApp, useLoad } from '@/state/app';
import { ACCOUNT_ICONS } from '@/ui/icons';
import { Card, CategoryIcon, Divider, Fab, ListRow, Row, Screen, Text } from '@/ui/kit';

export default function Accounts() {
  const { t, colors, money } = useApp();
  const accounts = useLoad((db) => listAccounts(db));
  const total = (accounts ?? []).reduce((a, b) => a + b.balance, 0);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t('accounts.title') }} />
      <Screen>
        <Card>
          <Text variant="label" muted>
            {t('home.totalBalance')}
          </Text>
          <Text variant="bigAmount">{money(total)}</Text>
        </Card>
        <Card style={{ paddingVertical: Spacing.one }}>
          {(accounts ?? []).map((a, i) => (
            <View key={a.id}>
              {i > 0 && <Divider />}
              <ListRow
                onPress={() => router.push(`/accounts/${a.id}`)}
                left={<CategoryIcon icon={ACCOUNT_ICONS[a.type]} color={colors.primary} />}
                title={a.name}
                subtitle={t(`accounts.${a.type}`)}
                right={
                  <Row>
                    <Text variant="amount" color={a.balance < 0 ? colors.danger : colors.text}>
                      {money(a.balance)}
                    </Text>
                  </Row>
                }
              />
            </View>
          ))}
        </Card>
      </Screen>
      <Fab label={t('accounts.add')} onPress={() => router.push('/accounts/new')} />
    </View>
  );
}
