import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';

import { useApp } from '@/state/app';
import type { IconName } from '@/ui/kit';

const TABS: { name: string; key: 'home' | 'transactions' | 'budgets' | 'udhaar' | 'more'; icon: IconName }[] = [
  { name: 'index', key: 'home', icon: 'home' },
  { name: 'history', key: 'transactions', icon: 'list' },
  { name: 'budget', key: 'budgets', icon: 'pie-chart' },
  { name: 'udhaar', key: 'udhaar', icon: 'people' },
  { name: 'more', key: 'more', icon: 'grid' },
];

// Keep Home as the first screen even when the tab order is reversed for Urdu.
export const unstable_settings = { initialRouteName: 'index' };

export default function TabsLayout() {
  const { t, colors, isRTL } = useApp();
  // Reverse tab order in Urdu so the first tab sits on the right, as RTL readers expect.
  const tabs = isRTL ? [...TABS].reverse() : TABS;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: isRTL ? 72 : undefined },
        // Urdu glyphs need more vertical room than the default label height.
        tabBarLabelStyle: isRTL ? { fontSize: 11, lineHeight: 22, paddingBottom: 4 } : undefined,
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleAlign: isRTL ? 'center' : 'left',
      }}>
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.name === 'index' ? t('appName') : t(`tabs.${tab.key}`),
            tabBarLabel: t(`tabs.${tab.key}`),
            tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} color={color as string} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
