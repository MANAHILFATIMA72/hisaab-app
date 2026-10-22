import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
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
    x.time ?? '',
    t(`tx.${x.type}`),
    toMajor(x.amount),
    x.type === 'transfer' ? '' : categoryName(x.category_id ? cat.get(x.category_id) : null, t),
    acc.get(x.account_id) ?? '',
    x.to_account_id ? (acc.get(x.to_account_id) ?? '') : '',
    x.note,
    x.tags,
  ]);
  const csv = toCSV(
    [
      t('common.date'),
      t('common.time'),
      t('accounts.type'),
      t('common.amount'),
      t('tx.category'),
      t('tx.account'),
      t('tx.toAccount'),
      t('common.note'),
      t('tx.tags'),
    ],
    rows,
  );
  await shareText(`hisaab-${from ?? 'all'}-${to ?? today()}.csv`, csv, 'text/csv');
}

const esc = (v: string) =>
  v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** Builds a printable monthly report and opens the share sheet with the PDF (FR-63). */
export async function sharePdfReport(
  db: SQLiteDatabase,
  opts: { t: TFunction; money: (minor: number) => string; date: (iso: string) => string; rtl: boolean },
  from: string,
  to: string,
) {
  const { t, money, date, rtl } = opts;
  const [txs, accounts, categories] = await Promise.all([
    listTransactions(db, { from, to }),
    listAccounts(db, true),
    listCategories(db, true),
  ]);
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const cat = new Map(categories.map((c) => [c.id, c]));
  let income = 0;
  let expense = 0;
  const byCat = new Map<string, number>();
  for (const x of txs) {
    if (x.type === 'income') income += x.amount;
    if (x.type === 'expense') {
      expense += x.amount;
      const c = x.category_id ? cat.get(x.category_id) : undefined;
      const parent = c?.parent_id ? cat.get(c.parent_id) : c;
      const name = categoryName(parent, t);
      byCat.set(name, (byCat.get(name) ?? 0) + x.amount);
    }
  }
  const catRows = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(
      ([name, v]) =>
        `<tr><td>${esc(name)}</td><td class="n">${esc(money(v))}</td><td class="n">${expense ? Math.round((v / expense) * 100) : 0}%</td></tr>`,
    )
    .join('');
  const txRows = txs
    .map((x) => {
      const what =
        x.type === 'transfer'
          ? t('tx.transferTo', { name: acc.get(x.to_account_id ?? '') ?? '' })
          : categoryName(x.category_id ? cat.get(x.category_id) : null, t);
      const sign = x.type === 'expense' ? '-' : x.type === 'income' ? '+' : '';
      return `<tr><td>${esc(date(x.date))}${x.time ? ' ' + x.time : ''}</td><td>${esc(what)}</td><td>${esc(acc.get(x.account_id) ?? '')}</td><td>${esc(x.note)}${x.tags ? ' <span class="tag">#' + esc(x.tags.split(',').join(' #')) + '</span>' : ''}</td><td class="n ${x.type}">${sign}${esc(money(x.amount))}</td></tr>`;
    })
    .join('');
  const html = `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
    body{font-family:sans-serif;color:#1a1a1a;padding:24px;font-size:12px}
    h1{color:#0E7C5A;margin:0 0 4px} .muted{color:#666}
    .cards{display:flex;gap:12px;margin:16px 0} .card{flex:1;border:1px solid #ddd;border-radius:8px;padding:10px}
    .card b{display:block;font-size:16px;margin-top:4px}
    table{width:100%;border-collapse:collapse;margin:8px 0 20px} th,td{padding:6px;border-bottom:1px solid #eee;text-align:start}
    th{background:#f3f7f5} .n{text-align:end;white-space:nowrap} .income{color:#2B8A3E} .expense{color:#C92A2A}
    .tag{color:#0E7C5A}
  </style></head><body>
    <h1>${esc(t('reports.pdfTitle'))}</h1>
    <div class="muted">${esc(date(from))} – ${esc(date(to))}</div>
    <div class="cards">
      <div class="card">${esc(t('home.income'))}<b class="income">${esc(money(income))}</b></div>
      <div class="card">${esc(t('home.expense'))}<b class="expense">${esc(money(expense))}</b></div>
      <div class="card">${esc(t('home.savings'))}<b>${esc(money(income - expense))}</b></div>
    </div>
    <h3>${esc(t('reports.byCategory'))}</h3>
    <table><tr><th>${esc(t('tx.category'))}</th><th class="n">${esc(t('common.amount'))}</th><th class="n">%</th></tr>${catRows}</table>
    <h3>${esc(t('tabs.transactions'))}</h3>
    <table><tr><th>${esc(t('common.date'))}</th><th>${esc(t('tx.category'))}</th><th>${esc(t('tx.account'))}</th><th>${esc(t('common.note'))}</th><th class="n">${esc(t('common.amount'))}</th></tr>${txRows}</table>
  </body></html>`;
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: t('reports.pdfTitle'),
    UTI: 'com.adobe.pdf',
  });
}
