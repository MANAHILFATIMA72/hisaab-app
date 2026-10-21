import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { listUdhaar, newId, saveUdhaar } from '@/db/repo';
import { today } from '@/lib/dates';
import { parseAmount, toMajor } from '@/lib/money';
import type { UdhaarDirection } from '@/lib/types';
import { ensurePermission, syncReminders } from '@/services/notifications';
import { useApp } from '@/state/app';
import { Button, DateField, Field, Input, Screen, Segmented } from '@/ui/kit';

export default function UdhaarForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { db, t, colors, settings, changed } = useApp();
  const [direction, setDirection] = useState<UdhaarDirection>('given');
  const [person, setPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ person?: string; amount?: string }>({});

  useEffect(() => {
    if (isNew) return;
    listUdhaar(db).then(({ items }) => {
      const u = items.find((x) => x.id === id);
      if (!u) return;
      setDirection(u.direction);
      setPerson(u.person);
      setPhone(u.phone);
      setAmount(String(toMajor(u.amount)));
      setDate(u.date);
      setDueDate(u.due_date);
      setReason(u.reason);
    });
  }, [db, id, isNew]);

  const save = async () => {
    const minor = parseAmount(amount);
    const e = {
      person: person.trim() ? undefined : t('common.required'),
      amount: minor ? undefined : t('common.invalidAmount'),
    };
    setErrors(e);
    if (e.person || e.amount || !minor) return;
    await saveUdhaar(db, {
      id: isNew ? newId() : id,
      person,
      phone,
      direction,
      amount: minor,
      date,
      due_date: dueDate,
      reason: reason.trim(),
    });
    if (dueDate && settings.udhaarReminders && (await ensurePermission())) await syncReminders(db, settings);
    changed();
    router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? t('udhaar.add') : t('udhaar.edit') }} />
      <Segmented<UdhaarDirection>
        value={direction}
        onChange={setDirection}
        options={[
          { value: 'given', label: t('udhaar.given'), color: colors.income },
          { value: 'taken', label: t('udhaar.taken'), color: colors.expense },
        ]}
      />
      <Field label={t('udhaar.person')} error={errors.person}>
        <Input value={person} onChangeText={setPerson} autoFocus={isNew} maxLength={60} />
      </Field>
      <Field label={t('common.amount')} error={errors.amount}>
        <Input big keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0" />
      </Field>
      <Field label={`${t('udhaar.phone')} (${t('common.optional')})`}>
        <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="03xx xxxxxxx" />
      </Field>
      <Field label={t('common.date')}>
        <DateField value={date} onChange={(v) => v && setDate(v)} />
      </Field>
      <Field label={`${t('udhaar.dueDate')} (${t('common.optional')})`}>
        <DateField value={dueDate} onChange={setDueDate} allowClear />
      </Field>
      <Field label={`${t('udhaar.reason')} (${t('common.optional')})`}>
        <Input value={reason} onChangeText={setReason} maxLength={120} />
      </Field>
      <Button title={t('common.save')} onPress={save} />
    </Screen>
  );
}
