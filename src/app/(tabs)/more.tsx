import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import type { TKey } from '@/i18n';
import { useApp } from '@/state/app';
import { Card, Divider, ListRow, Screen, type IconName } from '@/ui/kit';
import { AdBanner } from '@/ui/ad-banner';

const ITEMS: { href: Href; label: TKey; icon: IconName }[] = [
  { href: '/goals', label: 'more.goals', icon: 'flag' },
  { href: '/reports', label: 'more.reports', icon: 'bar-chart' },
  { href: '/statement', label: 'statement.title', icon: 'document-text' },
  { href: '/zakat', label: 'more.zakat', icon: 'moon' },
  { href: '/accounts', label: 'more.accounts', icon: 'wallet' },
  { href: '/categories', label: 'more.categories', icon: 'pricetags' },
  { href: '/recurring', label: 'more.recurring', icon: 'repeat' },
  { href: '/bills', label: 'more.bills', icon: 'notifications' },
  { href: '/settings', label: 'more.settings', icon: 'settings' },
];

export default function More() {
  const { t } = useApp();
  return (
    <Screen footer={<AdBanner />}>
      <Card>
        {ITEMS.map((item, i) => (
          <View key={item.label}>
            {i > 0 && <Divider />}
            <ListRow icon={item.icon} title={t(item.label)} chevron onPress={() => router.push(item.href)} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
