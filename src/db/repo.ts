import * as Crypto from 'expo-crypto';
import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

import { rolloverAmount } from '@/lib/budget';
import { dueOccurrences } from '@/lib/recurring';
import type { ISODate, Period } from '@/lib/dates';
import type {
  Account,
  Bill,
  Budget,
  Category,
  EventBudget,
  Goal,
  GoalContribution,
  ProfileType,
  Recurring,
  Transaction,
  TxType,
  Udhaar,
  UdhaarPayment,
} from '@/lib/types';

import { categoriesFor, DEFAULT_ACCOUNTS } from './defaults';
import { DATA_TABLES, SCHEMA_VERSION } from './schema';

export const newId = () => Crypto.randomUUID();

// ---------- Settings ----------

export async function getSettings(db: SQLiteDatabase): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

// ---------- First run ----------

export async function seedForProfile(
  db: SQLiteDatabase,
  profile: ProfileType,
  accountName: (key: string) => string,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const hasAccounts = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM accounts');
    if (!hasAccounts?.n) {
      let sort = 0;
      for (const a of DEFAULT_ACCOUNTS) {
        if (a.profiles && !a.profiles.includes(profile)) continue;
        await db.runAsync(
          'INSERT INTO accounts (id, name, type, opening_balance, sort) VALUES (?, ?, ?, 0, ?)',
          newId(),
          accountName(a.key),
          a.type,
          sort++,
        );
      }
    }
    const existing = new Set(
      (await db.getAllAsync<{ key: string }>('SELECT key FROM categories WHERE key IS NOT NULL')).map((r) => r.key),
    );
    let sort = 0;
    for (const c of categoriesFor(profile)) {
      sort += 1;
      if (existing.has(c.key)) continue;
      await db.runAsync(
        'INSERT INTO categories (id, key, name, kind, icon, color, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
        newId(),
        c.key,
        c.key,
        c.kind,
        c.icon,
        c.color,
        sort,
      );
    }
  });
}

// ---------- Accounts ----------

export type AccountWithBalance = Account & { balance: number };

export async function listAccounts(db: SQLiteDatabase, includeArchived = false): Promise<AccountWithBalance[]> {
  return db.getAllAsync<AccountWithBalance>(
    `SELECT a.*, a.opening_balance
       + COALESCE((SELECT SUM(CASE type WHEN 'income' THEN amount ELSE -amount END)
                   FROM transactions t WHERE t.account_id = a.id), 0)
       + COALESCE((SELECT SUM(amount) FROM transactions t
                   WHERE t.type = 'transfer' AND t.to_account_id = a.id), 0) AS balance
     FROM accounts a ${includeArchived ? '' : 'WHERE a.archived = 0'}
     ORDER BY a.sort, a.name`,
  );
}

export async function saveAccount(db: SQLiteDatabase, a: Omit<Account, 'sort' | 'archived'> & { archived?: number }) {
  const exists = await db.getFirstAsync('SELECT id FROM accounts WHERE id = ?', a.id);
  if (exists) {
    await db.runAsync(
      'UPDATE accounts SET name = ?, type = ?, opening_balance = ?, archived = ? WHERE id = ?',
      a.name,
      a.type,
      a.opening_balance,
      a.archived ?? 0,
      a.id,
    );
  } else {
    const max = await db.getFirstAsync<{ s: number | null }>('SELECT MAX(sort) AS s FROM accounts');
    await db.runAsync(
      'INSERT INTO accounts (id, name, type, opening_balance, sort) VALUES (?, ?, ?, ?, ?)',
      a.id,
      a.name,
      a.type,
      a.opening_balance,
      (max?.s ?? 0) + 1,
    );
  }
}

/** Deletes an account if it has no transactions, otherwise archives it so history stays correct. */
export async function removeAccount(db: SQLiteDatabase, id: string): Promise<'deleted' | 'archived'> {
  const used = await db.getFirstAsync(
    'SELECT id FROM transactions WHERE account_id = ? OR to_account_id = ? LIMIT 1',
    id,
    id,
  );
  if (used) {
    await db.runAsync('UPDATE accounts SET archived = 1 WHERE id = ?', id);
    return 'archived';
  }
  await db.runAsync('DELETE FROM recurring WHERE account_id = ? OR to_account_id = ?', id, id);
  await db.runAsync('DELETE FROM accounts WHERE id = ?', id);
  return 'deleted';
}

// ---------- Categories ----------

export async function listCategories(db: SQLiteDatabase, includeArchived = false): Promise<Category[]> {
  return db.getAllAsync<Category>(
    `SELECT * FROM categories ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY kind DESC, sort, name`,
  );
}

