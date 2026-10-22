// Bank-style statement: opening balance, every movement with a running balance, closing balance.

import type { ISODate } from './dates';
import type { Account, Transaction } from './types';

export type StatementLine = {
  tx: Transaction;
  accountId: string;
  moneyIn: number;
  moneyOut: number;
  balance: number; // running balance of the selected accounts after this line
};

export type AccountSummary = { account: Account; opening: number; moneyIn: number; moneyOut: number; closing: number };

export type Statement = {
  lines: StatementLine[];
  accounts: AccountSummary[];
  opening: number;
  moneyIn: number;
  moneyOut: number;
  closing: number;
};

/** How a transaction moves money in or out of one account (a transfer touches two accounts). */
function effects(tx: Transaction): { accountId: string; amount: number }[] {
  if (tx.type === 'income') return [{ accountId: tx.account_id, amount: tx.amount }];
  if (tx.type === 'expense') return [{ accountId: tx.account_id, amount: -tx.amount }];
  const out = [{ accountId: tx.account_id, amount: -tx.amount }];
  if (tx.to_account_id) out.push({ accountId: tx.to_account_id, amount: tx.amount });
  return out;
}

const order = (a: Transaction, b: Transaction) =>
  a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.created_at - b.created_at;

/**
 * Builds a statement for the chosen accounts between two dates (inclusive). `txs` may contain
 * anything; earlier transactions are used for the opening balance and later ones are ignored.
 */
export function buildStatement(accounts: Account[], txs: Transaction[], from: ISODate, to: ISODate): Statement {
  const ids = new Set(accounts.map((a) => a.id));
  const sums = new Map<string, { opening: number; moneyIn: number; moneyOut: number }>(
    accounts.map((a) => [a.id, { opening: a.opening_balance, moneyIn: 0, moneyOut: 0 }]),
  );
  const lines: StatementLine[] = [];
  const sorted = [...txs].sort(order);

  for (const tx of sorted) {
    if (tx.date > to) break;
    for (const e of effects(tx)) {
      if (!ids.has(e.accountId)) continue;
      const s = sums.get(e.accountId);
      if (!s) continue;
      if (tx.date < from) {
        s.opening += e.amount;
        continue;
      }
      if (e.amount >= 0) s.moneyIn += e.amount;
      else s.moneyOut -= e.amount;
      lines.push({
        tx,
        accountId: e.accountId,
        moneyIn: Math.max(0, e.amount),
        moneyOut: Math.max(0, -e.amount),
        balance: 0,
      });
    }
  }

  const summaries: AccountSummary[] = accounts.map((a) => {
    const s = sums.get(a.id)!;
    return { account: a, ...s, closing: s.opening + s.moneyIn - s.moneyOut };
  });
  const opening = summaries.reduce((x, s) => x + s.opening, 0);
  let running = opening;
  for (const l of lines) {
    running += l.moneyIn - l.moneyOut;
    l.balance = running;
  }
  const moneyIn = summaries.reduce((x, s) => x + s.moneyIn, 0);
  const moneyOut = summaries.reduce((x, s) => x + s.moneyOut, 0);
  return { lines, accounts: summaries, opening, moneyIn, moneyOut, closing: opening + moneyIn - moneyOut };
}
