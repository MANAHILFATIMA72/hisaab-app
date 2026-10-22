// Google AdMob: consent (UMP) first, then the SDK. Banners wait for this before loading.
import { AppState } from 'react-native';
import mobileAds, {
  AdEventType,
  AppOpenAd,
  AdsConsent,
  InterstitialAd,
  AdsConsentPrivacyOptionsRequirementStatus,
  AdsConsentStatus,
  MaxAdContentRating,
  TestIds,
} from 'react-native-google-mobile-ads';

import { AD_UNITS, ADS_ENABLED, USE_TEST_ADS } from '@/constants/ads';

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

const testing = __DEV__ || USE_TEST_ADS;
export const bannerUnitId = () => (testing || !AD_UNITS.banner ? TestIds.ADAPTIVE_BANNER : AD_UNITS.banner);
const interstitialUnitId = () => (testing || !AD_UNITS.interstitial ? TestIds.INTERSTITIAL : AD_UNITS.interstitial);

/** Asks for consent where the law needs it (EEA, UK, some US states), then starts the ads SDK. Safe to call often. */
export function prepareAds() {
  if (!ADS_ENABLED) return Promise.resolve();
  started ??= (async () => {
    // Consent first. If the consent service fails (no internet, AdMob privacy message not set up),
    // fall back to what it last knew; outside Europe that normally still allows ads.
    let canRequestAds = true;
    try {
      const info = await AdsConsent.gatherConsent();
      canRequestAds = info.canRequestAds;
      set({
        privacyOptions: info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
      });
      console.log('[ads] consent', info.status, 'canRequestAds', info.canRequestAds);
    } catch (e) {
      console.log('[ads] consent failed', String(e));
      const info = await AdsConsent.getConsentInfo().catch(() => null);
      if (info && info.status === AdsConsentStatus.REQUIRED) canRequestAds = false;
    }
    if (!canRequestAds) return;
    try {
      await mobileAds().setRequestConfiguration({
        maxAdContentRating: MaxAdContentRating.PG,
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
      });
      await mobileAds().initialize();
      console.log('[ads] ready, test ads:', testing);
      set({ ready: true });
      loadInterstitial();
      startAppOpenAds();
    } catch (e) {
      // No ads is fine: the app works the same without them. Try again next time.
      console.log('[ads] start failed', String(e));
      started = null;
    }
  })();
  return started;
}

/** Lets people change their ad consent later (only offered where Google says it is required). */
export async function showAdPrivacyOptions() {
  await AdsConsent.showPrivacyOptionsForm();
}

// ---------- Interstitial (full screen, shown before a PDF report or statement) ----------

const INTERSTITIAL_GAP_MS = 2 * 60 * 1000; // at most one every 2 minutes
let interstitial: InterstitialAd | null = null;
let interstitialLoaded = false;
let lastInterstitial = 0; // also set by the app open ad, so two full-screen ads never come close together

function loadInterstitial() {
  if (!state.ready || interstitial) return;
  const ad = InterstitialAd.createForAdRequest(interstitialUnitId());
  interstitial = ad;
  interstitialLoaded = false;
  ad.addAdEventListener(AdEventType.LOADED, () => {
    interstitialLoaded = true;
  });
  ad.addAdEventListener(AdEventType.ERROR, () => {
    if (interstitial === ad && !interstitialLoaded) interstitial = null;
  });
  ad.load();
}

/** Shows a loaded interstitial and resolves when it is closed. Resolves at once when none is ready. */
export function showInterstitial(): Promise<void> {
  const ad = interstitial;
  if (!ad || !interstitialLoaded || Date.now() - lastInterstitial < INTERSTITIAL_GAP_MS) {
    loadInterstitial();
    return Promise.resolve();
  }
  interstitial = null;
  interstitialLoaded = false;
  lastInterstitial = Date.now();
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      offClosed();
      offError();
      loadInterstitial();
      resolve();
    };
    const offClosed = ad.addAdEventListener(AdEventType.CLOSED, finish);
    const offError = ad.addAdEventListener(AdEventType.ERROR, finish);
    ad.show().catch(finish);
  });
}

// ---------- App open ad (full screen, when someone returns to the app) ----------

const APP_OPEN_AWAY_MS = 30 * 1000; // ignore quick trips to the share sheet, camera or SMS app
const APP_OPEN_MAX_AGE_MS = 4 * 60 * 60 * 1000; // Google expires app open ads after 4 hours
let appOpen: AppOpenAd | null = null;
let appOpenLoadedAt = 0;
let wentAway = 0;
let appOpenStarted = false;

const appOpenUnitId = () => (testing ? TestIds.APP_OPEN : AD_UNITS.appOpen);

function loadAppOpen() {
  if (!appOpenUnitId() || appOpen) return;
  const ad = AppOpenAd.createForAdRequest(appOpenUnitId());
  appOpen = ad;
  appOpenLoadedAt = 0;
  ad.addAdEventListener(AdEventType.LOADED, () => {
    appOpenLoadedAt = Date.now();
  });
  ad.addAdEventListener(AdEventType.ERROR, (e) => {
    console.log('[ads] app open failed', String(e));
    if (appOpen === ad) appOpen = null;
  });
  ad.addAdEventListener(AdEventType.CLOSED, () => {
    if (appOpen === ad) appOpen = null;
    loadAppOpen();
  });
  ad.load();
}

function startAppOpenAds() {
  if (appOpenStarted || !appOpenUnitId()) return;
  appOpenStarted = true;
  loadAppOpen();
  AppState.addEventListener('change', (next) => {
    if (next === 'background') {
      wentAway = Date.now();
      return;
    }
    if (next !== 'active' || !wentAway) return;
    const away = Date.now() - wentAway;
    wentAway = 0;
    const ad = appOpen;
    if (!ad || !appOpenLoadedAt) return loadAppOpen();
    if (Date.now() - appOpenLoadedAt > APP_OPEN_MAX_AGE_MS) {
      appOpen = null;
      return loadAppOpen();
    }
    if (away < APP_OPEN_AWAY_MS || Date.now() - lastInterstitial < INTERSTITIAL_GAP_MS) return;
    lastInterstitial = Date.now();
    ad.show().catch(() => {
      if (appOpen === ad) appOpen = null;
      loadAppOpen();
    });
  });
}
