import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import {
  deleteSplitParts,
  deleteTransaction,
  getSplitParts,
  getTransaction,
  listAccounts,
  listCategories,
  listTags,
  listTransactions,
  newId,
  normalizeTags,
  saveAccount,
  saveRecurring,
  saveTransaction,
  type AccountWithBalance,
} from '@/db/repo';
import { pickCategory } from '@/lib/categorize';
import { today } from '@/lib/dates';
import { parseAmount, toMajor } from '@/lib/money';
import { nextOccurrence } from '@/lib/recurring';
import { parseSms, type ParsedSms } from '@/lib/sms-parse';
import type { Category, Frequency, Transaction, TxType } from '@/lib/types';
import { checkBudgetAlerts } from '@/services/budget-alerts';
import { captureReceipt, deleteReceipt } from '@/services/receipts';
import { useApp, useLoad } from '@/state/app';
import { categoryName } from '@/state/labels';
import {
  Button,
  Card,
  Chips,
  DateField,
  Field,
  IconButton,
  Input,
  Row,
  Screen,
  Segmented,
  Text,
  TimeField,
  ToggleRow,
} from '@/ui/kit';

type Repeat = 'none' | Frequency;
type Part = { key: string; id?: string; categoryId: string | null; amount: string };

type Loaded = {
  accounts: AccountWithBalance[];
  categories: Category[];
  tags: string[];
  tx: Transaction | null;
  parts: Transaction[];
  groupId: string | null;
  smsText: string;
  smsRequested: boolean;
};

type SmsPatch = {
  type: TxType;
  amount: string;
  date: string | null;
  time: string | null;
  accountId: string | null;
  toAccountId: string | null;
  note: string | null;
  categoryId: string | null;
  autoFrom: string | null;
};

function findSmsAccount(p: ParsedSms, accounts: AccountWithBalance[]) {
  if (!p.bank) return null;
  const bank = p.bank.toLowerCase();
  return (
    accounts.find((a) => a.name.toLowerCase().includes(bank)) ??
    (p.bankType === 'wallet'
      ? accounts.find((a) => a.type === 'wallet' && a.name.toLowerCase().includes(bank.slice(0, 4)))
      : null) ??
    null
  );
}

/** What a pasted SMS fills in: amount, date, time, account, note and a guessed category. */
function smsPatch(p: ParsedSms, text: string, accounts: AccountWithBalance[], categories: Category[]): SmsPatch {
  const account = findSmsAccount(p, accounts);
  const base = { amount: String(toMajor(p.amount)), date: p.date, time: p.time, accountId: account?.id ?? null };
  if (p.kind === 'withdrawal') {
    return {
      ...base,
      type: 'transfer',
      toAccountId: accounts.find((a) => a.type === 'cash')?.id ?? null,
      note: null,
      categoryId: null,
      autoFrom: null,
    };
  }
  const guess = pickCategory(
    `${p.merchant ?? ''} ${text}`,
    p.type,
    categories.filter((c) => c.kind === p.type),
  );
  return {
    ...base,
    type: p.type,
    toAccountId: null,
    note: p.merchant,
    categoryId: guess?.id ?? null,
    autoFrom: guess ? (p.merchant ?? p.bank ?? '') : null,
  };
}

export default function TransactionScreen() {
  const { id, type, sms } = useLocalSearchParams<{ id: string; type?: TxType; sms?: string }>();
  const data = useLoad(
    async (db): Promise<Loaded> => {
      const [accounts, categories, tags, tx] = await Promise.all([
        listAccounts(db),
        listCategories(db),
        listTags(db),
        id === 'new' ? null : getTransaction(db, id),
      ]);
      const parts = tx?.split_id ? await getSplitParts(db, tx.split_id) : [];
      const group = tx?.group_expense_id
        ? await db.getFirstAsync<{ group_id: string }>(
            'SELECT group_id FROM group_expenses WHERE id = ?',
            tx.group_expense_id,
          )
        : null;
      // Opened from the home "Paste SMS" button: read the copied message straight away.
      const smsText = sms === '1' && !tx ? await Clipboard.getStringAsync().catch(() => '') : '';
      return {
        accounts,
        categories,
        tags,
        tx,
        parts,
        groupId: group?.group_id ?? null,
        smsText,
        smsRequested: sms === '1' && !tx,
      };
    },
    [id],
  );
  if (!data) return <Screen>{null}</Screen>;
  // Remount the editor when the transaction itself changes, so its state starts from the saved values.
  return <Editor key={data.tx?.id ?? 'new'} data={data} isNew={id === 'new'} initialType={type ?? 'expense'} />;
}

