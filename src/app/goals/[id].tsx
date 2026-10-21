import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { GOAL_TEMPLATES } from '@/db/defaults';
import { deleteGoal, listGoals, newId, saveGoal, totalsInRange } from '@/db/repo';
import { previousPeriod } from '@/lib/dates';
import { parseAmount, toMajor } from '@/lib/money';
import { useApp, useLoad } from '@/state/app';
import { Button, Chips, DateField, Field, Input, Screen, Text } from '@/ui/kit';

export default function GoalForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { db, t, money, period, settings, changed } = useApp();
  const [template, setTemplate] = useState<string>('custom');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string; target?: string }>({});

  // Average expense over the last three full months, for the emergency fund recommendation.
  const avgExpense = useLoad(
    async (d) => {
      const p1 = previousPeriod(period, settings.monthStartDay);
      const p2 = previousPeriod(p1, settings.monthStartDay);
      const p3 = previousPeriod(p2, settings.monthStartDay);
      // Only months with any spending count, so a new user is not told their expenses are tiny.
      const expenses = (await Promise.all([p1, p2, p3].map((p) => totalsInRange(d, p.start, p.end))))
        .map((x) => x.expense)
        .filter((x) => x > 0);
      return expenses.length ? Math.round(expenses.reduce((a, b) => a + b, 0) / expenses.length) : 0;
    },
    [period.start],
  );

  useEffect(() => {
    if (isNew) return;
    listGoals(db).then((list) => {
      const g = list.find((x) => x.id === id);
      if (!g) return;
      setTemplate(g.template ?? 'custom');
      setName(g.name);
      setTarget(String(toMajor(g.target)));
      setDeadline(g.deadline);
    });
  }, [db, id, isNew]);

  const pickTemplate = (key: string) => {
    setTemplate(key);
    const tpl = GOAL_TEMPLATES.find((g) => g.key === key);
    if (!tpl) return;
    setName(t(`goal.${tpl.key}`));
    const amount = tpl.key === 'emergency' ? (avgExpense ?? 0) * 3 : tpl.target;
    if (amount) setTarget(String(toMajor(amount)));
  };

  const save = async () => {
    const minor = parseAmount(target);
    const e = {
      name: name.trim() ? undefined : t('common.required'),
      target: minor ? undefined : t('common.invalidAmount'),
    };
    setErrors(e);
    if (e.name || !minor) return;
    await saveGoal(db, {
      id: isNew ? newId() : id,
      name: name.trim(),
      template: template === 'custom' ? null : template,
      target: minor,
      deadline,
    });
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
          await deleteGoal(db, id);
          changed();
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? t('goals.add') : t('goals.edit') }} />
      {isNew && (
        <Field label={t('goals.templates')}>
          <Chips
            options={[
              { value: 'custom', label: t('goals.custom') },
              ...GOAL_TEMPLATES.map((g) => ({ value: g.key, label: t(`goal.${g.key}`), icon: g.icon as never })),
            ]}
            value={template}
            onChange={pickTemplate}
          />
        </Field>
      )}
      {template === 'emergency' && (
        <Text variant="caption" muted>
          {avgExpense
            ? t('goals.emergencyHint', {
                min: money(avgExpense * 3, { ignoreHidden: true }),
                max: money(avgExpense * 6, { ignoreHidden: true }),
              })
            : t('goals.emergencyNoData')}
        </Text>
      )}
      <Field label={t('common.name')} error={errors.name}>
        <Input value={name} onChangeText={setName} maxLength={40} />
      </Field>
      <Field label={t('goals.target')} error={errors.target}>
        <Input big value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="0" />
      </Field>
      <Field label={`${t('goals.deadline')} (${t('common.optional')})`}>
        <DateField value={deadline} onChange={setDeadline} allowClear />
      </Field>
      <Button title={t('common.save')} onPress={save} />
      {!isNew && <Button kind="ghost" icon="trash-outline" title={t('common.delete')} onPress={remove} />}
    </Screen>
  );
}
