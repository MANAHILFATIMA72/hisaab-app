import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { exportAll, importAll, listAccounts, listCategories, listTransactions } from '@/db/repo';
import type { TFunction } from '@/i18n';
import { toCSV } from '@/lib/csv';
import { today } from '@/lib/dates';
import { toMajor } from '@/lib/money';
import { categoryName } from '@/state/labels';

async function shareText(fileName: string, content: string, mimeType: string) {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
}

export async function shareBackup(db: SQLiteDatabase) {
  const data = await exportAll(db);
  await shareText(`hisaab-backup-${today()}.json`, JSON.stringify(data), 'application/json');
}

/** Lets the user pick a backup file and restores it. Returns false if the user cancelled. */
export async function pickAndRestore(db: SQLiteDatabase): Promise<boolean> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain', '*/*'] });
  if (picked.canceled) return false;
  const text = await picked.result.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('invalid-backup');
  }
  await importAll(db, parsed);
  return true;
}

export async function shareTransactionsCsv(db: SQLiteDatabase, t: TFunction, from?: string, to?: string) {
  const [txs, accounts, categories] = await Promise.all([
    listTransactions(db, { from, to }),
    listAccounts(db, true),
    listCategories(db, true),
  ]);
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const cat = new Map(categories.map((c) => [c.id, c]));
  const rows = txs.map((x) => [
    x.date,
    t(`tx.${x.type}`),
    toMajor(x.amount),
    x.type === 'transfer' ? '' : categoryName(x.category_id ? cat.get(x.category_id) : null, t),
    acc.get(x.account_id) ?? '',
    x.to_account_id ? (acc.get(x.to_account_id) ?? '') : '',
    x.note,
  ]);
  const csv = toCSV(
    [
      t('common.date'),
      t('accounts.type'),
      t('common.amount'),
      t('tx.category'),
      t('tx.account'),
      t('tx.toAccount'),
      t('common.note'),
    ],
    rows,
  );
  await shareText(`hisaab-${from ?? 'all'}-${to ?? today()}.csv`, csv, 'text/csv');
}
