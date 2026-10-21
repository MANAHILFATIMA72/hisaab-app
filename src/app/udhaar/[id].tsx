import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { addUdhaarPayment, deleteUdhaar, deleteUdhaarPayment, listUdhaar, newId } from '@/db/repo';
import { today } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { isOverdue, whatsAppUrl, withBalances } from '@/lib/udhaar';
import { useApp, useLoad } from '@/state/app';
import { AmountPrompt } from '@/ui/amount-prompt';
import {
  Button,
  Card,
  Divider,
  Empty,
  IconButton,
  ListRow,
  ProgressBar,
  Row,
  Screen,
  SectionTitle,
  Text,
} from '@/ui/kit';

export default function UdhaarDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, t, colors, money, date, settings, changed } = useApp();
  const [paying, setPaying] = useState(false);

  const data = useLoad(
    async (d) => {
      const { items, payments } = await listUdhaar(d);
      const entry = withBalances(items, payments).find((u) => u.id === id);
      return { entry, payments: payments.filter((p) => p.udhaar_id === id) };
    },
    [id],
  );

  const u = data?.entry;
  if (!data) return <Screen>{null}</Screen>;
  if (!u)
    return (
      <Screen>
        <Empty text={t('common.empty')} />
      </Screen>
    );

  const given = u.direction === 'given';
  const color = given ? colors.income : colors.expense;

  const remind = () => {
    // The message always shows the real amount, even when balances are hidden in the app.
    const vars = { person: u.person, amount: formatMoney(u.remaining, settings.currency), date: date(u.date) };
    const msg = given ? t('udhaar.reminderMessageGiven', vars) : t('udhaar.reminderMessageTaken', vars);
    Linking.openURL(whatsAppUrl(u.phone, msg));
  };

  const remove = () =>
    Alert.alert(t('common.confirmDelete'), t('common.cannotUndo'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteUdhaar(db, u.id);
          changed();
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: u.person,
          headerRight: () => (
            <Row>
              <IconButton
                icon="create-outline"
                label={t('common.edit')}
                onPress={() => router.push(`/udhaar/edit/${u.id}`)}
              />
              <IconButton icon="trash-outline" label={t('common.delete')} onPress={remove} />
            </Row>
          ),
        }}
      />
      <Card>
        <Text variant="label" muted>
          {given ? t('udhaar.toReceive') : t('udhaar.toPay')}
        </Text>
        <Text variant="bigAmount" color={u.settled ? colors.textSecondary : color}>
          {u.settled ? t('udhaar.settled') : money(u.remaining, { ignoreHidden: true })}
        </Text>
        <ProgressBar value={u.amount ? u.paid / u.amount : 0} color={color} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="caption" muted>
            {t('udhaar.repaid')}: {money(u.paid, { ignoreHidden: true })}
          </Text>
          <Text variant="caption" muted>
            {t('common.total')}: {money(u.amount, { ignoreHidden: true })}
          </Text>
        </Row>
        <Text variant="caption" muted>
          {[
            `${given ? t('udhaar.given') : t('udhaar.taken')} · ${date(u.date)}`,
            u.due_date ? t('udhaar.dueOn', { date: date(u.due_date) }) : null,
            u.reason || null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {isOverdue(u, today()) && <Text color={colors.danger}>{t('udhaar.overdue')}</Text>}
      </Card>

      {!u.settled && (
        <View style={{ gap: Spacing.two }}>
          <Button title={t('udhaar.addPayment')} icon="checkmark-circle-outline" onPress={() => setPaying(true)} />
          <Button kind="secondary" title={t('udhaar.remind')} icon="logo-whatsapp" onPress={remind} />
        </View>
      )}

      <SectionTitle>{t('udhaar.payments')}</SectionTitle>
      <Card style={{ paddingVertical: Spacing.one }}>
        {data.payments.length === 0 ? (
          <Empty icon="time-outline" text={t('common.empty')} />
        ) : (
          data.payments.map((p, i) => (
            <View key={p.id}>
              {i > 0 && <Divider />}
              <ListRow
                title={money(p.amount, { ignoreHidden: true })}
                subtitle={[date(p.date), p.note].filter(Boolean).join(' · ')}
                right={
                  <IconButton
                    icon="close"
                    label={t('common.delete')}
                    color={colors.textSecondary}
                    onPress={async () => {
                      await deleteUdhaarPayment(db, p.id);
                      changed();
                    }}
                  />
                }
              />
            </View>
          ))
        )}
      </Card>

      <AmountPrompt
        visible={paying}
        title={t('udhaar.addPayment')}
        initial={u.remaining}
        onClose={() => setPaying(false)}
        onSave={async (minor) => {
          if (minor > u.remaining) {
            Alert.alert(t('udhaar.addPayment'), t('udhaar.paymentTooBig'));
            return;
          }
          await addUdhaarPayment(db, { id: newId(), udhaar_id: u.id, amount: minor, date: today(), note: '' });
          setPaying(false);
          changed();
        }}
      />
    </Screen>
  );
}
