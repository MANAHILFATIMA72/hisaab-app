// Shared bills between friends, roommates or a trip group: who paid, who owes, and the fewest
// payments that settle everyone. All amounts are integer paisa.

import { splitEvenly } from './money';

export type SplitMode = 'equal' | 'amount' | 'percent' | 'items';

export type SplitItem = { name: string; amount: number; members: string[] };

export type SplitInput =
  | { mode: 'equal'; members: string[] }
  | { mode: 'amount'; amounts: Record<string, number> }
  | { mode: 'percent'; percents: Record<string, number> }
  | { mode: 'items'; items: SplitItem[]; extra: number };

export type SplitError = 'noMembers' | 'amountMismatch' | 'percentMismatch' | 'itemNoMembers' | 'noItems';

export type SplitResult = { total: number; shares: Record<string, number>; error?: SplitError; diff?: number };

/** Splits `parts` of a total by weight so the pieces add back to exactly `total` (largest remainder). */
export function splitByWeight(total: number, weights: Record<string, number>): Record<string, number> {
  const ids = Object.keys(weights).filter((id) => weights[id] > 0);
  const sum = ids.reduce((a, id) => a + weights[id], 0);
  const out: Record<string, number> = {};
  if (!ids.length || sum <= 0) return out;
  let given = 0;
  const fractions: { id: string; frac: number }[] = [];
  for (const id of ids) {
    const exact = (total * weights[id]) / sum;
    out[id] = Math.floor(exact);
    given += out[id];
    fractions.push({ id, frac: exact - out[id] });
  }
  fractions.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < total - given; i++) out[fractions[i % fractions.length].id] += 1;
  return out;
}

/**
 * Works out each member's share of a bill. For 'items', the total is the sum of the items plus
 * `extra` (tax, service charge, delivery), and the extra is shared in proportion to what each ate.
 */
export function computeShares(total: number, input: SplitInput): SplitResult {
  switch (input.mode) {
    case 'equal': {
      if (!input.members.length) return { total, shares: {}, error: 'noMembers' };
      const parts = splitEvenly(total, input.members.length);
      return { total, shares: Object.fromEntries(input.members.map((m, i) => [m, parts[i]])) };
    }
    case 'amount': {
      const shares = Object.fromEntries(Object.entries(input.amounts).filter(([, v]) => v > 0));
      if (!Object.keys(shares).length) return { total, shares, error: 'noMembers' };
      const sum = Object.values(shares).reduce((a, b) => a + b, 0);
      if (sum !== total) return { total, shares, error: 'amountMismatch', diff: total - sum };
      return { total, shares };
    }
    case 'percent': {
      const weights = Object.fromEntries(Object.entries(input.percents).filter(([, v]) => v > 0));
      if (!Object.keys(weights).length) return { total, shares: {}, error: 'noMembers' };
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.001) return { total, shares: {}, error: 'percentMismatch', diff: 100 - sum };
      return { total, shares: splitByWeight(total, weights) };
    }
    case 'items': {
      const items = input.items.filter((i) => i.amount > 0);
      if (!items.length) return { total: input.extra, shares: {}, error: 'noItems' };
      const subtotal: Record<string, number> = {};
      for (const item of items) {
        if (!item.members.length) return { total, shares: {}, error: 'itemNoMembers' };
        const parts = splitEvenly(item.amount, item.members.length);
        item.members.forEach((m, i) => (subtotal[m] = (subtotal[m] ?? 0) + parts[i]));
      }
      const extra = splitByWeight(input.extra, subtotal);
      const shares: Record<string, number> = {};
      for (const m of Object.keys(subtotal)) shares[m] = subtotal[m] + (extra[m] ?? 0);
      const itemsTotal = items.reduce((a, i) => a + i.amount, 0);
      return { total: itemsTotal + input.extra, shares };
    }
  }
}

export type LedgerExpense = { paid_by: string; amount: number; shares: Record<string, number> };
export type LedgerSettlement = { from_member: string; to_member: string; amount: number };

/**
 * Net position of each member. Positive = the group owes them (they will receive),
 * negative = they owe the group.
 */
export function memberBalances(
  memberIds: string[],
  expenses: LedgerExpense[],
  settlements: LedgerSettlement[],
): Record<string, number> {
  const net: Record<string, number> = Object.fromEntries(memberIds.map((id) => [id, 0]));
  const add = (id: string, v: number) => (net[id] = (net[id] ?? 0) + v);
  for (const e of expenses) {
    add(e.paid_by, e.amount);
    for (const [m, share] of Object.entries(e.shares)) add(m, -share);
  }
  for (const s of settlements) {
    add(s.from_member, s.amount);
    add(s.to_member, -s.amount);
  }
  return net;
}

export type Transfer = { from: string; to: string; amount: number };

/**
 * The fewest payments that settle the group: repeatedly match the person who owes the most with
 * the person who is owed the most. At most n-1 payments for n people.
 */
export function simplifyDebts(net: Record<string, number>): Transfer[] {
  const debtors = Object.entries(net)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, v: -v }));
  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, v }));
  const out: Transfer[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort((a, b) => b.v - a.v);
    creditors.sort((a, b) => b.v - a.v);
    const d = debtors[0];
    const c = creditors[0];
    const amount = Math.min(d.v, c.v);
    if (amount > 0) out.push({ from: d.id, to: c.id, amount });
    d.v -= amount;
    c.v -= amount;
    if (d.v === 0) debtors.shift();
    if (c.v === 0) creditors.shift();
  }
  return out;
}

/** Sums my position across groups into "to receive" and "to pay". */
export function myTotals(myNets: number[]): { toReceive: number; toPay: number } {
  let toReceive = 0;
  let toPay = 0;
  for (const n of myNets) {
    if (n > 0) toReceive += n;
    else toPay += -n;
  }
  return { toReceive, toPay };
}
