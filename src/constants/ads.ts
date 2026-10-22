// AdMob ad unit IDs from the AdMob console (Apps → Hisaab → Ad units). Leave a value empty to use
// Google's test ad instead. The AdMob *App ID* goes in app.json under the react-native-google-mobile-ads plugin.
export const AD_UNITS = {
  banner: 'ca-app-pub-3873864995862689/1465258662',
};

// Test builds (the "Test APK" workflow) set EXPO_PUBLIC_TEST_ADS=1 so they never show real ads.
export const USE_TEST_ADS = process.env.EXPO_PUBLIC_TEST_ADS === '1';

// Set to false to build a version without any ads.
export const ADS_ENABLED = true;
