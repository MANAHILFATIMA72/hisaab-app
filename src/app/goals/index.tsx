import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { addGoalContribution, listGoals, newId, type GoalWithSaved } from '@/db/repo';
import { daysBetween, today } from '@/lib/dates';
import { useApp, useLoad } from '@/state/app';
import { AmountPrompt } from '@/ui/amount-prompt';
import { goalIcon } from '@/ui/icons';
import { Button, Card, CategoryIcon, Empty, Fab, ProgressBar, Row, Screen, Text } from '@/ui/kit';

/** Amount to save each month to reach the target by the deadline, or null without a deadline. */
function perMonthNeeded(g: GoalWithSaved): number | null {
  if (!g.deadline || g.saved >= g.target) return null;
  const months = Math.max(1, Math.ceil(daysBetween(today(), g.deadline) / 30));
  return Math.ceil((g.target - g.saved) / months);
}

export default function Goals() {
  const { db, t, colors, money, date, changed } = useApp();
  const goals = useLoad((d) => listGoals(d));
  const [adding, setAdding] = useState<GoalWithSaved | null>(null);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t('goals.title') }} />
      <Screen>
        {!goals?.length && <Empty icon="flag-outline" text={t('common.empty')} />}
        {goals?.map((g) => {
          const done = g.saved >= g.target;
          const need = perMonthNeeded(g);
          return (
            <Card key={g.id} onPress={() => router.push(`/goals/${g.id}`)}>
              <Row>
                <CategoryIcon icon={goalIcon(g.template)} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="label">{g.name}</Text>
                  <Text variant="caption" muted>
                    {money(g.saved, { ignoreHidden: true })} / {money(g.target, { ignoreHidden: true })}
                    {g.deadline ? ` · ${date(g.deadline)}` : ''}
                  </Text>
                </View>
                <Text variant="label" color={colors.primary}>
                  {Math.min(100, Math.round((g.saved / g.target) * 100))}%
                </Text>
              </Row>
              <ProgressBar value={g.saved / g.target} />
              {done ? (
                <Text color={colors.income}>{t('goals.reached')}</Text>
              ) : (
                <>
                  {need !== null && (
                    <Text variant="caption" muted>
                      {t('goals.perMonth', { amount: money(need, { ignoreHidden: true }) })}
                    </Text>
                  )}
                  <Button kind="secondary" icon="add" title={t('goals.addMoney')} onPress={() => setAdding(g)} />
                </>
              )}
            </Card>
          );
        })}
      </Screen>
      <Fab label={t('goals.add')} onPress={() => router.push('/goals/new')} />
      <AmountPrompt
        visible={!!adding}
        title={`${t('goals.addMoney')} · ${adding?.name ?? ''}`}
        onClose={() => setAdding(null)}
        onSave={async (minor) => {
          if (!adding) return;
          await addGoalContribution(db, { id: newId(), goal_id: adding.id, amount: minor, date: today() });
          setAdding(null);
          changed();
        }}
      />
    </View>
  );
}
