// The web build has no ads.
type AdsState = { ready: boolean; privacyOptions: boolean };

const state: AdsState = { ready: false, privacyOptions: false };

export const subscribeAds = (_listener: () => void) => () => {};
export const getAdsState = () => state;
export const bannerUnitId = () => '';
export const prepareAds = () => Promise.resolve();
export const showAdPrivacyOptions = async () => {};
export const showInterstitial = () => Promise.resolve();
