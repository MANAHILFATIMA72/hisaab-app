import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import {
  deleteGroupExpense,
  deleteGroupRecurring,
  getGroup,
  getGroupExpense,
  processGroupRecurring,
  saveGroupExpense,
  saveGroupRecurring,
  type StoredSplit,
} from '@/db/groups-repo';
import { listAccounts, listCategories, newId } from '@/db/repo';
import { pickCategory } from '@/lib/categorize';
import { addMonths, today } from '@/lib/dates';
import { computeShares, type SplitInput, type SplitMode } from '@/lib/groups';
import { parseAmount, toMajor } from '@/lib/money';
import type { GroupRecurring } from '@/lib/types';
import { useApp, useLoad } from '@/state/app';
import { categoryName } from '@/state/labels';
import {
  Button,
  Card,
  Chips,
  DateField,
  Divider,
  Field,
  IconButton,
  Input,
  MultiChips,
  Row,
  Screen,
  Segmented,
  Text,
  ToggleRow,
} from '@/ui/kit';

export default function BillScreen() {
  const { id, group, monthly } = useLocalSearchParams<{ id: string; group: string; monthly?: string }>();
  const isRule = monthly === '1';
  const data = useLoad(
    async (db) => {
      const [detail, accounts, categories] = await Promise.all([
        getGroup(db, group),
        listAccounts(db),
        listCategories(db),
      ]);
      const existing = id === 'new' || isRule ? null : await getGroupExpense(db, id);
      const rule =
        id !== 'new' && isRule
          ? await db.getFirstAsync<GroupRecurring>('SELECT * FROM group_recurring WHERE id = ?', id)
          : null;
      return { detail, accounts, categories, existing, rule };
    },
    [id, group],
  );
  if (!data?.detail) return <Screen>{null}</Screen>;
  return <BillEditor key={id} {...data} detail={data.detail} isRule={isRule} />;
}

type ItemRow = { key: string; name: string; price: string; members: string[] };

