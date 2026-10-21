import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { listBills, listUdhaar } from '@/db/repo';
import { makeT } from '@/i18n';
import { addDays, fromISODate, today } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { withBalances } from '@/lib/udhaar';
import type { Settings } from '@/state/app';

const CHANNEL = 'reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Reminders',
      importance: AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Shows a notification right away (used for budget alerts). */
export async function notifyNow(title: string, body: string) {
  if (Platform.OS === 'web') return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  });
}

/**
 * Rebuilds every scheduled reminder from current data. Cheap and idempotent, so it is
 * simply called after anything that could change reminders.
 */
export async function syncReminders(db: SQLiteDatabase, s: Settings) {
  if (Platform.OS === 'web') return;
  const perm = await Notifications.getPermissionsAsync();
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!perm.granted) return;

  const t = makeT(s.lang);
  const money = (m: number) => formatMoney(m, s.currency);
  const T = Notifications.SchedulableTriggerInputTypes;

  if (s.dailyReminder) {
    const [hour, minute] = s.dailyReminder.split(':').map(Number);
    await Notifications.scheduleNotificationAsync({
      content: { title: t('notif.dailyTitle'), body: t('notif.dailyBody') },
      trigger: { type: T.DAILY, hour, minute, channelId: CHANNEL },
    });
  }

  if (s.monthlySummary) {
    await Notifications.scheduleNotificationAsync({
      content: { title: t('notif.monthlyTitle'), body: t('notif.monthlyBody') },
      trigger: { type: T.MONTHLY, day: Math.min(s.monthStartDay, 28), hour: 10, minute: 0, channelId: CHANNEL },
    });
  }

  if (s.billReminders) {
    for (const b of await listBills(db)) {
      if (!b.active) continue;
      // Remind one day before; for due day 1 that is the last days of the previous month, so use day 28.
      const day = b.due_day > 1 ? Math.min(b.due_day - 1, 28) : 28;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('bills.reminderTitle'),
          body: t('bills.reminderBody', { name: b.name, amount: b.amount ? ` (${money(b.amount)})` : '' }),
        },
        trigger: { type: T.MONTHLY, day, hour: 10, minute: 0, channelId: CHANNEL },
      });
    }
  }

  if (s.udhaarReminders) {
    const { items, payments } = await listUdhaar(db);
    const now = today();
    // Android limits how many alarms an app can hold, so only schedule the next 60 days.
    const horizon = addDays(now, 60);
    for (const u of withBalances(items, payments)) {
      if (u.settled || !u.due_date || u.due_date < now || u.due_date > horizon) continue;
      const when = fromISODate(u.due_date);
      when.setHours(10, 0, 0, 0);
      if (when.getTime() <= Date.now()) continue;
      const vars = { person: u.person, amount: money(u.remaining) };
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('udhaar.dueTitle'),
          body: u.direction === 'given' ? t('udhaar.dueBodyGiven', vars) : t('udhaar.dueBodyTaken', vars),
        },
        trigger: { type: T.DATE, date: when, channelId: CHANNEL },
      });
    }
  }
}
