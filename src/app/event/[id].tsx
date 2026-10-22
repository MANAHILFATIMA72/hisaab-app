import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { deleteEventBudget, listEventBudgets, newId, normalizeTags, saveEventBudget } from '@/db/repo';
import { parseAmount, toMajor } from '@/lib/money';
import type { EventBudget } from '@/lib/types';
import { useApp, useLoad } from '@/state/app';
import { Button, Chips, Field, Input, Screen } from '@/ui/kit';

const PRESETS = [
  { name: 'Eid', tag: 'eid' },
  { name: 'Ramadan', tag: 'ramadan' },
  { name: 'Trip', tag: 'trip' },
  { name: 'Shaadi', tag: 'shaadi' },
  { name: 'Semester', tag: 'semester' },
];

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useLoad(async (db) => ({ event: (await listEventBudgets(db)).find((e) => e.id === id) ?? null }), [id]);
  if (!data) return <Screen>{null}</Screen>;
  return <EventForm key={data.event?.id ?? 'new'} event={data.event} />;
}

function EventForm({ event }: { event: EventBudget | null }) {
  const { db, t, changed } = useApp();
  const [name, setName] = useState(event?.name ?? '');
  const [tag, setTag] = useState(event?.tag ?? '');
  const [amount, setAmount] = useState(event ? String(toMajor(event.amount)) : '');
  const [error, setError] = useState<string>();

  const save = async () => {
    const minor = parseAmount(amount);
    const cleanTag = normalizeTags(tag || name).split(',')[0];
    if (!name.trim() || !cleanTag) return setError(t('common.required'));
    if (!minor) return setError(t('common.invalidAmount'));
    await saveEventBudget(db, { id: event?.id ?? newId(), name, tag: cleanTag, amount: minor });
    changed();
    router.back();
  };

  const remove = () =>
    Alert.alert(t('common.confirmDelete'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          if (event) await deleteEventBudget(db, event.id);
          changed();
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: event ? t('budget.editEvent') : t('budget.addEvent') }} />
      {!event && (
        <Chips
          options={PRESETS.map((p) => ({ value: p.tag, label: p.name }))}
          value={tag || null}
          onChange={(v) => {
            const p = PRESETS.find((x) => x.tag === v);
            if (p) {
              setName(p.name);
              setTag(p.tag);
            }
          }}
        />
      )}
      <Field label={t('budget.eventName')} error={error}>
        <Input value={name} onChangeText={setName} placeholder="Murree trip" />
      </Field>
      <Field label={t('budget.eventTag')} hint={t('budget.eventTagHint')}>
        <Input value={tag} onChangeText={setTag} autoCapitalize="none" placeholder="murree" />
      </Field>
      <Field label={t('common.amount')}>
        <Input big keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0" />
      </Field>
      <Button title={t('common.save')} onPress={save} />
      {event && <Button kind="ghost" icon="trash-outline" title={t('common.delete')} onPress={remove} />}
    </Screen>
  );
}
