import { useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

import { Spacing } from '@/constants/theme';
import { bannerUnitId, getAdsState, subscribeAds } from '@/services/ads';
import { useApp } from '@/state/app';
import { Text } from '@/ui/kit';

/**
 * A small banner pinned under a screen's content. Hidden until consent is done, and if no ad loads.
 * `collapsible` asks Google for a collapsible banner: it opens larger once, then folds down to a normal banner.
 */
export function AdBanner({ collapsible }: { collapsible?: boolean }) {
  const { colors } = useApp();
  const { ready } = useSyncExternalStore(subscribeAds, getAdsState);
  const [failed, setFailed] = useState(false);
  if (!ready || failed) return null;
  return (
    <View style={{ alignItems: 'center', backgroundColor: colors.background }}>
      <BannerAd
        unitId={bannerUnitId()}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={collapsible ? { networkExtras: { collapsible: 'bottom' } } : undefined}
        onAdFailedToLoad={(e) => {
          console.log('[ads] banner failed', String(e));
          setFailed(true);
        }}
      />
    </View>
  );
}

/** A larger ad at the end of a page's content, after everything the user came for. */
export function PageEndAd() {
  const { t } = useApp();
  const { ready } = useSyncExternalStore(subscribeAds, getAdsState);
  const [failed, setFailed] = useState(false);
  if (!ready || failed) return null;
  return (
    <View style={{ alignItems: 'center', marginTop: Spacing.four, gap: Spacing.one }}>
      <Text variant="caption" muted>
        {t('common.ad')}
      </Text>
      <BannerAd
        unitId={bannerUnitId()}
        size={BannerAdSize.MEDIUM_RECTANGLE}
        onAdFailedToLoad={(e) => {
          console.log('[ads] banner failed', String(e));
          setFailed(true);
        }}
      />
    </View>
  );
}