function BillEditor({
  detail,
  accounts,
  categories,
  existing,
  rule,
  isRule,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof getGroup>>>;
  accounts: Awaited<ReturnType<typeof listAccounts>>;
  categories: Awaited<ReturnType<typeof listCategories>>;
  existing: Awaited<ReturnType<typeof getGroupExpense>>;
  rule: GroupRecurring | null;
  isRule: boolean;
}) {
  const { db, t, colors, money, changed } = useApp();
  const memberIds = detail.members.map((m) => m.id);
  const meId = detail.me?.id ?? memberIds[0];
  const saved = existing?.expense ?? rule;
  const input: StoredSplit | null = existing?.input ?? (rule ? (JSON.parse(rule.split) as StoredSplit) : null);

  const [title, setTitle] = useState(saved?.title ?? '');
  const [amount, setAmount] = useState(saved && input?.mode !== 'items' ? String(toMajor(saved.amount)) : '');
  const [date, setDate] = useState(existing?.expense.date ?? rule?.next_date ?? today());
  const [paidBy, setPaidBy] = useState<string>(saved?.paid_by ?? meId);
  const [mode, setMode] = useState<SplitMode>(input?.mode ?? 'equal');
  const [equal, setEqual] = useState<string[]>(input?.mode === 'equal' ? input.members : memberIds);
  const [amounts, setAmounts] = useState<Record<string, string>>(
    input?.mode === 'amount'
      ? Object.fromEntries(Object.entries(input.amounts).map(([k, v]) => [k, String(toMajor(v))]))
      : {},
  );
  const [percents, setPercents] = useState<Record<string, string>>(
    input?.mode === 'percent' ? Object.fromEntries(Object.entries(input.percents).map(([k, v]) => [k, String(v)])) : {},
  );
  const [items, setItems] = useState<ItemRow[]>(
    input?.mode === 'items'
      ? input.items.map((i, n) => ({
          key: String(n),
          name: i.name,
          price: String(toMajor(i.amount)),
          members: i.members,
        }))
      : [{ key: 'first', name: '', price: '', members: memberIds }],
  );
  const [extra, setExtra] = useState(input?.mode === 'items' && input.extra ? String(toMajor(input.extra)) : '');
  const [categoryId, setCategoryId] = useState<string | null>(saved?.category_id ?? null);
  const [catTouched, setCatTouched] = useState(!!saved);
  const [track, setTrack] = useState(existing ? !!existing.myTx : rule ? !!input?.trackAccount : true);
  const [accountId, setAccountId] = useState<string | null>(
    existing?.myTx?.account_id ?? input?.trackAccount ?? accounts[0]?.id ?? null,
  );
  const [repeat, setRepeat] = useState(false);
  const [error, setError] = useState<string>();

  const expenseCats = categories.filter((c) => c.kind === 'expense' && !c.parent_id);
  const name = (id: string) => detail.members.find((m) => m.id === id)?.name ?? '?';

  const buildInput = (): SplitInput => {
    switch (mode) {
      case 'equal':
        return { mode, members: equal };
      case 'amount':
        return {
          mode,
          amounts: Object.fromEntries(memberIds.map((m) => [m, parseAmount(amounts[m] ?? '') ?? 0])),
        };
      case 'percent':
        return { mode, percents: Object.fromEntries(memberIds.map((m) => [m, Number(percents[m]) || 0])) };
      case 'items':
        return {
          mode,
          items: items.map((i) => ({ name: i.name.trim(), amount: parseAmount(i.price) ?? 0, members: i.members })),
          extra: parseAmount(extra) ?? 0,
        };
    }
  };
  const splitInput = buildInput();

  const total = mode === 'items' ? computeShares(0, splitInput).total : (parseAmount(amount) ?? 0);
  const result = computeShares(total, splitInput);
  const myShare = result.shares[meId] ?? 0;

  const errorText = () => {
    switch (result.error) {
      case 'noMembers':
        return t('groups.errNoMembers');
      case 'amountMismatch':
        return (result.diff ?? 0) > 0
          ? t('groups.amountLeft', { amount: money(result.diff ?? 0, { ignoreHidden: true }) })
          : t('groups.amountOver', { amount: money(-(result.diff ?? 0), { ignoreHidden: true }) });
      case 'percentMismatch':
        return (result.diff ?? 0) > 0
          ? t('groups.percentLeft', { percent: Math.round((result.diff ?? 0) * 100) / 100 })
          : t('groups.percentOver', { percent: Math.round(-(result.diff ?? 0) * 100) / 100 });
      case 'itemNoMembers':
        return t('groups.errItemMembers');
      case 'noItems':
        return t('groups.errNoItems');
      default:
        return undefined;
    }
  };

  const onTitleDone = () => {
    if (catTouched || !title.trim()) return;
    const guess = pickCategory(title, 'expense', categories);
    if (guess) setCategoryId(guess.id);
  };

  const save = async () => {
    if (!title.trim()) return setError(t('common.required'));
    if (!total) return setError(t('common.invalidAmount'));
    if (result.error) return setError(errorText());
    const stored: StoredSplit = { ...splitInput };
    if (isRule) {
      const ruleId = rule?.id ?? newId();
      await saveGroupRecurring(db, {
        id: ruleId,
        group_id: detail.group.id,
        title: title.trim(),
        amount: total,
        paid_by: paidBy,
        split: JSON.stringify({ ...stored, trackAccount: track ? accountId : null }),
        category_id: categoryId,
        next_date: date,
        active: rule?.active ?? 1,
      });
      await processGroupRecurring(db, today());
    } else {
      const expenseId = existing?.expense.id ?? newId();
      await saveGroupExpense(
        db,
        {
          id: expenseId,
          group_id: detail.group.id,
          title,
          amount: total,
          paid_by: paidBy,
          date,
          category_id: categoryId,
        },
        stored,
        result.shares,
        track && accountId ? { meId, accountId } : null,
      );
      if (repeat) {
        await saveGroupRecurring(db, {
          id: newId(),
          group_id: detail.group.id,
          title: title.trim(),
          amount: total,
          paid_by: paidBy,
          split: JSON.stringify({ ...stored, trackAccount: track ? accountId : null }),
          category_id: categoryId,
          next_date: addMonths(date, 1),
          active: 1,
        });
      }
    }
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
          if (rule) await deleteGroupRecurring(db, rule.id);
          else if (existing) await deleteGroupExpense(db, existing.expense.id);
          changed();
          router.back();
        },
      },
    ]);

  const toggleRuleActive = async () => {
    if (!rule) return;
    await saveGroupRecurring(db, { ...rule, active: rule.active ? 0 : 1 });
    changed();
    router.back();
  };

  const memberOptions = detail.members.map((m) => ({ value: m.id, label: m.name }));

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: isRule ? t('groups.addRecurring') : saved ? t('groups.editExpense') : t('groups.addExpense'),
        }}
      />
      {isRule && (
        <Text variant="caption" muted>
          {t('groups.recurringHint')}
        </Text>
      )}
      <Field label={t('groups.expenseTitle')} error={error}>
        <Input
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            setError(undefined);
          }}
          onEndEditing={onTitleDone}
          onBlur={onTitleDone}
          placeholder={isRule ? t('groups.rulePlaceholder') : t('groups.expensePlaceholder')}
          autoFocus={!saved}
        />
      </Field>

      <Field label={t('groups.splitHow')}>
        <Segmented<SplitMode>
          value={mode}
          onChange={(v) => {
            setMode(v);
            setError(undefined);
          }}
          options={[
            { value: 'equal', label: t('groups.equal') },
            { value: 'amount', label: t('groups.byAmount') },
            { value: 'percent', label: t('groups.byPercent') },
            { value: 'items', label: t('groups.byItems') },
          ]}
        />
      </Field>

      {mode !== 'items' && (
        <Field label={t('common.amount')}>
          <Input
            big
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              setError(undefined);
            }}
            placeholder="0"
          />
        </Field>
      )}

      <Field label={t('groups.paidBy')}>
        <Chips options={memberOptions} value={paidBy} onChange={setPaidBy} />
      </Field>

      <Card>
        {mode === 'equal' && (
          <Field label={t('groups.includeIn')}>
            <MultiChips options={memberOptions} value={equal} onChange={setEqual} />
          </Field>
        )}

        {(mode === 'amount' || mode === 'percent') &&
          detail.members.map((m) => (
            <Row key={m.id}>
              <Text variant="label" style={{ flex: 1 }}>
                {m.name}
              </Text>
              <View style={{ width: 130 }}>
                <Input
                  keyboardType="decimal-pad"
                  placeholder={mode === 'percent' ? '%' : '0'}
                  value={(mode === 'amount' ? amounts : percents)[m.id] ?? ''}
                  onChangeText={(v) =>
                    mode === 'amount' ? setAmounts({ ...amounts, [m.id]: v }) : setPercents({ ...percents, [m.id]: v })
                  }
                />
              </View>
            </Row>
          ))}

        {mode === 'items' && (
          <View style={{ gap: Spacing.three }}>
            {items.map((it, i) => (
              <View key={it.key} style={{ gap: Spacing.one }}>
                {i > 0 && <Divider />}
                <Row>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={it.name}
                      placeholder={`${t('groups.itemName')} ${i + 1}`}
                      onChangeText={(v) => setItems(items.map((x) => (x.key === it.key ? { ...x, name: v } : x)))}
                    />
                  </View>
                  <View style={{ width: 110 }}>
                    <Input
                      keyboardType="decimal-pad"
                      value={it.price}
                      placeholder={t('groups.itemPrice')}
                      onChangeText={(v) => setItems(items.map((x) => (x.key === it.key ? { ...x, price: v } : x)))}
                    />
                  </View>
                  {items.length > 1 && (
                    <IconButton
                      icon="close"
                      label={t('common.remove')}
                      onPress={() => setItems(items.filter((x) => x.key !== it.key))}
                    />
                  )}
                </Row>
                <Text variant="caption" muted>
                  {t('groups.whoHad')}
                </Text>
                <MultiChips
                  options={memberOptions}
                  value={it.members}
                  onChange={(v) => setItems(items.map((x) => (x.key === it.key ? { ...x, members: v } : x)))}
                />
              </View>
            ))}
            <Button
              kind="ghost"
              icon="add"
              title={t('groups.addItem')}
              onPress={() => setItems([...items, { key: newId(), name: '', price: '', members: [] }])}
            />
            <Field label={t('groups.extra')} hint={t('groups.extraHint')}>
              <Input keyboardType="decimal-pad" value={extra} onChangeText={setExtra} placeholder="0" />
            </Field>
            <Text variant="label">{t('groups.totalItems', { amount: money(total, { ignoreHidden: true }) })}</Text>
          </View>
        )}

        {total > 0 && (
          <View style={{ gap: 2 }}>
            <Divider />
            {result.error ? (
              <Text variant="caption" color={colors.warning}>
                {errorText()}
              </Text>
            ) : (
              detail.members
                .filter((m) => result.shares[m.id])
                .map((m) => (
                  <Row key={m.id} style={{ justifyContent: 'space-between' }}>
                    <Text variant="caption">{name(m.id)}</Text>
                    <Text variant="caption">{money(result.shares[m.id], { ignoreHidden: true })}</Text>
                  </Row>
                ))
            )}
          </View>
        )}
      </Card>

      <Field label={isRule ? t('groups.firstDate') : t('common.date')}>
        <DateField value={date} onChange={(v) => v && setDate(v)} />
      </Field>

      <Field label={t('tx.category')}>
        <Chips
          wrap={false}
          options={expenseCats.map((c) => ({
            value: c.id,
            label: categoryName(c, t),
            icon: c.icon as never,
            color: c.color,
          }))}
          value={categoryId}
          onChange={(v) => {
            setCategoryId(v);
            setCatTouched(true);
          }}
        />
      </Field>

      <Card>
        <ToggleRow
          title={t('groups.trackMine')}
          subtitle={
            myShare ? `${t('groups.trackHint')} (${money(myShare, { ignoreHidden: true })})` : t('groups.trackHint')
          }
          value={track}
          onChange={setTrack}
        />
        {track && (
          <Field label={t('groups.trackAccount')}>
            <Chips
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              value={accountId}
              onChange={setAccountId}
            />
          </Field>
        )}
        {!isRule && !saved && (
          <ToggleRow
            title={t('groups.repeatMonthly')}
            subtitle={t('groups.repeatHint')}
            value={repeat}
            onChange={setRepeat}
          />
        )}
      </Card>

      <Button title={t('common.save')} onPress={save} />
      {saved && (
        <Row style={{ justifyContent: 'center', marginTop: Spacing.two }}>
          {rule && (
            <Button
              kind="ghost"
              icon={rule.active ? 'pause' : 'play'}
              title={rule.active ? t('tx.stop') : t('tx.resume')}
              onPress={toggleRuleActive}
            />
          )}
          <Button kind="ghost" icon="trash-outline" title={t('common.delete')} onPress={remove} />
        </Row>
      )}
    </Screen>
  );
}
