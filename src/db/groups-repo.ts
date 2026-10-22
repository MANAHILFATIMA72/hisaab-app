import type { SQLiteDatabase } from 'expo-sqlite';

import { addMonths, type ISODate } from '@/lib/dates';
import { computeShares, memberBalances, simplifyDebts, type SplitInput, type Transfer } from '@/lib/groups';
import type {
  Group,
  GroupExpense,
  GroupMember,
  GroupRecurring,
  GroupSettlement,
  GroupShare,
  Transaction,
} from '@/lib/types';

import { newId, saveTransaction } from './repo';

/** How a bill was split, plus the account my share is recorded from (recurring bills only). */
export type StoredSplit = SplitInput & { trackAccount?: string | null };

export type GroupExpenseFull = GroupExpense & { shares: Record<string, number>; input: StoredSplit };

export type GroupDetail = {
  group: Group;
  members: GroupMember[];
  me: GroupMember | undefined;
  expenses: GroupExpenseFull[];
  settlements: GroupSettlement[];
  recurring: GroupRecurring[];
  net: Record<string, number>;
  transfers: Transfer[];
  total: number;
};

export type GroupSummary = { group: Group; members: GroupMember[]; myNet: number; total: number; count: number };

async function loadLedger(db: SQLiteDatabase, groupId?: string) {
  const where = groupId ? 'WHERE group_id = ?' : '';
  const args = groupId ? [groupId] : [];
  const [members, expenses, shares, settlements] = await Promise.all([
    db.getAllAsync<GroupMember>(`SELECT * FROM group_members ${where} ORDER BY is_me DESC, sort, name`, args),
    db.getAllAsync<GroupExpense>(`SELECT * FROM group_expenses ${where} ORDER BY date DESC, created_at DESC`, args),
    db.getAllAsync<GroupShare>(
      `SELECT s.* FROM group_shares s JOIN group_expenses e ON e.id = s.expense_id ${groupId ? 'WHERE e.group_id = ?' : ''}`,
      args,
    ),
    db.getAllAsync<GroupSettlement>(
      `SELECT * FROM group_settlements ${where} ORDER BY date DESC, created_at DESC`,
      args,
    ),
  ]);
  const sharesBy = new Map<string, Record<string, number>>();
  for (const s of shares) {
    const rec = sharesBy.get(s.expense_id) ?? {};
    rec[s.member_id] = s.amount;
    sharesBy.set(s.expense_id, rec);
  }
  const full: GroupExpenseFull[] = expenses.map((e) => ({
    ...e,
    shares: sharesBy.get(e.id) ?? {},
    input: JSON.parse(e.split) as StoredSplit,
  }));
  return { members, expenses: full, settlements };
}

export async function listGroups(db: SQLiteDatabase): Promise<GroupSummary[]> {
  const groups = await db.getAllAsync<Group>('SELECT * FROM bill_groups WHERE archived = 0 ORDER BY created_at DESC');
  const ledger = await loadLedger(db);
  return groups.map((g) => {
    const members = ledger.members.filter((m) => m.group_id === g.id);
    const expenses = ledger.expenses.filter((e) => e.group_id === g.id);
    const net = memberBalances(
      members.map((m) => m.id),
      expenses,
      ledger.settlements.filter((s) => s.group_id === g.id),
    );
    const me = members.find((m) => m.is_me);
    return {
      group: g,
      members,
      myNet: me ? (net[me.id] ?? 0) : 0,
      total: expenses.reduce((a, e) => a + e.amount, 0),
      count: expenses.length,
    };
  });
}

export async function getGroup(db: SQLiteDatabase, id: string): Promise<GroupDetail | null> {
  const group = await db.getFirstAsync<Group>('SELECT * FROM bill_groups WHERE id = ?', id);
  if (!group) return null;
  const { members, expenses, settlements } = await loadLedger(db, id);
  const recurring = await db.getAllAsync<GroupRecurring>(
    'SELECT * FROM group_recurring WHERE group_id = ? ORDER BY next_date',
    id,
  );
  const net = memberBalances(
    members.map((m) => m.id),
    expenses,
    settlements,
  );
  return {
    group,
    members,
    me: members.find((m) => m.is_me),
    expenses,
    settlements,
    recurring,
    net,
    transfers: simplifyDebts(net),
    total: expenses.reduce((a, e) => a + e.amount, 0),
  };
}

export type MemberInput = { id?: string; name: string; phone: string };

