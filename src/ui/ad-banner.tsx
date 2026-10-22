import { useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

import { bannerUnitId, getAdsState, subscribeAds } from '@/services/ads';
import { useApp } from '@/state/app';

/** A small banner pinned under a screen's content. Hidden until consent is done, and if no ad loads. */
export function AdBanner() {
  const { colors } = useApp();
  const { ready } = useSyncExternalStore(subscribeAds, getAdsState);
  const [failed, setFailed] = useState(false);
  if (!ready || failed) return null;
  return (
    <View style={{ alignItems: 'center', backgroundColor: colors.background }}>
      <BannerAd
        unitId={bannerUnitId()}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}
