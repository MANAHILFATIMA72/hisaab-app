import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { seedForProfile } from '@/db/repo';
import { makeT, type Lang } from '@/i18n';
import type { ProfileType } from '@/lib/types';
import { ensurePermission, syncReminders } from '@/services/notifications';
import { useApp } from '@/state/app';
import { Button, Card, Chips, Field, Row, Screen, Text, type IconName } from '@/ui/kit';

const PROFILES: { value: ProfileType; icon: IconName }[] = [
  { value: 'student', icon: 'school' },
  { value: 'employee', icon: 'briefcase' },
  { value: 'household', icon: 'home' },
  { value: 'freelancer', icon: 'laptop' },
  { value: 'business', icon: 'storefront' },
];

const START_DAYS = [1, 5, 10, 15, 20, 25, 28];
// A short list keeps the Start button on screen; every currency is in Settings.
const POPULAR = ['USD', 'EUR', 'GBP', 'INR', 'PKR', 'AED', 'SAR'];

export default function Onboarding() {
  const { db, t, colors, settings, setSetting, changed } = useApp();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [currency, setCurrency] = useState(settings.currency);
  const [startDay, setStartDay] = useState(1);
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    if (!profile) return;
    setBusy(true);
    const tl = makeT(settings.lang);
    await seedForProfile(db, profile, (key) => tl(key as 'acc_cash'));
    await setSetting('profile', profile);
    await setSetting('currency', currency);
    await setSetting('monthStartDay', startDay);
    await setSetting('onboarded', true);
    const granted = await ensurePermission();
    if (granted) await syncReminders(db, { ...settings, profile, currency, monthStartDay: startDay, onboarded: true });
    changed();
    router.replace('/');
  };

  return (
    <Screen style={{ paddingTop: Spacing.six }}>
      {step === 0 && (
        <View style={{ gap: Spacing.three }}>
          <View style={{ alignItems: 'center', gap: Spacing.two }}>
            <View style={{ backgroundColor: colors.primarySoft, borderRadius: 40, padding: Spacing.three }}>
              <Ionicons name="wallet" size={48} color={colors.primary} />
            </View>
            <Text variant="title" center>
              {t('onboarding.welcome')}
            </Text>
            <Text muted center>
              {t('onboarding.welcomeBody')}
            </Text>
          </View>
          <Field label={t('onboarding.chooseLanguage')}>
            <Chips<Lang>
              options={[
                { value: 'en', label: 'English' },
                { value: 'ur', label: 'اردو' },
              ]}
              value={settings.lang}
              onChange={(v) => setSetting('lang', v)}
            />
          </Field>
          <Button title={t('common.next')} onPress={() => setStep(1)} />
        </View>
      )}

      {step === 1 && (
        <View style={{ gap: Spacing.three }}>
          <Text variant="title">{t('onboarding.whoAreYou')}</Text>
          <Text muted>{t('onboarding.whoAreYouHint')}</Text>
          {PROFILES.map((p) => (
            <Card
              key={p.value}
              onPress={() => setProfile(p.value)}
              style={profile === p.value ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
              <Row gap={Spacing.three}>
                <Ionicons name={p.icon} size={24} color={colors.primary} />
                <Text variant="label" style={{ flex: 1 }}>
                  {t(`profile.${p.value}`)}
                </Text>
                {profile === p.value && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
              </Row>
            </Card>
          ))}
          <Row>
            <Button kind="ghost" title={t('common.back')} onPress={() => setStep(0)} style={{ flex: 1 }} />
            <Button title={t('common.next')} onPress={() => setStep(2)} disabled={!profile} style={{ flex: 2 }} />
          </Row>
        </View>
      )}

      {step === 2 && (
        <View style={{ gap: Spacing.three }}>
          <Text variant="title">{t('onboarding.currencyTitle')}</Text>
          <Field label={t('onboarding.currency')} hint={t('onboarding.currencyHint')}>
            <Chips
              options={[...new Set([settings.currency, ...POPULAR])].map((c) => ({ value: c, label: c }))}
              value={currency}
              onChange={setCurrency}
            />
          </Field>
          <Field label={t('onboarding.monthStart')} hint={t('onboarding.monthStartHint')}>
            <Chips
              options={START_DAYS.map((d) => ({ value: String(d), label: String(d) }))}
              value={String(startDay)}
              onChange={(v) => setStartDay(Number(v))}
            />
          </Field>
          <Row>
            <Button kind="ghost" title={t('common.back')} onPress={() => setStep(1)} style={{ flex: 1 }} />
            <Button title={t('onboarding.start')} onPress={finish} disabled={busy} style={{ flex: 2 }} />
          </Row>
        </View>
      )}
    </Screen>
  );
}
