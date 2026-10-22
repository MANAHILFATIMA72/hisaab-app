import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { getGroup, saveGroup, type GroupDetail, type MemberInput } from '@/db/groups-repo';
import { newId } from '@/db/repo';
import { useApp, useLoad } from '@/state/app';
import { GROUP_ICONS } from '@/ui/icons';
import { Button, Card, Chips, Field, IconButton, Input, Row, Screen, Text } from '@/ui/kit';

export default function GroupEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useLoad(async (db) => ({ detail: id === 'new' ? null : await getGroup(db, id) }), [id]);
  if (!data) return <Screen>{null}</Screen>;
  return <GroupEditor key={data.detail?.group.id ?? 'new'} detail={data.detail} />;
}

type MemberRow = MemberInput & { key: string };

function GroupEditor({ detail }: { detail: GroupDetail | null }) {
  const { db, t, colors, changed } = useApp();
  const [name, setName] = useState(detail?.group.name ?? '');
  const [icon, setIcon] = useState(detail?.group.icon ?? 'people');
  const [members, setMembers] = useState<MemberRow[]>(
    detail
      ? detail.members.filter((m) => !m.is_me).map((m) => ({ key: m.id, id: m.id, name: m.name, phone: m.phone }))
      : [{ key: 'first', name: '', phone: '' }],
  );
  const [bulk, setBulk] = useState('');
  const [error, setError] = useState<string>();

  const update = (key: string, patch: Partial<MemberRow>) =>
    setMembers(members.map((m) => (m.key === key ? { ...m, ...patch } : m)));

  const addBulk = () => {
    const names = bulk
      .split(/[,\n،]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!names.length) return;
    const kept = members.filter((m) => m.name.trim() || m.id);
    setMembers([...kept, ...names.map((n) => ({ key: newId(), name: n, phone: '' }))]);
    setBulk('');
  };

  const save = async () => {
    if (!name.trim()) return setError(t('common.required'));
    const list = members.filter((m) => m.name.trim());
    if (!list.length) return setError(t('groups.needMember'));
    const groupId = detail?.group.id ?? newId();
    const { blocked } = await saveGroup(db, { id: groupId, name, icon }, list, t('groups.you'));
    changed();
    if (blocked.length) Alert.alert(t('groups.title'), t('groups.blocked', { names: blocked.join(', ') }));
    if (detail) router.back();
    else router.replace(`/groups/${groupId}`);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: detail ? t('groups.edit') : t('groups.add') }} />
      <Field label={t('groups.name')} error={error}>
        <Input
          value={name}
          onChangeText={(v) => {
            setName(v);
            setError(undefined);
          }}
          placeholder={t('groups.namePlaceholder')}
          autoFocus={!detail}
        />
      </Field>
      <Field label={t('groups.type')}>
        <Chips
          options={GROUP_ICONS.map((g) => ({ value: g.icon, label: t(g.label), icon: g.icon }))}
          value={icon}
          onChange={setIcon}
        />
      </Field>

      <Text variant="heading">{t('groups.members')}</Text>
      <Text variant="caption" muted>
        {t('groups.membersHint')}
      </Text>
      <Card>
        <Text variant="label">{t('groups.you')}</Text>
        {members.map((m, i) => (
          <View key={m.key} style={{ gap: Spacing.one }}>
            <Row>
              <View style={{ flex: 1 }}>
                <Input
                  value={m.name}
                  onChangeText={(v) => update(m.key, { name: v })}
                  placeholder={`${t('groups.memberName')} ${i + 1}`}
                />
              </View>
              <IconButton
                icon="close"
                label={t('common.remove')}
                color={colors.textSecondary}
                onPress={() => setMembers(members.filter((x) => x.key !== m.key))}
              />
            </Row>
            <Input
              value={m.phone}
              onChangeText={(v) => update(m.key, { phone: v })}
              placeholder={t('groups.memberPhone')}
              keyboardType="phone-pad"
              style={{ paddingVertical: 8, fontSize: 14 }}
            />
          </View>
        ))}
        <Button
          kind="ghost"
          icon="person-add-outline"
          title={t('groups.addMember')}
          onPress={() => setMembers([...members, { key: newId(), name: '', phone: '' }])}
        />
      </Card>

      <Field label={t('groups.quickAdd')}>
        <Row>
          <View style={{ flex: 1 }}>
            <Input value={bulk} onChangeText={setBulk} placeholder="Ali, Sara, Hamza" onSubmitEditing={addBulk} />
          </View>
          <Button kind="secondary" title={t('common.add')} onPress={addBulk} />
        </Row>
      </Field>

      <Button title={t('common.save')} onPress={save} />
    </Screen>
  );
}
