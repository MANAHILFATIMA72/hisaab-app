import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Linking, Modal, Platform, View } from 'react-native';

import { PRIVACY_URL, SUPPORT_EMAIL } from '@/constants/app';
import { Spacing } from '@/constants/theme';
import { seedForProfile, wipeAll } from '@/db/repo';
import { makeT, type Lang } from '@/i18n';
import { CURRENCIES } from '@/lib/money';
import type { ProfileType } from '@/lib/types';
import { getAdsState, showAdPrivacyOptions, showInterstitial, subscribeAds } from '@/services/ads';
import { pickAndRestore, shareBackup, shareTransactionsCsv } from '@/services/data';
import { biometricAvailable, clearPin, setPin } from '@/services/lock';
import { ensurePermission, syncReminders } from '@/services/notifications';
import { useApp, type Settings } from '@/state/app';
import { Button, Card, Chips, Divider, Field, ListRow, Screen, SectionTitle, Text, ToggleRow } from '@/ui/kit';
import { PinPad } from '@/ui/lock-screen';

const PROFILES: ProfileType[] = ['student', 'employee', 'household', 'freelancer', 'business'];
const START_DAYS = Array.from({ length: 28 }, (_, i) => String(i + 1));
const REMINDER_TIMES = ['off', '09:00', '13:00', '20:00', '21:00', '22:00'];

