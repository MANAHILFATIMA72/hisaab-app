import type { SQLiteDatabase } from 'expo-sqlite';

// Each entry upgrades the database by one version. Never edit a shipped migration; add a new one.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);

  CREATE TABLE accounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    opening_balance INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE categories (
    id TEXT PRIMARY KEY NOT NULL,
    key TEXT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    parent_id TEXT REFERENCES categories(id),
    archived INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE transactions (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    to_account_id TEXT REFERENCES accounts(id),
    category_id TEXT REFERENCES categories(id),
    date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    recurring_id TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX tx_date ON transactions(date);
  CREATE INDEX tx_category ON transactions(category_id);
  CREATE INDEX tx_account ON transactions(account_id);

  CREATE TABLE recurring (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    account_id TEXT NOT NULL,
    to_account_id TEXT,
    category_id TEXT,
    note TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL,
    next_date TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE budgets (
    id TEXT PRIMARY KEY NOT NULL,
    category_id TEXT UNIQUE,
    amount INTEGER NOT NULL
  );

  CREATE TABLE udhaar (
    id TEXT PRIMARY KEY NOT NULL,
    person TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    direction TEXT NOT NULL,
    amount INTEGER NOT NULL,
    date TEXT NOT NULL,
    due_date TEXT,
    reason TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE udhaar_payments (
    id TEXT PRIMARY KEY NOT NULL,
    udhaar_id TEXT NOT NULL REFERENCES udhaar(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE goals (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    template TEXT,
    target INTEGER NOT NULL,
    deadline TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE goal_contributions (
    id TEXT PRIMARY KEY NOT NULL,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    date TEXT NOT NULL
  );

  CREATE TABLE bills (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    due_day INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  -- Remembers which budget alerts already fired in a period, so each fires once.
  CREATE TABLE alerts_sent (key TEXT PRIMARY KEY NOT NULL);
  `,
  // v1.1: student features. Time, tags, receipts and split purchases on transactions; group bills; event budgets.
  `
  ALTER TABLE transactions ADD COLUMN time TEXT;
  ALTER TABLE transactions ADD COLUMN tags TEXT NOT NULL DEFAULT '';
  ALTER TABLE transactions ADD COLUMN receipt TEXT;
  ALTER TABLE transactions ADD COLUMN split_id TEXT;
  ALTER TABLE transactions ADD COLUMN group_expense_id TEXT;
  CREATE INDEX tx_split ON transactions(split_id);
  CREATE INDEX tx_group_expense ON transactions(group_expense_id);

  CREATE TABLE bill_groups (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'people',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE group_members (
    id TEXT PRIMARY KEY NOT NULL,
    group_id TEXT NOT NULL REFERENCES bill_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    is_me INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE group_expenses (
    id TEXT PRIMARY KEY NOT NULL,
    group_id TEXT NOT NULL REFERENCES bill_groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount INTEGER NOT NULL,
    paid_by TEXT NOT NULL,
    split TEXT NOT NULL,
    date TEXT NOT NULL,
    category_id TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX gexp_group ON group_expenses(group_id);

  CREATE TABLE group_shares (
    expense_id TEXT NOT NULL REFERENCES group_expenses(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    PRIMARY KEY (expense_id, member_id)
  );

  CREATE TABLE group_settlements (
    id TEXT PRIMARY KEY NOT NULL,
    group_id TEXT NOT NULL REFERENCES bill_groups(id) ON DELETE CASCADE,
    from_member TEXT NOT NULL,
    to_member TEXT NOT NULL,
    amount INTEGER NOT NULL,
    date TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE group_recurring (
    id TEXT PRIMARY KEY NOT NULL,
    group_id TEXT NOT NULL REFERENCES bill_groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount INTEGER NOT NULL,
    paid_by TEXT NOT NULL,
    split TEXT NOT NULL,
    category_id TEXT,
    next_date TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE event_budgets (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    tag TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  `,
  // v1.1.1: the monthly budget each period actually had, so rollover only carries real leftovers.
  `
  CREATE TABLE budget_history (period_start TEXT PRIMARY KEY NOT NULL, amount INTEGER NOT NULL);
  `,
];

/** Tables in the order they can be safely restored (parents before children). */
export const DATA_TABLES = [
  'settings',
  'accounts',
  'categories',
  'transactions',
  'recurring',
  'budgets',
  'udhaar',
  'udhaar_payments',
  'goals',
  'goal_contributions',
  'bills',
  'alerts_sent',
  'bill_groups',
  'group_members',
  'group_expenses',
  'group_shares',
  'group_settlements',
  'group_recurring',
  'event_budgets',
  'budget_history',
] as const;

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
