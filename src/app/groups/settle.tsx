import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { addSettlement, getGroup, type GroupDetail } from '@/db/groups-repo';
import { today } from '@/lib/dates';
import { parseAmount, toMajor } from '@/lib/money';
import { useApp, useLoad } from '@/state/app';
import { Button, Chips, DateField, Field, Input, Screen, Text } from '@/ui/kit';

export default function SettleScreen() {
  const params = useLocalSearchParams<{ group: string; from?: string; to?: string; amount?: string }>();
  const data = useLoad((db) => getGroup(db, params.group), [params.group]);
  if (!data) return <Screen>{null}</Screen>;
  return <SettleForm detail={data} from={params.from} to={params.to} amount={params.amount} />;
}

function SettleForm({
  detail,
  from: from0,
  to: to0,
  amount: amount0,
}: {
  detail: GroupDetail;
  from?: string;
  to?: string;
  amount?: string;
}) {
  const { db, t, money, changed } = useApp();
  // Default to the first suggested payment that involves me, or the first one at all.
  const suggestion =
    detail.transfers.find((x) => x.from === detail.me?.id || x.to === detail.me?.id) ?? detail.transfers[0];
  const [from, setFrom] = useState<string | null>(from0 ?? suggestion?.from ?? null);
  const [to, setTo] = useState<string | null>(to0 ?? suggestion?.to ?? null);
  const [amount, setAmount] = useState(
    amount0 ? String(toMajor(Number(amount0))) : suggestion ? String(toMajor(suggestion.amount)) : '',
  );
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string>();

  const options = detail.members.map((m) => ({ value: m.id, label: m.name }));
  const owed = detail.transfers.find((x) => x.from === from && x.to === to)?.amount;

  const save = async () => {
    const minor = parseAmount(amount);
    if (!from || !to || from === to) return setError(t('groups.settleSame'));
    if (!minor) return setError(t('common.invalidAmount'));
    await addSettlement(db, { group_id: detail.group.id, from_member: from, to_member: to, amount: minor, date });
    changed();
    router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('groups.settleTitle') }} />
      <Field label={t('groups.settleFrom')}>
        <Chips options={options} value={from} onChange={setFrom} />
      </Field>
      <Field label={t('groups.settleTo')}>
        <Chips options={options.filter((o) => o.value !== from)} value={to} onChange={setTo} />
      </Field>
      <Field label={t('common.amount')} error={error}>
        <Input big keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0" />
      </Field>
      {owed ? (
        <Text variant="caption" muted>
          {t('groups.suggested', { amount: money(owed, { ignoreHidden: true }) })}
        </Text>
      ) : null}
      <Field label={t('common.date')}>
        <DateField value={date} onChange={(v) => v && setDate(v)} />
      </Field>
      <Button title={t('common.save')} onPress={save} />
    </Screen>
  );
}
