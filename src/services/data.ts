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
import { buildStatement } from '@/lib/statement';
import type { Transaction } from '@/lib/types';
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

/**
 * A bank-style statement as a PDF: opening balance, every transaction with date, time and running
 * balance, and closing balance. This is the readable file to keep or send; the JSON backup is only
 * for restoring into Hisaab.
 */
export async function shareStatementPdf(
  db: SQLiteDatabase,
  opts: { t: TFunction; money: (minor: number) => string; date: (iso: string) => string; rtl: boolean },
  from: string,
  to: string,
  accountId: string | null,
) {
  const { t, money, date, rtl } = opts;
  const [txs, allAccounts, categories] = await Promise.all([
    listTransactions(db, { to }),
    listAccounts(db, true),
    listCategories(db, true),
  ]);
  const chosen = accountId ? allAccounts.filter((a) => a.id === accountId) : allAccounts.filter((a) => !a.archived);
  const st = buildStatement(chosen, txs, from, to);
  const accName = new Map(allAccounts.map((a) => [a.id, a.name]));
  const cat = new Map(categories.map((c) => [c.id, c]));
  const now = new Date();
  const generated = `${date(today())} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const describe = (x: Transaction, lineAccount: string) => {
    if (x.type === 'transfer') {
      return lineAccount === x.account_id
        ? t('tx.transferTo', { name: accName.get(x.to_account_id ?? '') ?? '' })
        : t('statement.transferFrom', { name: accName.get(x.account_id) ?? '' });
    }
    return categoryName(x.category_id ? cat.get(x.category_id) : null, t);
  };

  const rows = st.lines
    .map((l, i) => {
      const x = l.tx;
      const extra = [
        x.note,
        x.tags ? '#' + x.tags.split(',').join(' #') : '',
        x.group_expense_id ? t('tx.groupShare') : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return `<tr class="${i % 2 ? 'alt' : ''}">
        <td class="nowrap">${esc(date(x.date))}</td>
        <td class="nowrap muted">${x.time ?? ''}</td>
        <td><b>${esc(describe(x, l.accountId))}</b>${extra ? `<div class="muted">${esc(extra)}</div>` : ''}</td>
        <td class="muted">${esc(accName.get(l.accountId) ?? '')}</td>
        <td class="n in">${l.moneyIn ? esc(money(l.moneyIn)) : ''}</td>
        <td class="n out">${l.moneyOut ? esc(money(l.moneyOut)) : ''}</td>
        <td class="n"><b>${esc(money(l.balance))}</b></td>
      </tr>`;
    })
    .join('');

  const accRows = st.accounts
    .map(
      (a) => `<tr><td>${esc(a.account.name)}</td><td class="n">${esc(money(a.opening))}</td>
        <td class="n in">${esc(money(a.moneyIn))}</td><td class="n out">${esc(money(a.moneyOut))}</td>
        <td class="n"><b>${esc(money(a.closing))}</b></td></tr>`,
    )
    .join('');

  const html = `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
    @page{margin:18mm 12mm}
    body{font-family:sans-serif;color:#1a1a1a;font-size:11px;margin:0}
    .head{background:#0E7C5A;color:#fff;padding:16px 18px;border-radius:10px;display:flex;justify-content:space-between;align-items:flex-end}
    .head h1{margin:0;font-size:20px} .head .sub{opacity:.85;margin-top:4px}
    .muted{color:#6b7280} .nowrap{white-space:nowrap}
    .boxes{display:flex;gap:8px;margin:14px 0}
    .box{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px}
    .box b{display:block;font-size:14px;margin-top:3px}
    h3{margin:18px 0 6px;color:#0E7C5A}
    table{width:100%;border-collapse:collapse}
    thead{display:table-header-group}
    th{background:#eef6f2;color:#0b5e45;text-align:start;padding:7px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.03em}
    td{padding:7px 6px;border-bottom:1px solid #f0f0f0;vertical-align:top;text-align:start}
    tr.alt td{background:#fafafa}
    .n{text-align:end;white-space:nowrap} .in{color:#2B8A3E} .out{color:#C92A2A}
    .foot{margin-top:18px;font-size:10px;color:#9ca3af;text-align:center}
  </style></head><body>
    <div class="head">
      <div><h1>${esc(t('statement.title'))}</h1>
        <div class="sub">${esc(accountId ? (accName.get(accountId) ?? '') : t('statement.allAccounts'))}</div></div>
      <div style="text-align:end"><div>${esc(date(from))} – ${esc(date(to))}</div>
        <div class="sub">${esc(t('statement.generated', { when: generated }))}</div></div>
    </div>
    <div class="boxes">
      <div class="box">${esc(t('statement.opening'))}<b>${esc(money(st.opening))}</b></div>
      <div class="box">${esc(t('statement.moneyIn'))}<b class="in">${esc(money(st.moneyIn))}</b></div>
      <div class="box">${esc(t('statement.moneyOut'))}<b class="out">${esc(money(st.moneyOut))}</b></div>
      <div class="box">${esc(t('statement.closing'))}<b>${esc(money(st.closing))}</b></div>
    </div>
    ${
      st.accounts.length > 1
        ? `<h3>${esc(t('accounts.title'))}</h3><table><thead><tr><th>${esc(t('tx.account'))}</th><th class="n">${esc(t('statement.opening'))}</th><th class="n">${esc(t('statement.moneyIn'))}</th><th class="n">${esc(t('statement.moneyOut'))}</th><th class="n">${esc(t('statement.closing'))}</th></tr></thead><tbody>${accRows}</tbody></table>`
        : ''
    }
    <h3>${esc(t('statement.transactions'))} (${st.lines.length})</h3>
    <table><thead><tr>
      <th>${esc(t('common.date'))}</th><th>${esc(t('common.time'))}</th><th>${esc(t('statement.details'))}</th>
      <th>${esc(t('tx.account'))}</th><th class="n">${esc(t('statement.moneyIn'))}</th>
      <th class="n">${esc(t('statement.moneyOut'))}</th><th class="n">${esc(t('statement.balance'))}</th>
    </tr></thead><tbody>
      <tr><td colspan="6"><b>${esc(t('statement.opening'))}</b></td><td class="n"><b>${esc(money(st.opening))}</b></td></tr>
      ${rows || `<tr><td colspan="7" class="muted">${esc(t('statement.empty'))}</td></tr>`}
      <tr><td colspan="6"><b>${esc(t('statement.closing'))}</b></td><td class="n"><b>${esc(money(st.closing))}</b></td></tr>
    </tbody></table>
    <div class="foot">${esc(t('statement.footer'))}</div>
  </body></html>`;

  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  // Give the file a readable name instead of the random one expo-print picks.
  const named = new File(Paths.cache, `Hisaab-statement-${from}-to-${to}.pdf`);
  if (named.exists) named.delete();
  await new File(uri).copy(named);
  await Sharing.shareAsync(named.uri, {
    mimeType: 'application/pdf',
    dialogTitle: t('statement.title'),
    UTI: 'com.adobe.pdf',
  });
}
