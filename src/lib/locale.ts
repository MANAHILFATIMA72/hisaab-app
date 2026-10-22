// First-run defaults from the phone's own region and language, so the app fits anywhere.
import { getLocales } from 'expo-localization';

import type { Lang } from '@/i18n';
import { CURRENCIES } from '@/lib/money';

function firstLocale() {
  try {
    return getLocales()[0];
  } catch {
    return undefined;
  }
}

export function deviceCurrency(): string {
  const code = firstLocale()?.currencyCode;
  return code && (CURRENCIES as readonly string[]).includes(code) ? code : 'USD';
}

export function deviceLang(): Lang {
  return firstLocale()?.languageCode === 'ur' ? 'ur' : 'en';
}