export async function saveCategory(db: SQLiteDatabase, c: Omit<Category, 'sort' | 'archived'>) {
  const exists = await db.getFirstAsync('SELECT id FROM categories WHERE id = ?', c.id);
  if (exists) {
    await db.runAsync(
      'UPDATE categories SET name = ?, kind = ?, icon = ?, color = ?, parent_id = ? WHERE id = ?',
      c.name,
      c.kind,
      c.icon,
      c.color,
      c.parent_id,
      c.id,
    );
  } else {
    const max = await db.getFirstAsync<{ s: number | null }>('SELECT MAX(sort) AS s FROM categories');
    await db.runAsync(
      'INSERT INTO categories (id, key, name, kind, icon, color, parent_id, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      c.id,
      c.key,
      c.name,
      c.kind,
      c.icon,
      c.color,
      c.parent_id,
      (max?.s ?? 0) + 1,
    );
  }
}

export async function removeCategory(db: SQLiteDatabase, id: string): Promise<'deleted' | 'archived'> {
  const used = await db.getFirstAsync(
    `SELECT id FROM transactions WHERE category_id = ?
     UNION SELECT id FROM recurring WHERE category_id = ? LIMIT 1`,
    id,
    id,
  );
  await db.runAsync('UPDATE categories SET parent_id = NULL WHERE parent_id = ?', id);
  await db.runAsync('DELETE FROM budgets WHERE category_id = ?', id);
  if (used) {
    await db.runAsync('UPDATE categories SET archived = 1 WHERE id = ?', id);
    return 'archived';
  }
  await db.runAsync('DELETE FROM categories WHERE id = ?', id);
  return 'deleted';
}

// ---------- Transactions ----------

export type TxFilter = {
  from?: ISODate;
  to?: ISODate;
  type?: TxType;
  categoryId?: string;
  accountId?: string;
  search?: string;
  tag?: string;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
};

export async function listTransactions(db: SQLiteDatabase, f: TxFilter = {}): Promise<Transaction[]> {
  const where: string[] = [];
  const params: SQLiteBindValue[] = [];
  if (f.from) {
    where.push('t.date >= ?');
    params.push(f.from);
  }
  if (f.to) {
    where.push('t.date <= ?');
    params.push(f.to);
  }
  if (f.type) {
    where.push('t.type = ?');
    params.push(f.type);
  }
  if (f.categoryId) {
    // Include subcategories so filtering by a parent shows everything under it.
    where.push('(t.category_id = ? OR t.category_id IN (SELECT id FROM categories WHERE parent_id = ?))');
    params.push(f.categoryId, f.categoryId);
  }
  if (f.accountId) {
    where.push('(t.account_id = ? OR t.to_account_id = ?)');
    params.push(f.accountId, f.accountId);
  }
  if (f.minAmount !== undefined) {
    where.push('t.amount >= ?');
    params.push(f.minAmount);
  }
  if (f.maxAmount !== undefined) {
    where.push('t.amount <= ?');
    params.push(f.maxAmount);
  }
  if (f.tag) {
    where.push(`(',' || t.tags || ',') LIKE ?`);
    params.push(`%,${f.tag},%`);
  }
  if (f.search?.trim()) {
    where.push(`(t.note LIKE ? OR c.name LIKE ? OR t.tags LIKE ? OR CAST(t.amount / 100 AS TEXT) LIKE ?)`);
    const q = `%${f.search.trim().replace(/^#/, '')}%`;
    params.push(q, q, q, q);
  }
  const sql = `SELECT t.* FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.date DESC, t.created_at DESC ${f.limit ? `LIMIT ${Math.floor(f.limit)}` : ''}`;
  return db.getAllAsync<Transaction>(sql, params);
}

export async function getTransaction(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE id = ?', id);
}

export type TransactionInput = Omit<
  Transaction,
  'created_at' | 'time' | 'tags' | 'receipt' | 'split_id' | 'group_expense_id'
> &
  Partial<Pick<Transaction, 'created_at' | 'time' | 'tags' | 'receipt' | 'split_id' | 'group_expense_id'>>;

