import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { listCategories } from '@/db/repo';
import type { CategoryKind } from '@/lib/types';
import { useApp, useLoad } from '@/state/app';
import { categoryName } from '@/state/labels';
import { Card, CategoryIcon, Divider, Fab, ListRow, Screen, Segmented } from '@/ui/kit';

export default function Categories() {
  const { t, colors } = useApp();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const all = useLoad((db) => listCategories(db));
  const main = (all ?? []).filter((c) => c.kind === kind && !c.parent_id);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t('categories.title') }} />
      <Screen>
        <Segmented<CategoryKind>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'expense', label: t('tx.expense'), color: colors.expense },
            { value: 'income', label: t('tx.income'), color: colors.income },
          ]}
        />
        <Card style={{ paddingVertical: Spacing.one }}>
          {main.map((c, i) => (
            <View key={c.id}>
              {i > 0 && <Divider />}
              <ListRow
                onPress={() => router.push(`/categories/${c.id}`)}
                left={<CategoryIcon icon={c.icon} color={c.color} />}
                title={categoryName(c, t)}
                chevron
              />
              {(all ?? [])
                .filter((s) => s.parent_id === c.id)
                .map((s) => (
                  <View key={s.id} style={{ paddingStart: Spacing.five }}>
                    <ListRow
                      onPress={() => router.push(`/categories/${s.id}`)}
                      left={<CategoryIcon icon={s.icon} color={s.color} size={30} />}
                      title={categoryName(s, t)}
                      chevron
                    />
                  </View>
                ))}
            </View>
          ))}
        </Card>
      </Screen>
      <Fab label={t('categories.add')} onPress={() => router.push(`/categories/new?kind=${kind}`)} />
    </View>
  );
}