/**
 * Creates or updates a group and its members. "Me" is always a member. Members who appear in a
 * bill or payment cannot be removed (their history would break); returns their names instead.
 */
export async function saveGroup(
  db: SQLiteDatabase,
  g: { id: string; name: string; icon: string },
  members: MemberInput[],
  myName: string,
): Promise<{ blocked: string[] }> {
  const blocked: string[] = [];
  await db.withTransactionAsync(async () => {
    const exists = await db.getFirstAsync('SELECT id FROM bill_groups WHERE id = ?', g.id);
    if (exists) {
      await db.runAsync('UPDATE bill_groups SET name = ?, icon = ? WHERE id = ?', g.name.trim(), g.icon, g.id);
    } else {
      await db.runAsync(
        'INSERT INTO bill_groups (id, name, icon, created_at) VALUES (?, ?, ?, ?)',
        g.id,
        g.name.trim(),
        g.icon,
        Date.now(),
      );
      await db.runAsync(
        'INSERT INTO group_members (id, group_id, name, is_me, sort) VALUES (?, ?, ?, 1, 0)',
        newId(),
        g.id,
        myName,
      );
    }
    const current = await db.getAllAsync<GroupMember>(
      'SELECT * FROM group_members WHERE group_id = ? AND is_me = 0',
      g.id,
    );
    const keep = new Set(members.filter((m) => m.id).map((m) => m.id));
    for (const m of current) {
      if (keep.has(m.id)) continue;
      const used = await db.getFirstAsync(
        `SELECT 1 FROM group_expenses WHERE paid_by = ?
         UNION SELECT 1 FROM group_shares WHERE member_id = ?
         UNION SELECT 1 FROM group_settlements WHERE from_member = ? OR to_member = ? LIMIT 1`,
        m.id,
        m.id,
        m.id,
        m.id,
      );
      if (used) blocked.push(m.name);
      else await db.runAsync('DELETE FROM group_members WHERE id = ?', m.id);
    }
    let sort = 1;
    for (const m of members) {
      const name = m.name.trim();
      if (!name) continue;
      if (m.id) {
        await db.runAsync(
          'UPDATE group_members SET name = ?, phone = ?, sort = ? WHERE id = ?',
          name,
          m.phone.trim(),
          sort,
          m.id,
        );
      } else {
        await db.runAsync(
          'INSERT INTO group_members (id, group_id, name, phone, sort) VALUES (?, ?, ?, ?, ?)',
          newId(),
          g.id,
          name,
          m.phone.trim(),
          sort,
        );
      }
      sort += 1;
    }
  });
  return { blocked };
}

export async function deleteGroup(db: SQLiteDatabase, id: string) {
  await db.withTransactionAsync(async () => {
    // My shares stay in my spending history; they just stop pointing at the group.
    await db.runAsync(
      'UPDATE transactions SET group_expense_id = NULL WHERE group_expense_id IN (SELECT id FROM group_expenses WHERE group_id = ?)',
      id,
    );
    await db.runAsync(
      'DELETE FROM group_shares WHERE expense_id IN (SELECT id FROM group_expenses WHERE group_id = ?)',
      id,
    );
    for (const t of ['group_expenses', 'group_settlements', 'group_recurring', 'group_members']) {
      await db.runAsync(`DELETE FROM ${t} WHERE group_id = ?`, id);
    }
    await db.runAsync('DELETE FROM bill_groups WHERE id = ?', id);
  });
}

export async function getGroupExpense(db: SQLiteDatabase, id: string) {
  const e = await db.getFirstAsync<GroupExpense>('SELECT * FROM group_expenses WHERE id = ?', id);
  if (!e) return null;
  const myTx = await db.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE group_expense_id = ?', id);
  return { expense: e, input: JSON.parse(e.split) as StoredSplit, myTx };
}

/**
 * Saves a bill and its shares. When `track` is given, my share is also written to my own spending
 * (one expense transaction linked to the bill), so budgets and reports include it.
 */
