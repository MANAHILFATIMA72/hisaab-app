// Google AdMob: consent (UMP) first, then the SDK. Banners wait for this before loading.
import mobileAds, {
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  MaxAdContentRating,
  TestIds,
} from 'react-native-google-mobile-ads';

import { AD_UNITS, ADS_ENABLED } from '@/constants/ads';

type AdsState = { ready: boolean; privacyOptions: boolean };

let state: AdsState = { ready: false, privacyOptions: false };
let started: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<AdsState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function subscribeAds(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getAdsState = () => state;

export const bannerUnitId = () => (__DEV__ || !AD_UNITS.banner ? TestIds.ADAPTIVE_BANNER : AD_UNITS.banner);

/** Asks for consent where the law needs it (EEA, UK, some US states), then starts the ads SDK. Safe to call often. */
export function prepareAds() {
  if (!ADS_ENABLED) return Promise.resolve();
  started ??= (async () => {
    try {
      const info = await AdsConsent.gatherConsent();
      set({
        privacyOptions: info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
      });
      if (!info.canRequestAds) return;
      await mobileAds().setRequestConfiguration({
        maxAdContentRating: MaxAdContentRating.PG,
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
      });
      await mobileAds().initialize();
      set({ ready: true });
    } catch {
      // No ads is fine: the app works the same without them.
      started = null;
    }
  })();
  return started;
}

/** Lets people change their ad consent later (only offered where Google says it is required). */
export async function showAdPrivacyOptions() {
  await AdsConsent.showPrivacyOptionsForm();
}
