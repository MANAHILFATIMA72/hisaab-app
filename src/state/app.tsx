import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { Colors, type Palette } from '@/constants/theme';
import { getSettings, setSetting as writeSetting } from '@/db/repo';
import { formatDate, makeT, type Lang, type TFunction } from '@/i18n';
import { periodContaining, today, type Period } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { deviceCurrency, deviceLang } from '@/lib/locale';
import type { ProfileType } from '@/lib/types';

export type Settings = {
  onboarded: boolean;
  lang: Lang;
  profile: ProfileType;
  currency: string;
  monthStartDay: number;
  theme: 'system' | 'light' | 'dark';
  largeText: boolean;
  hideBalances: boolean;
  lockEnabled: boolean;
  biometric: boolean;
  dailyReminder: string; // 'HH:MM' or '' when off
  budgetAlerts: boolean;
  udhaarReminders: boolean;
  billReminders: boolean;
  monthlySummary: boolean;
  weeklySummary: boolean;
  budgetRollover: boolean;
  catSeed: string; // last CATEGORY_SEED_VERSION applied
  ruleIncome: string; // monthly income for the 50/30/20 check, in minor units, '' when not used
  zakatGoldPrice: string;
  zakatSilverPrice: string;
  launches: number; // app opens after onboarding, for the ad on every few launches
};

const DEFAULTS: Settings = {
  onboarded: false,
  lang: deviceLang(),
  profile: 'employee',
  currency: deviceCurrency(),
  monthStartDay: 1,
  theme: 'system',
  largeText: false,
  hideBalances: false,
  lockEnabled: false,
  biometric: false,
  dailyReminder: '21:00',
  budgetAlerts: true,
  udhaarReminders: true,
  billReminders: true,
  monthlySummary: true,
  weeklySummary: true,
  budgetRollover: false,
  catSeed: '',
  ruleIncome: '',
  zakatGoldPrice: '',
  zakatSilverPrice: '',
  launches: 0,
};

function parse(raw: Record<string, string>): Settings {
  const out: Record<string, unknown> = { ...DEFAULTS };
  for (const [k, def] of Object.entries(DEFAULTS)) {
    const v = raw[k];
    if (v === undefined) continue;
    if (typeof def === 'boolean') out[k] = v === '1';
    else if (typeof def === 'number') out[k] = Number(v) || def;
    else out[k] = v;
  }
  return out as Settings;
}

type AppContextValue = {
  db: SQLiteDatabase;
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  reloadSettings: () => Promise<void>;
  t: TFunction;
  isRTL: boolean;
  colors: Palette;
  isDark: boolean;
  fontScale: number;
  money: (minor: number, opts?: { sign?: boolean; ignoreHidden?: boolean }) => string;
  date: (iso: string) => string;
  period: Period;
  /** Bumped after every write so screens can reload. */
  version: number;
  changed: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [version, setVersion] = useState(0);
  const [todayDate, setTodayDate] = useState(today());
  const scheme = useColorScheme();

  const reloadSettings = useCallback(async () => {
    setSettings(parse(await getSettings(db)));
  }, [db]);

  useEffect(() => {
    let alive = true;
    getSettings(db).then((raw) => {
      if (alive) setSettings(parse(raw));
    });
    return () => {
      alive = false;
    };
  }, [db]);

  const changed = useCallback(() => {
    setVersion((v) => v + 1);
    setTodayDate(today());
  }, []);

  const setSetting = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]) => {
      const raw = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
      await writeSetting(db, key, raw);
      setSettings((s) => (s ? { ...s, [key]: value } : s));
      setVersion((v) => v + 1);
    },
    [db],
  );

  const value = useMemo<AppContextValue | null>(() => {
    if (!settings) return null;
    const isDark = settings.theme === 'system' ? scheme === 'dark' : settings.theme === 'dark';
    const t = makeT(settings.lang);
    return {
      db,
      settings,
      setSetting,
      reloadSettings,
      t,
      isRTL: settings.lang === 'ur',
      colors: isDark ? Colors.dark : Colors.light,
      isDark,
      fontScale: settings.largeText ? 1.2 : 1,
      money: (minor, opts) => {
        const text = formatMoney(minor, settings.currency, {
          hidden: settings.hideBalances && !opts?.ignoreHidden,
          showSign: opts?.sign,
        });
        // In Urdu, keep "-Rs 3,787" together and in order inside right-to-left sentences.
        return settings.lang === 'ur' ? `\u2066${text}\u2069` : text;
      },
      date: (iso) => formatDate(iso, settings.lang),
      period: periodContaining(todayDate, settings.monthStartDay),
      version,
      changed,
    };
  }, [settings, scheme, db, setSetting, reloadSettings, version, changed, todayDate]);

  if (!value) return null;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/** Runs an async loader whenever data changes. */
export function useLoad<T>(loader: (db: SQLiteDatabase) => Promise<T>, deps: unknown[] = []): T | undefined {
  const { db, version } = useApp();
  const [data, setData] = useState<T>();
  useEffect(() => {
    let alive = true;
    loader(db).then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version, ...deps]);
  return data;
}
