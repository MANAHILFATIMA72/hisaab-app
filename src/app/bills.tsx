import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { deleteBill, listBills, newId, saveBill } from '@/db/repo';
import { parseAmount, toMajor } from '@/lib/money';
import type { Bill } from '@/lib/types';
import { ensurePermission, syncReminders } from '@/services/notifications';
import { useApp, useLoad } from '@/state/app';
import { Button, Card, Chips, Divider, Empty, Field, IconButton, Input, ListRow, Screen, Text } from '@/ui/kit';

const DAYS = Array.from({ length: 28 }, (_, i) => String(i + 1));

export default function Bills() {
  const { db, t, money, settings, changed } = useApp();
  const bills = useLoad((d) => listBills(d));
  const [editing, setEditing] = useState<Bill | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState('10');
  const [error, setError] = useState<string>();

  const startEdit = (b: Bill | null) => {
    setEditing(b ?? { id: newId(), name: '', amount: 0, due_day: 10, active: 1 });
    setName(b?.name ?? '');
    setAmount(b?.amount ? String(toMajor(b.amount)) : '');
    setDay(String(b?.due_day ?? 10));
    setError(undefined);
  };

  const refreshReminders = async () => {
    if (settings.billReminders && (await ensurePermission())) await syncReminders(db, settings);
  };

  const save = async () => {
    if (!editing) return;
    if (!name.trim()) return setError(t('common.required'));
    await saveBill(db, {
      ...editing,
      name: name.trim(),
      amount: amount ? (parseAmount(amount) ?? 0) : 0,
      due_day: Number(day),
    });
    setEditing(null);
    changed();
    await refreshReminders();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('bills.title') }} />
      <Text muted>{t('bills.hint')}</Text>
      {editing ? (
        <Card>
          <Field label={t('common.name')} error={error}>
            <Input value={name} onChangeText={setName} autoFocus placeholder="K-Electric, PTCL, SNGPL…" />
          </Field>
          <Field label={`${t('common.amount')} (${t('common.optional')})`}>
            <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
          </Field>
          <Field label={t('bills.dueDay')}>
            <Chips options={DAYS.map((d) => ({ value: d, label: d }))} value={day} onChange={setDay} />
          </Field>
          <Button title={t('common.save')} onPress={save} />
          <Button kind="ghost" title={t('common.cancel')} onPress={() => setEditing(null)} />
        </Card>
      ) : (
        <Button icon="add" title={t('bills.add')} onPress={() => startEdit(null)} />
      )}
      <Card style={{ paddingVertical: Spacing.one }}>
        {!bills?.length ? (
          <Empty icon="notifications-outline" text={t('common.empty')} />
        ) : (
          bills.map((b, i) => (
            <View key={b.id}>
              {i > 0 && <Divider />}
              <ListRow
                icon="calendar"
                title={b.name}
                subtitle={`${t('bills.dueDay')}: ${b.due_day}${b.amount ? ` · ${money(b.amount, { ignoreHidden: true })}` : ''}`}
                onPress={() => startEdit(b)}
                right={
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
                            await deleteBill(db, b.id);
                            changed();
                            await refreshReminders();
                          },
                        },
                      ])
                    }
                  />
                }
              />
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}