export async function saveGroupExpense(
  db: SQLiteDatabase,
  e: Omit<GroupExpense, 'created_at' | 'split'>,
  input: StoredSplit,
  shares: Record<string, number>,
  track: { meId: string; accountId: string } | null,
) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO group_expenses (id, group_id, title, amount, paid_by, split, date, category_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, amount = excluded.amount, paid_by = excluded.paid_by,
         split = excluded.split, date = excluded.date, category_id = excluded.category_id`,
      e.id,
      e.group_id,
      e.title.trim(),
      e.amount,
      e.paid_by,
      JSON.stringify(input),
      e.date,
      e.category_id,
      Date.now(),
    );
    await db.runAsync('DELETE FROM group_shares WHERE expense_id = ?', e.id);
    for (const [member, amount] of Object.entries(shares)) {
      if (amount > 0) {
        await db.runAsync(
          'INSERT INTO group_shares (expense_id, member_id, amount) VALUES (?, ?, ?)',
          e.id,
          member,
          amount,
        );
      }
    }
    const existing = await db.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE group_expense_id = ?', e.id);
    const myShare = track ? (shares[track.meId] ?? 0) : 0;
    if (!track || myShare <= 0) {
      if (existing) await db.runAsync('DELETE FROM transactions WHERE id = ?', existing.id);
      return;
    }
    await saveTransaction(db, {
      id: existing?.id ?? newId(),
      type: 'expense',
      amount: myShare,
      account_id: track.accountId,
      to_account_id: null,
      category_id: e.category_id,
      date: e.date,
      note: e.title.trim(),
      recurring_id: null,
      created_at: existing?.created_at,
      time: existing?.time,
      tags: existing?.tags,
      receipt: existing?.receipt,
      group_expense_id: e.id,
    });
  });
}

export async function deleteGroupExpense(db: SQLiteDatabase, id: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM transactions WHERE group_expense_id = ?', id);
    await db.runAsync('DELETE FROM group_shares WHERE expense_id = ?', id);
    await db.runAsync('DELETE FROM group_expenses WHERE id = ?', id);
  });
}

export async function addSettlement(db: SQLiteDatabase, s: Omit<GroupSettlement, 'id' | 'created_at'>) {
  await db.runAsync(
    'INSERT INTO group_settlements (id, group_id, from_member, to_member, amount, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    newId(),
    s.group_id,
    s.from_member,
    s.to_member,
    s.amount,
    s.date,
    Date.now(),
  );
}

export async function deleteSettlement(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM group_settlements WHERE id = ?', id);
}

// ---------- Monthly group bills (hostel rent, internet) ----------

export async function saveGroupRecurring(db: SQLiteDatabase, r: GroupRecurring) {
  await db.runAsync(
    `INSERT INTO group_recurring (id, group_id, title, amount, paid_by, split, category_id, next_date, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, amount = excluded.amount, paid_by = excluded.paid_by,
       split = excluded.split, category_id = excluded.category_id, next_date = excluded.next_date,
       active = excluded.active`,
    r.id,
    r.group_id,
    r.title,
    r.amount,
    r.paid_by,
    r.split,
    r.category_id,
    r.next_date,
    r.active,
  );
}

export async function deleteGroupRecurring(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM group_recurring WHERE id = ?', id);
}

/** Adds every monthly group bill that has come due. Returns how many bills were added. */
export async function processGroupRecurring(db: SQLiteDatabase, todayDate: ISODate): Promise<number> {
  const rules = await db.getAllAsync<GroupRecurring>(
    'SELECT * FROM group_recurring WHERE active = 1 AND next_date <= ?',
    todayDate,
  );
  let added = 0;
  for (const r of rules) {
    const input = JSON.parse(r.split) as StoredSplit;
    const anchorDay = Number(r.next_date.slice(8, 10));
    const me = await db.getFirstAsync<GroupMember>(
      'SELECT * FROM group_members WHERE group_id = ? AND is_me = 1',
      r.group_id,
    );
    let date = r.next_date;
    // Cap the catch-up so a long-unopened app does not create years of bills.
    for (let i = 0; date <= todayDate && i < 12; i++) {
      const { shares, error } = computeShares(r.amount, input);
      if (!error) {
        await saveGroupExpense(
          db,
          {
            id: newId(),
            group_id: r.group_id,
            title: r.title,
            amount: r.amount,
            paid_by: r.paid_by,
            date,
            category_id: r.category_id,
          },
          input,
          shares,
          me && input.trackAccount ? { meId: me.id, accountId: input.trackAccount } : null,
        );
        added += 1;
      }
      date = addMonths(date, 1, anchorDay);
    }
    while (date <= todayDate) date = addMonths(date, 1, anchorDay);
    await db.runAsync('UPDATE group_recurring SET next_date = ? WHERE id = ?', date, r.id);
  }
  return added;
}
