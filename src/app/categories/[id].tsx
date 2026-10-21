import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/db/defaults';
import { listCategories, newId, removeCategory, saveCategory } from '@/db/repo';
import type { Category, CategoryKind } from '@/lib/types';
import { useApp, useLoad } from '@/state/app';
import { categoryName } from '@/state/labels';
import { Button, CategoryIcon, Chips, Field, Input, Screen, Segmented } from '@/ui/kit';

export default function CategoryForm() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: CategoryKind }>();
  const all = useLoad((d) => listCategories(d));
  if (!all) return null;
  return <CategoryEditor id={id} all={all} defaultKind={kind ?? 'expense'} />;
}

function CategoryEditor({ id, all, defaultKind }: { id: string; all: Category[]; defaultKind: CategoryKind }) {
  const isNew = id === 'new';
  const { db, t, colors, changed } = useApp();
  const existing = isNew ? null : (all.find((x) => x.id === id) ?? null);
  const [name, setName] = useState(existing ? categoryName(existing, t) : '');
  const [kind, setKind] = useState<CategoryKind>(existing?.kind ?? defaultKind);
  const [icon, setIcon] = useState<string>(existing?.icon ?? CATEGORY_ICONS[0]);
  const [color, setColor] = useState(existing?.color ?? CATEGORY_COLORS[0]);
  const [parentId, setParentId] = useState<string>(existing?.parent_id ?? 'none');
  const [error, setError] = useState<string>();

  const hasChildren = all.some((c) => c.parent_id === id);
  const parents = all.filter((c) => c.kind === kind && !c.parent_id && c.id !== id);

  const save = async () => {
    if (!name.trim()) return setError(t('common.required'));
    // Keep the key so a default category still counts as the same category; store the typed name only if it changed.
    const unchangedDefault = existing?.key && name.trim() === categoryName(existing, t);
    await saveCategory(db, {
      id: isNew ? newId() : id,
      key: existing?.key ?? null,
      name: unchangedDefault ? existing!.name : name.trim(),
      kind,
      icon,
      color,
      parent_id: parentId === 'none' || hasChildren ? null : parentId,
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
          const r = await removeCategory(db, id);
          changed();
          router.back();
          if (r === 'archived') Alert.alert(t('categories.title'), t('categories.archived'));
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? t('categories.add') : t('categories.edit') }} />
      <View style={{ alignItems: 'center', marginBottom: Spacing.two }}>
        <CategoryIcon icon={icon} color={color} size={64} />
      </View>
      <Field label={t('common.name')} error={error}>
        <Input value={name} onChangeText={setName} autoFocus={isNew} maxLength={40} />
      </Field>
      {isNew && (
        <Field label={t('categories.kind')}>
          <Segmented<CategoryKind>
            value={kind}
            onChange={(k) => {
              setKind(k);
              setParentId('none');
            }}
            options={[
              { value: 'expense', label: t('tx.expense') },
              { value: 'income', label: t('tx.income') },
            ]}
          />
        </Field>
      )}
      {!hasChildren && (
        <Field label={t('categories.parent')}>
          <Chips
            options={[
              { value: 'none', label: t('categories.noParent') },
              ...parents.map((p) => ({ value: p.id, label: categoryName(p, t) })),
            ]}
            value={parentId}
            onChange={setParentId}
          />
        </Field>
      )}
      <Field label={t('categories.icon')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
          {CATEGORY_ICONS.map((i) => (
            <Pressable
              key={i}
              accessibilityLabel={i}
              onPress={() => setIcon(i)}
              style={{ borderRadius: 24, borderWidth: 2, borderColor: icon === i ? colors.primary : 'transparent' }}>
              <CategoryIcon icon={i} color={color} size={40} />
            </Pressable>
          ))}
        </View>
      </Field>
      <Field label={t('categories.color')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
          {CATEGORY_COLORS.map((c) => (
            <Pressable
              key={c}
              accessibilityLabel={c}
              onPress={() => setColor(c)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: c,
                borderWidth: 3,
                borderColor: color === c ? colors.text : 'transparent',
              }}
            />
          ))}
        </View>
      </Field>
      <Button title={t('common.save')} onPress={save} />
      {!isNew && <Button kind="ghost" icon="trash-outline" title={t('common.delete')} onPress={remove} />}
    </Screen>
  );
}