export async function saveTransaction(db: SQLiteDatabase, t: TransactionInput) {
  await db.runAsync(
    `INSERT INTO transactions (id, type, amount, account_id, to_account_id, category_id, date, note, recurring_id,
       created_at, time, tags, receipt, split_id, group_expense_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET type = excluded.type, amount = excluded.amount, account_id = excluded.account_id,
       to_account_id = excluded.to_account_id, category_id = excluded.category_id, date = excluded.date,
       note = excluded.note, time = excluded.time, tags = excluded.tags, receipt = excluded.receipt,
       split_id = excluded.split_id`,
    t.id,
    t.type,
    t.amount,
    t.account_id,
    t.type === 'transfer' ? t.to_account_id : null,
    t.type === 'transfer' ? null : t.category_id,
    t.date,
    t.note,
    t.recurring_id,
    t.created_at ?? Date.now(),
    t.time ?? null,
    normalizeTags(t.tags ?? ''),
    t.receipt ?? null,
    t.split_id ?? null,
    t.group_expense_id ?? null,
  );
}

/** Tags are stored lower case, comma separated, without '#'. */
export function normalizeTags(input: string): string {
  const tags = input
    .split(/[,#\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(tags)].join(',');
}

export async function listTags(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ tags: string }>("SELECT DISTINCT tags FROM transactions WHERE tags != ''");
  return [...new Set(rows.flatMap((r) => r.tags.split(',')))].filter(Boolean).sort();
}

/** All rows of a purchase split across categories (FR-19). */
export async function getSplitParts(db: SQLiteDatabase, splitId: string) {
  return db.getAllAsync<Transaction>('SELECT * FROM transactions WHERE split_id = ? ORDER BY created_at', splitId);
}

export async function deleteSplitParts(db: SQLiteDatabase, splitId: string, keep: string[] = []) {
  const parts = await getSplitParts(db, splitId);
  for (const p of parts) if (!keep.includes(p.id)) await db.runAsync('DELETE FROM transactions WHERE id = ?', p.id);
}

export async function deleteTransaction(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
}

/** Expense totals per category for a period, rolling subcategories up into their parent. */
export async function spentByCategory(db: SQLiteDatabase, p: Period): Promise<Map<string, number>> {
  const rows = await db.getAllAsync<{ cat: string; total: number }>(
    `SELECT COALESCE(c.parent_id, c.id) AS cat, SUM(t.amount) AS total
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.type = 'expense' AND t.date BETWEEN ? AND ?
     GROUP BY COALESCE(c.parent_id, c.id)`,
    p.start,
    p.end,
  );
  return new Map(rows.map((r) => [r.cat, r.total]));
}

export async function totalsInRange(db: SQLiteDatabase, from: ISODate, to: ISODate) {
  const row = await db.getFirstAsync<{ income: number | null; expense: number | null }>(
    `SELECT SUM(CASE WHEN type = 'income' THEN amount END) AS income,
            SUM(CASE WHEN type = 'expense' THEN amount END) AS expense
     FROM transactions WHERE date BETWEEN ? AND ?`,
    from,
    to,
  );
  return { income: row?.income ?? 0, expense: row?.expense ?? 0 };
}

// ---------- Recurring ----------

export async function listRecurring(db: SQLiteDatabase): Promise<Recurring[]> {
  return db.getAllAsync<Recurring>('SELECT * FROM recurring ORDER BY active DESC, next_date');
}

export async function saveRecurring(db: SQLiteDatabase, r: Recurring) {
  await db.runAsync(
    `INSERT INTO recurring (id, type, amount, account_id, to_account_id, category_id, note, frequency, next_date, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET type = excluded.type, amount = excluded.amount, account_id = excluded.account_id,
       to_account_id = excluded.to_account_id, category_id = excluded.category_id, note = excluded.note,
       frequency = excluded.frequency, next_date = excluded.next_date, active = excluded.active`,
    r.id,
    r.type,
    r.amount,
    r.account_id,
    r.to_account_id,
    r.category_id,
    r.note,
    r.frequency,
    r.next_date,
    r.active,
  );
}

export async function deleteRecurring(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM recurring WHERE id = ?', id);
}

/** Creates transactions for every recurring rule that has come due. Returns how many were added. */
export async function processRecurring(db: SQLiteDatabase, todayDate: ISODate): Promise<number> {
  const rules = await db.getAllAsync<Recurring>(
    'SELECT * FROM recurring WHERE active = 1 AND next_date <= ?',
    todayDate,
  );
  let added = 0;
  for (const r of rules) {
    const { dates, next } = dueOccurrences(r.next_date, r.frequency, todayDate);
    await db.withTransactionAsync(async () => {
      for (const date of dates) {
        await saveTransaction(db, {
          id: newId(),
          type: r.type,
          amount: r.amount,
          account_id: r.account_id,
          to_account_id: r.to_account_id,
          category_id: r.category_id,
          date,
          note: r.note,
          recurring_id: r.id,
        });
        added += 1;
      }
      await db.runAsync('UPDATE recurring SET next_date = ? WHERE id = ?', next, r.id);
    });
  }
  return added;
}

// ---------- Budgets ----------

export async function listBudgets(db: SQLiteDatabase): Promise<Budget[]> {
  return db.getAllAsync<Budget>('SELECT * FROM budgets');
}

export async function setBudget(db: SQLiteDatabase, categoryId: string | null, amount: number) {
  if (categoryId === null) {
    await db.runAsync('DELETE FROM budgets WHERE category_id IS NULL');
  } else {
    await db.runAsync('DELETE FROM budgets WHERE category_id = ?', categoryId);
  }
  if (amount > 0) {
    await db.runAsync('INSERT INTO budgets (id, category_id, amount) VALUES (?, ?, ?)', newId(), categoryId, amount);
  }
}

/** Sets the overall monthly budget and remembers it as this period's budget (for rollover). */
export async function setOverallBudget(db: SQLiteDatabase, period: Period, amount: number) {
  await setBudget(db, null, amount);
  if (amount > 0) {
    await db.runAsync(
      'INSERT INTO budget_history (period_start, amount) VALUES (?, ?) ON CONFLICT(period_start) DO UPDATE SET amount = excluded.amount',
      period.start,
      amount,
    );
  } else {
    await db.runAsync('DELETE FROM budget_history WHERE period_start = ?', period.start);
  }
}

/**
 * This period's overall budget plus, when rollover is on, what was left of last period's budget.
 * A period that starts with a budget already set records it, so next month knows it existed.
 */
export async function overallBudget(
  db: SQLiteDatabase,
  period: Period,
  previous: Period,
  rollover: boolean,
): Promise<{ base: number; carried: number; total: number }> {
  const base = (await db.getFirstAsync<{ amount: number }>('SELECT amount FROM budgets WHERE category_id IS NULL'))
    ?.amount;
  if (!base) return { base: 0, carried: 0, total: 0 };
  await db.runAsync('INSERT OR IGNORE INTO budget_history (period_start, amount) VALUES (?, ?)', period.start, base);
  if (!rollover) return { base, carried: 0, total: base };
  const prev = await db.getFirstAsync<{ amount: number }>(
    'SELECT amount FROM budget_history WHERE period_start = ?',
    previous.start,
  );
  const spent = (await totalsInRange(db, previous.start, previous.end)).expense;
  const carried = rolloverAmount(prev?.amount ?? null, spent);
  return { base, carried, total: base + carried };
}

/** Records that an alert fired. Returns false if it had already fired. */
export async function markAlertSent(db: SQLiteDatabase, key: string): Promise<boolean> {
  const r = await db.runAsync('INSERT OR IGNORE INTO alerts_sent (key) VALUES (?)', key);
  return r.changes > 0;
}

// ---------- Udhaar ----------

export async function listUdhaar(db: SQLiteDatabase) {
  const items = await db.getAllAsync<Udhaar>('SELECT * FROM udhaar ORDER BY date DESC, created_at DESC');
  const payments = await db.getAllAsync<UdhaarPayment>('SELECT * FROM udhaar_payments ORDER BY date');
  return { items, payments };
}

export async function saveUdhaar(db: SQLiteDatabase, u: Omit<Udhaar, 'created_at'>) {
  await db.runAsync(
    `INSERT INTO udhaar (id, person, phone, direction, amount, date, due_date, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET person = excluded.person, phone = excluded.phone, direction = excluded.direction,
       amount = excluded.amount, date = excluded.date, due_date = excluded.due_date, reason = excluded.reason`,
    u.id,
    u.person.trim(),
    u.phone.trim(),
    u.direction,
    u.amount,
    u.date,
    u.due_date,
    u.reason,
    Date.now(),
  );
}

export async function deleteUdhaar(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM udhaar_payments WHERE udhaar_id = ?', id);
  await db.runAsync('DELETE FROM udhaar WHERE id = ?', id);
}

export async function addUdhaarPayment(db: SQLiteDatabase, p: UdhaarPayment) {
  await db.runAsync(
    'INSERT INTO udhaar_payments (id, udhaar_id, amount, date, note) VALUES (?, ?, ?, ?, ?)',
    p.id,
    p.udhaar_id,
    p.amount,
    p.date,
    p.note,
  );
}

export async function deleteUdhaarPayment(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM udhaar_payments WHERE id = ?', id);
}

// ---------- Goals ----------

export type GoalWithSaved = Goal & { saved: number };

export async function listGoals(db: SQLiteDatabase): Promise<GoalWithSaved[]> {
  return db.getAllAsync<GoalWithSaved>(
    `SELECT g.*, COALESCE((SELECT SUM(amount) FROM goal_contributions c WHERE c.goal_id = g.id), 0) AS saved
     FROM goals g ORDER BY g.created_at`,
  );
}

export async function saveGoal(db: SQLiteDatabase, g: Omit<Goal, 'created_at'>) {
  await db.runAsync(
    `INSERT INTO goals (id, name, template, target, deadline, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, target = excluded.target, deadline = excluded.deadline`,
    g.id,
    g.name,
    g.template,
    g.target,
    g.deadline,
    Date.now(),
  );
}

export async function deleteGoal(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM goal_contributions WHERE goal_id = ?', id);
  await db.runAsync('DELETE FROM goals WHERE id = ?', id);
}

export async function addGoalContribution(db: SQLiteDatabase, c: GoalContribution) {
  await db.runAsync(
    'INSERT INTO goal_contributions (id, goal_id, amount, date) VALUES (?, ?, ?, ?)',
    c.id,
    c.goal_id,
    c.amount,
    c.date,
  );
}

// ---------- Bills ----------

export async function listBills(db: SQLiteDatabase): Promise<Bill[]> {
  return db.getAllAsync<Bill>('SELECT * FROM bills ORDER BY due_day');
}

export async function saveBill(db: SQLiteDatabase, b: Bill) {
  await db.runAsync(
    `INSERT INTO bills (id, name, amount, due_day, active) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, amount = excluded.amount, due_day = excluded.due_day,
       active = excluded.active`,
    b.id,
    b.name,
    b.amount,
    b.due_day,
    b.active,
  );
}

export async function deleteBill(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM bills WHERE id = ?', id);
}

// ---------- Event budgets (Eid, trip, shaadi), tracked by tag ----------

export type EventBudgetWithSpent = EventBudget & { spent: number };

export async function listEventBudgets(db: SQLiteDatabase): Promise<EventBudgetWithSpent[]> {
  return db.getAllAsync<EventBudgetWithSpent>(
    `SELECT e.*, COALESCE((SELECT SUM(t.amount) FROM transactions t
       WHERE t.type = 'expense' AND (',' || t.tags || ',') LIKE '%,' || e.tag || ',%'), 0) AS spent
     FROM event_budgets e ORDER BY e.created_at DESC`,
  );
}

export async function saveEventBudget(db: SQLiteDatabase, e: Omit<EventBudget, 'created_at'>) {
  await db.runAsync(
    `INSERT INTO event_budgets (id, name, tag, amount, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, tag = excluded.tag, amount = excluded.amount`,
    e.id,
    e.name.trim(),
    normalizeTags(e.tag),
    e.amount,
    Date.now(),
  );
}

export async function deleteEventBudget(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM event_budgets WHERE id = ?', id);
}

// ---------- Backup, restore, wipe ----------

export type Backup = {
  app: 'hisaab';
  schema: number;
  exported_at: string;
  tables: Record<string, Record<string, unknown>[]>;
};

export async function exportAll(db: SQLiteDatabase): Promise<Backup> {
  const tables: Backup['tables'] = {};
  for (const t of DATA_TABLES) tables[t] = await db.getAllAsync(`SELECT * FROM ${t}`);
  return { app: 'hisaab', schema: SCHEMA_VERSION, exported_at: new Date().toISOString(), tables };
}

export async function wipeAll(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    for (const t of [...DATA_TABLES].reverse()) await db.runAsync(`DELETE FROM ${t}`);
  });
}

/** Replaces all data with a backup. Throws if the file is not a Hisaab backup. */
export async function importAll(db: SQLiteDatabase, data: unknown) {
  const b = data as Backup;
  if (!b || b.app !== 'hisaab' || typeof b.tables !== 'object') throw new Error('invalid-backup');
  if (b.schema > SCHEMA_VERSION) throw new Error('newer-backup');
  await db.withTransactionAsync(async () => {
    for (const t of [...DATA_TABLES].reverse()) await db.runAsync(`DELETE FROM ${t}`);
    for (const t of DATA_TABLES) {
      const rows = b.tables[t] ?? [];
      const columns = (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t})`)).map((c) => c.name);
      for (const row of rows) {
        const cols = columns.filter((c) => c in row);
        if (!cols.length) continue;
        await db.runAsync(
          `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          cols.map((c) => row[c] as SQLiteBindValue),
        );
      }
    }
  });
}
