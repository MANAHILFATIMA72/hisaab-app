import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import {
  deleteTransaction,
  getTransaction,
  listAccounts,
  listCategories,
  newId,
  saveRecurring,
  saveTransaction,
} from '@/db/repo';
import { today } from '@/lib/dates';
import { parseAmount, toMajor } from '@/lib/money';
import { nextOccurrence } from '@/lib/recurring';
import { parseSms } from '@/lib/sms-parse';
import type { Frequency, TxType } from '@/lib/types';
import { checkBudgetAlerts } from '@/services/budget-alerts';
import { useApp, useLoad } from '@/state/app';
import { categoryName } from '@/state/labels';
import { Button, Chips, DateField, Field, Input, Row, Screen, Segmented, Text } from '@/ui/kit';

type Repeat = 'none' | Frequency;

export default function TransactionForm() {
  const { id, type: typeParam } = useLocalSearchParams<{ id: string; type?: TxType }>();
  const isNew = id === 'new';
  const { db, t, colors, changed, period, settings } = useApp();

  const lists = useLoad(async (d) => ({ accounts: await listAccounts(d), categories: await listCategories(d) }));
  const [type, setType] = useState<TxType>(typeParam ?? 'expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [chosenAccountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [recurringId, setRecurringId] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<number | undefined>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (isNew) return;
    getTransaction(db, id).then((tx) => {
      if (!tx) return;
      setType(tx.type);
      setAmount(String(toMajor(tx.amount)));
      setCategoryId(tx.category_id);
      setAccountId(tx.account_id);
      setToAccountId(tx.to_account_id);
      setDate(tx.date);
      setNote(tx.note);
      setRecurringId(tx.recurring_id);
      setCreatedAt(tx.created_at);
    });
  }, [db, id, isNew]);

  // Until the user picks one, default to the first account.
  const accountId = chosenAccountId ?? lists?.accounts[0]?.id ?? null;

  const categories = useMemo(() => {
    if (!lists || type === 'transfer') return [];
    const kind = type === 'income' ? 'income' : 'expense';
    const main = lists.categories.filter((c) => c.kind === kind && !c.parent_id);
    // Show each subcategory right after its parent.
    return main.flatMap((m) => [m, ...lists.categories.filter((c) => c.parent_id === m.id)]);
  }, [lists, type]);

  const pasteSms = async () => {
    const text = await Clipboard.getStringAsync();
    const parsed = text ? parseSms(text) : null;
    if (!parsed) {
      Alert.alert(t('tx.pasteSms'), t('tx.smsNotFound'));
      return;
    }
    setType(parsed.type);
    setAmount(String(toMajor(parsed.amount)));
    if (parsed.merchant && !note) setNote(parsed.merchant);
  };

  const save = async () => {
    const minor = parseAmount(amount);
    if (!minor) return setError(t('common.invalidAmount'));
    if (!accountId) return setError(t('tx.noAccounts'));
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) return setError(t('tx.sameAccount'));

    const txId = isNew ? newId() : id;
    let recId = recurringId;
    if (isNew && repeat !== 'none') {
      recId = newId();
      await saveRecurring(db, {
        id: recId,
        type,
        amount: minor,
        account_id: accountId,
        to_account_id: type === 'transfer' ? toAccountId : null,
        category_id: type === 'transfer' ? null : categoryId,
        note,
        frequency: repeat,
        next_date: nextOccurrence(date, repeat),
        active: 1,
      });
    }
    await saveTransaction(db, {
      id: txId,
      type,
      amount: minor,
      account_id: accountId,
      to_account_id: toAccountId,
      category_id: categoryId,
      date,
      note: note.trim(),
      recurring_id: recId,
      created_at: createdAt,
    });

    let alerts: string[] = [];
    if (settings.budgetAlerts && type === 'expense' && isNew && date >= period.start && date <= period.end) {
      alerts = await checkBudgetAlerts(db, period, t, { categoryId, amount: minor });
    }
    changed();
    router.back();
    if (alerts.length) Alert.alert(t('budget.alert80Title'), alerts.join('\n'));
  };

  const remove = () => {
    Alert.alert(t('common.confirmDelete'), t('common.cannotUndo'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(db, id);
          changed();
          router.back();
        },
      },
    ]);
  };

  const accountOptions = (lists?.accounts ?? []).map((a) => ({ value: a.id, label: a.name }));
  const typeColor = type === 'income' ? colors.income : type === 'expense' ? colors.expense : colors.text;

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? t('tx.add') : t('tx.edit') }} />
      <Segmented<TxType>
        value={type}
        onChange={(v) => {
          setType(v);
          setCategoryId(null);
        }}
        options={[
          { value: 'expense', label: t('tx.expense'), color: colors.expense },
          { value: 'income', label: t('tx.income'), color: colors.income },
          { value: 'transfer', label: t('tx.transfer') },
        ]}
      />
      <View style={{ height: Spacing.two }} />
      <Field label={t('common.amount')} error={error}>
        <Input
          big
          autoFocus={isNew}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={(v) => {
            setAmount(v);
            setError(undefined);
          }}
          placeholder="0"
          style={{ color: typeColor }}
        />
      </Field>
      {isNew && type !== 'transfer' && (
        <Button kind="ghost" icon="clipboard-outline" title={t('tx.pasteSms')} onPress={pasteSms} />
      )}

      {type !== 'transfer' && (
        <Field label={t('tx.category')}>
          <Chips
            options={categories.map((c) => ({
              value: c.id,
              label: (c.parent_id ? '↳ ' : '') + categoryName(c, t),
              icon: c.icon as never,
              color: c.color,
            }))}
            value={categoryId}
            onChange={setCategoryId}
          />
        </Field>
      )}

      <Field label={type === 'transfer' ? t('tx.fromAccount') : t('tx.account')}>
        <Chips options={accountOptions} value={accountId} onChange={setAccountId} />
      </Field>
      {type === 'transfer' && (
        <Field label={t('tx.toAccount')}>
          <Chips
            options={accountOptions.filter((a) => a.value !== accountId)}
            value={toAccountId}
            onChange={setToAccountId}
          />
        </Field>
      )}

      <Field label={t('common.date')}>
        <DateField value={date} onChange={(v) => v && setDate(v)} />
      </Field>

      <Field label={`${t('common.note')} (${t('common.optional')})`}>
        <Input value={note} onChangeText={setNote} maxLength={200} />
      </Field>

      {isNew && (
        <Field label={t('tx.repeat')}>
          <Chips<Repeat>
            options={[
              { value: 'none', label: t('tx.repeatNone') },
              { value: 'daily', label: t('tx.daily') },
              { value: 'weekly', label: t('tx.weekly') },
              { value: 'monthly', label: t('tx.monthly') },
            ]}
            value={repeat}
            onChange={setRepeat}
          />
        </Field>
      )}

      <Button title={t('common.save')} onPress={save} />
      {!isNew && (
        <Row style={{ justifyContent: 'center', marginTop: Spacing.two }}>
          <Button kind="ghost" icon="trash-outline" title={t('common.delete')} onPress={remove} />
        </Row>
      )}
      {lists && lists.accounts.length === 0 && <Text color={colors.danger}>{t('tx.noAccounts')}</Text>}
    </Screen>
  );
}