export default function SettingsScreen() {
  const { db, t, colors, settings, setSetting, reloadSettings, changed } = useApp();
  const ads = useSyncExternalStore(subscribeAds, getAdsState);
  const [pinStep, setPinStep] = useState<'set' | 'confirm' | null>(null);
  const [firstPin, setFirstPin] = useState('');
  const [pinError, setPinError] = useState<string>();
  const [canBio, setCanBio] = useState(false);
  const [notifDenied, setNotifDenied] = useState(false);

  useEffect(() => {
    biometricAvailable().then(setCanBio);
    if (Platform.OS !== 'web')
      Notifications.getPermissionsAsync().then((p) => setNotifDenied(!p.granted && !p.canAskAgain));
  }, []);

  /** Saves a setting that affects reminders and reschedules them. */
  const setReminderSetting = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    await setSetting(key, value);
    const turnedOn = value === true || (typeof value === 'string' && value !== '');
    const granted = turnedOn ? await ensurePermission() : true;
    if (!granted) setNotifDenied(true);
    await syncReminders(db, { ...settings, [key]: value });
  };

  const confirm = (title: string, message: string, onYes: () => void, destructive = false) =>
    Alert.alert(title, message, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: destructive ? t('common.delete') : t('common.ok'),
        style: destructive ? 'destructive' : 'default',
        onPress: onYes,
      },
    ]);

  const restore = () =>
    confirm(t('settings.restore'), t('settings.restoreConfirm'), async () => {
      try {
        if (await pickAndRestore(db)) {
          // The PIN lives in secure storage, not in the backup, so start unlocked after a restore.
          await setSetting('lockEnabled', false);
          await setSetting('biometric', false);
          await reloadSettings();
          changed();
          Alert.alert(t('settings.restored'));
        }
      } catch {
        Alert.alert(t('settings.restoreFailed'));
      }
    });

  const deleteAll = () =>
    confirm(
      t('settings.deleteAll'),
      t('settings.deleteAllConfirm'),
      async () => {
        await wipeAll(db);
        await clearPin();
        if (Platform.OS !== 'web') await Notifications.cancelAllScheduledNotificationsAsync();
        await reloadSettings();
        changed();
        router.replace('/onboarding');
      },
      true,
    );

  const changeProfile = async (p: ProfileType) => {
    await setSetting('profile', p);
    // Adds the categories that fit the new profile; existing ones and their history stay.
    const tl = makeT(settings.lang);
    await seedForProfile(db, p, (key) => tl(key as 'acc_cash'));
    changed();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('settings.title') }} />

      <SectionTitle>{t('settings.general')}</SectionTitle>
      <Card>
        <Field label={t('settings.language')}>
          <Chips<Lang>
            options={[
              { value: 'en', label: 'English' },
              { value: 'ur', label: 'اردو' },
            ]}
            value={settings.lang}
            onChange={async (v) => {
              await setSetting('lang', v);
              await syncReminders(db, { ...settings, lang: v });
            }}
          />
        </Field>
        <Field label={t('settings.currency')}>
          <Chips
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            value={settings.currency}
            onChange={(v) => setSetting('currency', v)}
          />
        </Field>
        <Field label={t('settings.monthStart')} hint={t('onboarding.monthStartHint')}>
          <Chips
            wrap={false}
            options={START_DAYS.map((d) => ({ value: d, label: d }))}
            value={String(settings.monthStartDay)}
            onChange={(v) => setReminderSetting('monthStartDay', Number(v))}
          />
        </Field>
        <Field label={t('settings.profile')}>
          <Chips
            options={PROFILES.map((p) => ({ value: p, label: t(`profile.${p}`) }))}
            value={settings.profile}
            onChange={changeProfile}
          />
        </Field>
      </Card>

      <SectionTitle>{t('settings.appearance')}</SectionTitle>
      <Card>
        <Field label={t('settings.theme')}>
          <Chips<Settings['theme']>
            options={[
              { value: 'system', label: t('settings.themeSystem') },
              { value: 'light', label: t('settings.themeLight') },
              { value: 'dark', label: t('settings.themeDark') },
            ]}
            value={settings.theme}
            onChange={(v) => setSetting('theme', v)}
          />
        </Field>
        <ToggleRow
          title={t('settings.largeText')}
          value={settings.largeText}
          onChange={(v) => setSetting('largeText', v)}
        />
        <Divider />
        <ToggleRow
          title={t('settings.hideBalances')}
          value={settings.hideBalances}
          onChange={(v) => setSetting('hideBalances', v)}
        />
      </Card>

      <SectionTitle>{t('settings.security')}</SectionTitle>
      <Card>
        <ToggleRow
          title={t('settings.appLock')}
          value={settings.lockEnabled}
          onChange={async (v) => {
            if (v) {
              setPinError(undefined);
              setPinStep('set');
            } else {
              await clearPin();
              await setSetting('lockEnabled', false);
              await setSetting('biometric', false);
            }
          }}
        />
        {settings.lockEnabled && (
          <>
            <Divider />
            {canBio && (
              <ToggleRow
                title={t('settings.biometric')}
                value={settings.biometric}
                onChange={(v) => setSetting('biometric', v)}
              />
            )}
            <ListRow title={t('settings.changePin')} icon="keypad" chevron onPress={() => setPinStep('set')} />
          </>
        )}
      </Card>

      <SectionTitle>{t('settings.notifications')}</SectionTitle>
      <Card>
        {notifDenied && <Text color={colors.danger}>{t('settings.notifDenied')}</Text>}
        <Field label={t('settings.dailyReminder')}>
          <Chips
            options={REMINDER_TIMES.map((v) => ({ value: v, label: v === 'off' ? t('common.none') : v }))}
            value={settings.dailyReminder || 'off'}
            onChange={(v) => setReminderSetting('dailyReminder', v === 'off' ? '' : v)}
          />
        </Field>
        <ToggleRow
          title={t('settings.budgetAlerts')}
          value={settings.budgetAlerts}
          onChange={(v) => setReminderSetting('budgetAlerts', v)}
        />
        <Divider />
        <ToggleRow
          title={t('settings.udhaarReminders')}
          value={settings.udhaarReminders}
          onChange={(v) => setReminderSetting('udhaarReminders', v)}
        />
        <Divider />
        <ToggleRow
          title={t('settings.billReminders')}
          value={settings.billReminders}
          onChange={(v) => setReminderSetting('billReminders', v)}
        />
        <Divider />
        <ToggleRow
          title={t('settings.monthlySummary')}
          value={settings.monthlySummary}
          onChange={(v) => setReminderSetting('monthlySummary', v)}
        />
        <Divider />
        <ToggleRow
          title={t('settings.weeklySummary')}
          value={settings.weeklySummary}
          onChange={(v) => setReminderSetting('weeklySummary', v)}
        />
      </Card>

      <SectionTitle>{t('settings.data')}</SectionTitle>
      <Card>
        <Text variant="caption" muted>
          {t('settings.privacyNote')}
        </Text>
        <ListRow
          title={t('statement.title')}
          subtitle={t('statement.settingsHint')}
          icon="document-text"
          chevron
          onPress={() => router.push('/statement')}
        />
        <Divider />
        <ListRow
          title={t('settings.backup')}
          subtitle={t('settings.backupHint')}
          icon="cloud-upload-outline"
          onPress={() => shareBackup(db)}
        />
        <Divider />
        <ListRow title={t('settings.restore')} icon="cloud-download-outline" onPress={restore} />
        <Divider />
        <ListRow
          title={t('settings.exportCsv')}
          icon="grid-outline"
          onPress={async () => {
            await showInterstitial();
            await shareTransactionsCsv(db, t);
          }}
        />
        <Divider />
        <ListRow title={t('settings.deleteAll')} icon="trash-outline" onPress={deleteAll} />
      </Card>

      <SectionTitle>{t('settings.support')}</SectionTitle>
      <Card>
        {SUPPORT_EMAIL ? (
          <>
            <ListRow
              title={t('settings.feedback')}
              icon="chatbubble-ellipses-outline"
              onPress={() =>
                Linking.openURL(
                  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Hisaab feedback (v${Constants.expoConfig?.version ?? ''})`)}`,
                )
              }
            />
            <Divider />
          </>
        ) : null}
        {ads.privacyOptions ? (
          <>
            <ListRow title={t('settings.adPrivacy')} icon="megaphone-outline" onPress={() => showAdPrivacyOptions()} />
            <Divider />
          </>
        ) : null}
        <ListRow
          title={t('settings.privacy')}
          icon="shield-checkmark-outline"
          onPress={() =>
            PRIVACY_URL ? Linking.openURL(PRIVACY_URL) : Alert.alert(t('settings.privacy'), t('settings.privacyNote'))
          }
        />
        <Text variant="caption" muted center>
          {t('settings.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
        </Text>
      </Card>

      <Modal visible={pinStep !== null} animationType="slide" onRequestClose={() => setPinStep(null)}>
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background, gap: Spacing.four }}>
          <PinPad
            key={pinStep ?? 'none'}
            title={pinStep === 'confirm' ? t('lock.confirmPin') : t('lock.setPin')}
            error={pinError}
            onComplete={async (pin) => {
              if (pinStep === 'set') {
                setFirstPin(pin);
                setPinError(undefined);
                setPinStep('confirm');
                return;
              }
              if (pin !== firstPin) {
                setPinError(t('lock.mismatch'));
                setPinStep('set');
                return;
              }
              await setPin(pin);
              await setSetting('lockEnabled', true);
              setPinStep(null);
            }}
          />
          <Button kind="ghost" title={t('common.cancel')} onPress={() => setPinStep(null)} />
        </View>
      </Modal>
    </Screen>
  );
}
