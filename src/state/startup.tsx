import { router, useSegments } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';

import { processRecurring } from '@/db/repo';
import { today } from '@/lib/dates';
import { syncReminders } from '@/services/notifications';
import { LockScreen } from '@/ui/lock-screen';

import { useApp } from './app';

const RELOCK_AFTER_MS = 30_000;

export function StartupGate({ children }: { children: ReactNode }) {
  const { db, settings, changed } = useApp();
  const segments = useSegments();
  const [locked, setLocked] = useState(settings.lockEnabled);
  const backgroundedAt = useRef<number | null>(null);
  const ranStartup = useRef(false);

  useEffect(() => {
    const inOnboarding = segments[0] === 'onboarding';
    if (!settings.onboarded && !inOnboarding) router.replace('/onboarding');
  }, [settings.onboarded, segments]);

  // Generate due recurring transactions and refresh reminders once per launch and when the app returns.
  useEffect(() => {
    if (!settings.onboarded) return;
    const run = async () => {
      const added = await processRecurring(db, today());
      if (added) changed();
      await syncReminders(db, settings);
    };
    if (!ranStartup.current) {
      ranStartup.current = true;
      run();
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active') {
        if (settings.lockEnabled && backgroundedAt.current && Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) {
          setLocked(true);
        }
        backgroundedAt.current = null;
        run();
      }
    });
    return () => sub.remove();
  }, [db, settings, changed]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {locked && settings.lockEnabled && <LockScreen onUnlock={() => setLocked(false)} />}
    </View>
  );
}
