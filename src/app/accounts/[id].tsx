import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { listAccounts, newId, removeAccount, saveAccount } from '@/db/repo';
import { toMajor, toMinor } from '@/lib/money';
import type { AccountType } from '@/lib/types';
import { useApp } from '@/state/app';
import { ACCOUNT_ICONS } from '@/ui/icons';
import { Button, Chips, Field, Input, Screen } from '@/ui/kit';

function parseSigned(v: string): number | null {
  const cleaned = v.replace(/[,\s]/g, '');
  if (cleaned === '') return 0;
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return toMinor(parseFloat(cleaned));
}

export default function AccountForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { db, t, changed } = useApp();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('cash');
  const [balance, setBalance] = useState('');
  const [original, setOriginal] = useState<{ opening: number; current: number } | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (isNew) return;
    listAccounts(db, true).then((list) => {
      const a = list.find((x) => x.id === id);
      if (!a) return;
      setName(a.name);
      setType(a.type);
      setBalance(String(toMajor(a.balance)));
      setOriginal({ opening: a.opening_balance, current: a.balance });
    });
  }, [db, id, isNew]);

  const save = async () => {
    if (!name.trim()) return setError(t('common.required'));
    const entered = parseSigned(balance);
    if (entered === null) return setError(t('common.invalidAmount'));
    // For existing accounts the user edits the current balance; shift the opening balance by the difference.
    const opening = original ? original.opening + (entered - original.current) : entered;
    await saveAccount(db, { id: isNew ? newId() : id, name: name.trim(), type, opening_balance: opening });
    changed();
    router.back();
  };

  const remove = () =>
    Alert.alert(t('common.confirmDelete'), t('common.cannotUndo'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          const result = await removeAccount(db, id);
          changed();
          router.back();
          if (result === 'archived') Alert.alert(t('accounts.title'), t('accounts.archived'));
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? t('accounts.add') : t('accounts.edit') }} />
      <Field label={t('common.name')} error={error}>
        <Input value={name} onChangeText={setName} autoFocus={isNew} maxLength={40} />
      </Field>
      <Field label={t('accounts.type')}>
        <Chips<AccountType>
          options={(['cash', 'bank', 'wallet', 'card'] as const).map((v) => ({
            value: v,
            label: t(`accounts.${v}`),
            icon: ACCOUNT_ICONS[v] as never,
          }))}
          value={type}
          onChange={setType}
        />
      </Field>
      <Field
        label={isNew ? t('accounts.openingBalance') : t('accounts.currentBalance')}
        hint={isNew ? undefined : t('accounts.adjustHint')}>
        <Input value={balance} onChangeText={setBalance} keyboardType="numbers-and-punctuation" placeholder="0" />
      </Field>
      <Button title={t('common.save')} onPress={save} />
      {!isNew && <Button kind="ghost" icon="trash-outline" title={t('common.delete')} onPress={remove} />}
    </Screen>
  );
}
