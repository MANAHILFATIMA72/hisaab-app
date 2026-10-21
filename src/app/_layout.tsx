import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { applyEncryptionKey } from '@/db/key';
import { migrate } from '@/db/schema';
import { AppProvider, useApp } from '@/state/app';
import { StartupGate } from '@/state/startup';

SplashScreen.preventAutoHideAsync();

async function initDb(db: SQLiteDatabase) {
  await applyEncryptionKey(db);
  await migrate(db);
}

function Navigator() {
  const { colors, isDark, t } = useApp();
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  const base = isDark ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.card,
          text: colors.text,
          border: colors.border,
        },
      }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <StartupGate>
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerTintColor: colors.text,
            headerStyle: { backgroundColor: colors.background },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="tx/[id]" options={{ presentation: 'modal', title: t('tx.add') }} />
        </Stack>
      </StartupGate>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="hisaab.db" onInit={initDb}>
      <AppProvider>
        <Navigator />
      </AppProvider>
    </SQLiteProvider>
  );
}
