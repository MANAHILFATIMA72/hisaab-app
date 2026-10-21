import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { authenticateBiometric, biometricAvailable, checkPin } from '@/services/lock';
import { useApp } from '@/state/app';

import { Text } from './kit';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'] as const;

export function PinPad({
  title,
  error,
  onComplete,
  onBiometric,
}: {
  title: string;
  error?: string;
  onComplete: (pin: string) => void;
  onBiometric?: () => void;
}) {
  const { colors } = useApp();
  const [pin, setPin] = useState('');

  const press = (k: (typeof KEYS)[number]) => {
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    if (k === 'bio') return onBiometric?.();
    const next = pin + k;
    if (next.length === 4) {
      setPin('');
      onComplete(next);
    } else setPin(next);
  };

  return (
    <View style={{ alignItems: 'center', gap: Spacing.four, direction: 'ltr' }}>
      <Text variant="heading" center>
        {title}
      </Text>
      <View style={{ flexDirection: 'row', gap: Spacing.three }}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { borderColor: colors.primary, backgroundColor: i < pin.length ? colors.primary : 'transparent' },
            ]}
          />
        ))}
      </View>
      <Text color={colors.danger} center>
        {error ?? ' '}
      </Text>
      <View style={styles.pad}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={k}
            onPress={() => press(k)}
            disabled={k === 'bio' && !onBiometric}
            style={({ pressed }) => [styles.key, { backgroundColor: pressed ? colors.primarySoft : 'transparent' }]}>
            {k === 'del' ? (
              <Ionicons name="backspace-outline" size={26} color={colors.text} />
            ) : k === 'bio' ? (
              onBiometric ? (
                <Ionicons name="finger-print" size={28} color={colors.primary} />
              ) : null
            ) : (
              <Text variant="title" center>
                {k}
              </Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { colors, t, settings } = useApp();
  const [error, setError] = useState<string>();
  const [canBio, setCanBio] = useState(false);

  const tryBiometric = useCallback(async () => {
    if (await authenticateBiometric(t('lock.unlock'))) onUnlock();
  }, [onUnlock, t]);

  useEffect(() => {
    if (!settings.biometric) return;
    biometricAvailable().then((ok) => {
      setCanBio(ok);
      if (ok) tryBiometric();
    });
  }, [settings.biometric, tryBiometric]);

  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, justifyContent: 'center', zIndex: 100 }]}>
      <View style={{ alignItems: 'center', marginBottom: Spacing.four }}>
        <Ionicons name="lock-closed" size={36} color={colors.primary} />
        <Text variant="title" center>
          {t('appName')}
        </Text>
      </View>
      <PinPad
        title={t('lock.enterPin')}
        error={error}
        onBiometric={canBio ? tryBiometric : undefined}
        onComplete={async (pin) => {
          if (await checkPin(pin)) onUnlock();
          else setError(t('lock.wrongPin'));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: 270, justifyContent: 'center' },
  key: { width: 80, height: 64, margin: 5, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});