function Editor({ data, isNew, initialType }: { data: Loaded; isNew: boolean; initialType: TxType }) {
  const { db, t, colors, changed, period, settings, date: fmtDate } = useApp();
  const tx = data.tx;
  const hasParts = data.parts.length > 1;
  const firstSms = data.smsText ? parseSms(data.smsText) : null;
  const init = firstSms ? smsPatch(firstSms, data.smsText, data.accounts, data.categories) : null;

  const [type, setType] = useState<TxType>(tx?.type ?? init?.type ?? initialType);
  const [amount, setAmount] = useState(
    tx ? String(toMajor(hasParts ? data.parts.reduce((a, p) => a + p.amount, 0) : tx.amount)) : (init?.amount ?? ''),
  );
  const [categoryId, setCategoryId] = useState<string | null>(tx?.category_id ?? init?.categoryId ?? null);
  // The text the category was guessed from; null once the user picks a category themselves.
  const [autoFrom, setAutoFrom] = useState<string | null>(init?.autoFrom ?? null);
  const [chosenAccountId, setAccountId] = useState<string | null>(tx?.account_id ?? init?.accountId ?? null);
  const [toAccountId, setToAccountId] = useState<string | null>(tx?.to_account_id ?? init?.toAccountId ?? null);
  const [date, setDate] = useState(tx?.date ?? init?.date ?? today());
  const [time, setTime] = useState<string | null>(tx?.time ?? init?.time ?? null);
  const [note, setNote] = useState(tx?.note ?? init?.note ?? '');
  const [tags, setTags] = useState(tx?.tags ? tx.tags.split(',').join(', ') : '');
  const [receipt, setReceipt] = useState<string | null>(tx?.receipt ?? null);
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [splitOn, setSplitOn] = useState(hasParts);
  const [parts, setParts] = useState<Part[]>(
    hasParts
      ? data.parts.map((p) => ({ key: p.id, id: p.id, categoryId: p.category_id, amount: String(toMajor(p.amount)) }))
      : [
          { key: 'a', categoryId: null, amount: '' },
          { key: 'b', categoryId: null, amount: '' },
        ],
  );
  const [sms, setSms] = useState<ParsedSms | null>(firstSms);
  const [smsMissing, setSmsMissing] = useState(data.smsRequested && !firstSms);
  const [showMore, setShowMore] = useState(!!(tx?.tags || tx?.receipt || tx?.time || hasParts));
  const [error, setError] = useState<string>();

  // Until the user picks one, default to the first account.
  const accountId = chosenAccountId ?? data.accounts[0]?.id ?? null;

  const categories = useMemo(() => {
    if (type === 'transfer') return [];
    const kind = type === 'income' ? 'income' : 'expense';
    const main = data.categories.filter((c) => c.kind === kind && !c.parent_id);
    // Show each subcategory right after its parent.
    return main.flatMap((m) => [m, ...data.categories.filter((c) => c.parent_id === m.id)]);
  }, [data.categories, type]);
  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: (c.parent_id ? '↳ ' : '') + categoryName(c, t),
    icon: c.icon as never,
    color: c.color,
  }));

  if (tx?.group_expense_id) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('tx.edit') }} />
        <Card>
          <Text>{t('tx.groupLinked')}</Text>
          {data.groupId && (
            <Button title={t('tx.openGroup')} icon="people" onPress={() => router.replace(`/groups/${data.groupId}`)} />
          )}
        </Card>
      </Screen>
    );
  }

  /** Guesses the category from text unless the user already chose one themselves. */
  const autoCategory = async (text: string, kind: TxType = type) => {
    if (kind === 'transfer' || (categoryId && !autoFrom) || !text.trim()) return;
    const k = kind === 'income' ? 'income' : 'expense';
    // A note used before keeps the category it had last time; otherwise use keyword rules.
    const previous = await listTransactions(db, { search: text.trim(), type: k, limit: 20 });
    const same = previous.find((p) => p.note.trim().toLowerCase() === text.trim().toLowerCase() && p.category_id);
    const guess = same ? categories.find((c) => c.id === same.category_id) : pickCategory(text, k, categories);
    if (guess) {
      setCategoryId(guess.id);
      setAutoFrom(text.trim());
    }
  };

  const pasteSms = async () => {
    const text = await Clipboard.getStringAsync();
    const parsed = text ? parseSms(text) : null;
    if (!parsed) {
      Alert.alert(t('tx.pasteSms'), `${t('tx.smsNotFound')}\n\n${t('tx.smsHowTo')}`);
      return;
    }
    const patch = smsPatch(parsed, text, data.accounts, data.categories);
    setSmsMissing(false);
    setSms(parsed);
    setType(patch.type);
    setAmount(patch.amount);
    if (patch.date) setDate(patch.date);
    if (patch.time) setTime(patch.time);
    if (patch.accountId) setAccountId(patch.accountId);
    setToAccountId(patch.toAccountId);
    if (patch.note && !note) setNote(patch.note);
    setCategoryId(patch.categoryId);
    setAutoFrom(patch.autoFrom);
  };

  const addSmsAccount = async () => {
    if (!sms?.bank) return;
    const newAccountId = newId();
    await saveAccount(db, {
      id: newAccountId,
      name: sms.bank,
      type: sms.bankType === 'wallet' ? 'wallet' : 'bank',
      // Start from the balance in the SMS, so the account shows it once this transaction is saved.
      opening_balance: sms.balance === null ? 0 : sms.balance + (sms.kind === 'income' ? -sms.amount : sms.amount),
    });
    setAccountId(newAccountId);
    changed();
  };

  const addReceipt = async (source: 'camera' | 'library') => {
    const uri = await captureReceipt(source);
    if (uri) setReceipt(uri);
  };

  const total = parseAmount(amount) ?? 0;
  const partsSum = parts.reduce((a, p) => a + (parseAmount(p.amount) ?? 0), 0);

  const save = async () => {
    const minor = parseAmount(amount);
    if (!minor) return setError(t('common.invalidAmount'));
    if (!accountId) return setError(t('tx.noAccounts'));
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) return setError(t('tx.sameAccount'));
    const useSplit = splitOn && type !== 'transfer';
    const filled = parts.filter((p) => parseAmount(p.amount));
    if (useSplit && (partsSum !== minor || filled.length < 2)) return setError(t('tx.splitMismatch'));

    const txId = tx?.id ?? newId();
    let recId = tx?.recurring_id ?? null;
    if (isNew && repeat !== 'none' && !useSplit) {
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
    if (tx?.receipt && tx.receipt !== receipt) deleteReceipt(tx.receipt);
    const common = {
      type,
      account_id: accountId,
      to_account_id: toAccountId,
      date,
      time,
      note: note.trim(),
      tags: normalizeTags(tags),
      receipt,
      recurring_id: recId,
    };

    const touched: { categoryId: string | null; amount: number }[] = [];
    if (useSplit) {
      const splitId = tx?.split_id ?? txId;
      const keep: string[] = [];
      for (const [i, p] of filled.entries()) {
        const partId = i === 0 ? txId : (p.id ?? newId());
        keep.push(partId);
        const partAmount = parseAmount(p.amount) ?? 0;
        await saveTransaction(db, {
          ...common,
          id: partId,
          amount: partAmount,
          category_id: p.categoryId,
          split_id: splitId,
          created_at: (data.parts.find((x) => x.id === partId)?.created_at ?? Date.now()) + i,
        });
        touched.push({ categoryId: p.categoryId, amount: partAmount });
      }
      await deleteSplitParts(db, splitId, keep);
    } else {
      if (tx?.split_id) await deleteSplitParts(db, tx.split_id, [txId]);
      await saveTransaction(db, {
        ...common,
        id: txId,
        amount: minor,
        category_id: categoryId,
        split_id: null,
        created_at: tx?.created_at,
      });
      touched.push({ categoryId, amount: minor });
    }

    let alerts: string[] = [];
    if (settings.budgetAlerts && type === 'expense' && isNew && date >= period.start && date <= period.end) {
      for (const x of touched) alerts = alerts.concat(await checkBudgetAlerts(db, period, t, x));
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
          if (!tx) return;
          if (tx.split_id) await deleteSplitParts(db, tx.split_id);
          else await deleteTransaction(db, tx.id);
          deleteReceipt(tx.receipt);
          changed();
          router.back();
        },
      },
    ]);
  };

  const accountOptions = data.accounts.map((a) => ({ value: a.id, label: a.name }));
  const typeColor = type === 'income' ? colors.income : type === 'expense' ? colors.expense : colors.text;
  const smsAccountMissing = sms?.bank && !findSmsAccount(sms, data.accounts);
  const tagList = tags
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? t('tx.add') : t('tx.edit') }} />
      <Segmented<TxType>
        value={type}
        onChange={(v) => {
          setType(v);
          setCategoryId(null);
          setAutoFrom(null);
          if (v !== 'transfer' && note) autoCategory(note, v);
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
      {isNew && <Button kind="secondary" icon="clipboard-outline" title={t('tx.pasteSms')} onPress={pasteSms} />}

      {smsMissing && (
        <Card style={{ borderColor: colors.warning }}>
          <Row>
            <Text variant="label" style={{ flex: 1 }}>
              {t('tx.smsNotFound')}
            </Text>
            <IconButton icon="close" label={t('common.close')} onPress={() => setSmsMissing(false)} />
          </Row>
          <Text variant="caption" muted>
            {t('tx.smsHowTo')}
          </Text>
        </Card>
      )}

      {sms && (
        <Card style={{ borderColor: colors.primary }}>
          <Row>
            <Text variant="label" color={colors.primary} style={{ flex: 1 }}>
              {t('tx.smsDetected')}
            </Text>
            <IconButton icon="close" label={t('common.close')} onPress={() => setSms(null)} />
          </Row>
          {[
            sms.bank && `${t('tx.smsBank')}: ${sms.bank}${sms.last4 ? ` ••${sms.last4}` : ''}`,
            sms.merchant && `${sms.type === 'income' ? t('tx.smsFrom') : t('tx.smsAt')}: ${sms.merchant}`,
            `${t('common.date')}: ${sms.date ? fmtDate(sms.date) : t('tx.smsNoDate')}${sms.time ? `, ${sms.time}` : ''}`,
            sms.balance !== null && t('tx.smsBalance', { amount: String(toMajor(sms.balance)) }),
            sms.fee ? t('tx.smsFee', { amount: String(toMajor(sms.fee)) }) : null,
            sms.reference && `${t('tx.smsRef')}: ${sms.reference}`,
            sms.kind === 'withdrawal' && t('tx.smsWithdrawal'),
          ]
            .filter(Boolean)
            .map((line) => (
              <Text key={String(line)} variant="caption">
                {line as string}
              </Text>
            ))}
          {smsAccountMissing && (
            <Button
              kind="secondary"
              icon="add-circle-outline"
              title={t('tx.smsCreateAccount', { name: sms.bank ?? '' })}
              onPress={addSmsAccount}
            />
          )}
        </Card>
      )}

      <Field label={`${t('common.note')} (${t('common.optional')})`} hint={t('tx.noteHint')}>
        <Input
          value={note}
          onChangeText={setNote}
          onEndEditing={() => autoCategory(note)}
          onBlur={() => autoCategory(note)}
          maxLength={200}
          placeholder={t('tx.notePlaceholder')}
        />
      </Field>

      {type !== 'transfer' && !splitOn && (
        <Field
          label={t('tx.category')}
          hint={autoFrom !== null && categoryId ? t('tx.autoCategory', { text: autoFrom || '…' }) : undefined}>
          <Chips
            options={categoryOptions}
            value={categoryId}
            onChange={(v) => {
              setCategoryId(v);
              setAutoFrom(null);
            }}
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

      {isNew && !splitOn && (
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

      {!showMore ? (
        <Button kind="ghost" icon="options-outline" title={t('tx.moreOptions')} onPress={() => setShowMore(true)} />
      ) : (
        <Card>
          <Field label={`${t('common.time')} (${t('common.optional')})`}>
            <TimeField value={time} onChange={setTime} />
          </Field>

          <Field label={t('tx.tags')} hint={t('tx.tagsHint')}>
            <Input value={tags} onChangeText={setTags} autoCapitalize="none" placeholder="trip, eid, uni" />
            {data.tags.filter((x) => !tagList.includes(x)).length > 0 && (
              <Chips
                wrap={false}
                options={data.tags
                  .filter((x) => !tagList.includes(x))
                  .slice(0, 12)
                  .map((x) => ({ value: x, label: `#${x}` }))}
                value={null}
                onChange={(v) => setTags([...tagList, v].join(', '))}
              />
            )}
          </Field>

          <Field label={t('tx.receipt')}>
            {receipt ? (
              <Row>
                <Image source={{ uri: receipt }} style={{ width: 96, height: 128, borderRadius: 8 }} />
                <Button
                  kind="ghost"
                  icon="trash-outline"
                  title={t('tx.removePhoto')}
                  onPress={() => setReceipt(null)}
                />
              </Row>
            ) : (
              <Row>
                <Button
                  kind="secondary"
                  icon="camera-outline"
                  title={t('tx.takePhoto')}
                  onPress={() => addReceipt('camera')}
                  style={{ flex: 1 }}
                />
                <Button
                  kind="secondary"
                  icon="image-outline"
                  title={t('tx.choosePhoto')}
                  onPress={() => addReceipt('library')}
                  style={{ flex: 1 }}
                />
              </Row>
            )}
          </Field>

          {type !== 'transfer' && (
            <ToggleRow
              title={t('tx.splitCategories')}
              subtitle={t('tx.splitHint')}
              value={splitOn}
              onChange={setSplitOn}
            />
          )}
          {splitOn && type !== 'transfer' && (
            <View style={{ gap: Spacing.three }}>
              {parts.map((p, i) => (
                <View key={p.key} style={{ gap: Spacing.one }}>
                  <Row>
                    <Text variant="label" style={{ flex: 1 }}>
                      {t('tx.part', { n: i + 1 })}
                    </Text>
                    <View style={{ width: 130 }}>
                      <Input
                        keyboardType="decimal-pad"
                        value={p.amount}
                        placeholder="0"
                        onChangeText={(v) => setParts(parts.map((x) => (x.key === p.key ? { ...x, amount: v } : x)))}
                      />
                    </View>
                    {parts.length > 2 && (
                      <IconButton
                        icon="close"
                        label={t('common.remove')}
                        onPress={() => setParts(parts.filter((x) => x.key !== p.key))}
                      />
                    )}
                  </Row>
                  <Chips
                    wrap={false}
                    options={categoryOptions}
                    value={p.categoryId}
                    onChange={(v) => setParts(parts.map((x) => (x.key === p.key ? { ...x, categoryId: v } : x)))}
                  />
                </View>
              ))}
              <Row style={{ justifyContent: 'space-between' }}>
                <Button
                  kind="ghost"
                  icon="add"
                  title={t('tx.splitAdd')}
                  onPress={() => setParts([...parts, { key: newId(), categoryId: null, amount: '' }])}
                />
                <Pressable
                  onPress={() => {
                    // Put whatever is left into the last empty part.
                    const left = total - partsSum;
                    const target = [...parts].reverse().find((x) => !parseAmount(x.amount));
                    if (left > 0 && target)
                      setParts(parts.map((x) => (x.key === target.key ? { ...x, amount: String(toMajor(left)) } : x)));
                  }}>
                  <Text variant="caption" color={total - partsSum === 0 ? colors.income : colors.warning}>
                    {t('tx.splitRemaining', { amount: String(toMajor(total - partsSum)) })}
                  </Text>
                </Pressable>
              </Row>
            </View>
          )}
        </Card>
      )}

      <Button title={t('common.save')} onPress={save} />
      {!isNew && (
        <Row style={{ justifyContent: 'center', marginTop: Spacing.two }}>
          <Button kind="ghost" icon="trash-outline" title={t('common.delete')} onPress={remove} />
        </Row>
      )}
      {data.accounts.length === 0 && <Text color={colors.danger}>{t('tx.noAccounts')}</Text>}
    </Screen>
  );
}
