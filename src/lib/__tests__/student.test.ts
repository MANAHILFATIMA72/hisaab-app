import { describe, expect, it } from 'vitest';

import { dailyAllowanceBudget, fiftyThirtyTwenty, rolloverAmount, roundUpFriendly, suggestLimits } from '../budget';
import { guessCategoryKeys, pickCategory } from '../categorize';
import { computeShares, memberBalances, simplifyDebts, splitByWeight } from '../groups';
import { findDate, findTime, parseSms } from '../sms-parse';
import { buildStatement } from '../statement';

describe('sms parsing', () => {
  it('reads an HBL debit card charge fully', () => {
    const p = parseSms(
      'Dear Customer, your HBL Debit Card ending 4821 has been charged for a transaction of PKR 3,167.00 at FOODPANDA on 21-Oct-26 at 14:32. Avl Bal PKR 12,345.67. For queries call 111-111-425',
    );
    expect(p).toMatchObject({
      amount: 316700,
      kind: 'expense',
      bank: 'HBL',
      bankType: 'bank',
      last4: '4821',
      merchant: 'FOODPANDA',
      date: '2026-10-21',
      time: '14:32',
      balance: 1234567,
      channel: 'card',
    });
  });

  it('reads a Meezan debit with the amount first and slashes in the date', () => {
    const p = parseSms(
      'PKR 2,500.00 has been debited from your Meezan A/C ****1234 on 21/10/2026 15:20 via Debit Card at KFC GULBERG. Avl Bal: PKR 10,000.00',
    );
    expect(p).toMatchObject({ amount: 250000, bank: 'Meezan', last4: '1234', date: '2026-10-21', time: '15:20' });
    expect(p?.merchant).toBe('KFC GULBERG');
  });

  it('turns an ATM withdrawal into a withdrawal', () => {
    const p = parseSms('UBL: Rs.5,000.00 withdrawn from A/C XXX7788 at ATM on 21-10-2026 10:15. Bal Rs.15,000');
    expect(p).toMatchObject({ amount: 500000, kind: 'withdrawal', bank: 'UBL', channel: 'atm', balance: 1500000 });
    expect(p?.merchant).toBeNull();
  });

  it('reads a JazzCash receipt with sender and 12 hour time', () => {
    const p = parseSms(
      'JazzCash: You have received Rs 1,000.00 from ALI KHAN 03001234567 on 21-Oct-2026 at 10:15 PM. TID: 12345678901. Your new balance is Rs 2,345.00',
    );
    expect(p).toMatchObject({
      amount: 100000,
      kind: 'income',
      type: 'income',
      bank: 'JazzCash',
      bankType: 'wallet',
      merchant: 'ALI KHAN',
      time: '22:15',
      reference: '12345678901',
      balance: 234500,
    });
  });

  it('reads an Easypaisa send with fee', () => {
    const p = parseSms(
      'Easypaisa: Rs. 500 sent to Ahmed Raza 03451234567 successfully on 21/10/26 at 3:15 PM. Trx ID 99887766. Fee Rs 10. Balance Rs 1200',
    );
    expect(p).toMatchObject({ amount: 50000, kind: 'expense', bank: 'Easypaisa', merchant: 'Ahmed Raza', fee: 1000 });
    expect(p?.date).toBe('2026-10-21');
  });

  it('finds dates and times in many formats', () => {
    expect(findDate('on 2026-10-05')).toBe('2026-10-05');
    expect(findDate('on Oct 5, 2026')).toBe('2026-10-05');
    expect(findDate('on 05 October 2026')).toBe('2026-10-05');
    expect(findDate('nothing here')).toBeNull();
    expect(findTime('at 12:05 AM')).toBe('00:05');
    expect(findTime('14:32:10')).toBe('14:32');
  });

  it('returns null without an amount', () => {
    expect(parseSms('Your OTP is 1234')).toBeNull();
  });
});

describe('auto category', () => {
  const cats = [
    { key: 'canteen', name: 'canteen', kind: 'expense' },
    { key: 'food', name: 'food', kind: 'expense' },
    { key: 'transport', name: 'transport', kind: 'expense' },
    { key: 'hostel_rent', name: 'hostel_rent', kind: 'expense' },
    { key: null, name: 'Gym', kind: 'expense' },
    { key: 'pocket_money', name: 'pocket_money', kind: 'income' },
  ];

  it('prefers the student category when the user has it', () => {
    expect(pickCategory('chai with friends', 'expense', cats)?.key).toBe('canteen');
    expect(pickCategory('chai', 'expense', cats.slice(1))?.key).toBe('food');
  });

  it('recognises shops, rides and rent', () => {
    expect(pickCategory('FOODPANDA', 'expense', cats)?.key).toBe('food');
    expect(pickCategory('Careem ride to uni', 'expense', cats)?.key).toBe('transport');
    expect(pickCategory('hostel rent Oct', 'expense', cats)?.key).toBe('hostel_rent');
    expect(pickCategory('Abbu sent pocket money', 'income', cats)?.key).toBe('pocket_money');
  });

  it('matches a custom category by its name', () => {
    expect(pickCategory('gym monthly fee', 'expense', cats)?.name).toBe('Gym');
  });

  it('returns nothing for unknown text', () => {
    expect(guessCategoryKeys('xyz', 'expense')).toEqual([]);
  });
});

describe('group splits', () => {
  it('splits equally with exact paisa', () => {
    const r = computeShares(1000_00, { mode: 'equal', members: ['a', 'b', 'c'] });
    expect(Object.values(r.shares).reduce((x, y) => x + y, 0)).toBe(1000_00);
    expect(r.error).toBeUndefined();
  });

  it('checks exact amounts and percentages add up', () => {
    expect(computeShares(1000_00, { mode: 'amount', amounts: { a: 600_00, b: 300_00 } })).toMatchObject({
      error: 'amountMismatch',
      diff: 100_00,
    });
    const p = computeShares(999_99, { mode: 'percent', percents: { a: 50, b: 25, c: 25 } });
    expect(p.error).toBeUndefined();
    expect(Object.values(p.shares).reduce((x, y) => x + y, 0)).toBe(999_99);
    expect(computeShares(100_00, { mode: 'percent', percents: { a: 50, b: 40 } }).error).toBe('percentMismatch');
  });

  it('splits item-wise and shares tax by what each person ordered', () => {
    const r = computeShares(0, {
      mode: 'items',
      items: [
        { name: 'Pizza', amount: 1200_00, members: ['a', 'b', 'c'] },
        { name: 'Shake', amount: 600_00, members: ['a'] },
      ],
      extra: 180_00,
    });
    expect(r.total).toBe(1980_00);
    // a: 400 + 600 = 1000 of 1800 → 100 of the 180 tax
    expect(r.shares.a).toBe(1100_00);
    expect(r.shares.b).toBe(440_00);
    expect(r.shares.c).toBe(440_00);
  });

  it('splits by weight without losing paisa', () => {
    const s = splitByWeight(100, { a: 1, b: 1, c: 1 });
    expect(s.a + s.b + s.c).toBe(100);
  });

  it('works out balances and the fewest payments', () => {
    // Me paid 3000 dinner for 3; Ali paid 1500 taxi for 3; Sara paid Me 500 back.
    const net = memberBalances(
      ['me', 'ali', 'sara'],
      [
        { paid_by: 'me', amount: 3000_00, shares: { me: 1000_00, ali: 1000_00, sara: 1000_00 } },
        { paid_by: 'ali', amount: 1500_00, shares: { me: 500_00, ali: 500_00, sara: 500_00 } },
      ],
      [{ from_member: 'sara', to_member: 'me', amount: 500_00 }],
    );
    expect(net).toEqual({ me: 1000_00, ali: 0, sara: -1000_00 });
    expect(simplifyDebts(net)).toEqual([{ from: 'sara', to: 'me', amount: 1000_00 }]);
  });

  it('settles a chain of debts in at most n-1 payments', () => {
    const transfers = simplifyDebts({ a: 300, b: -100, c: -100, d: -100 });
    expect(transfers).toHaveLength(3);
    expect(transfers.every((t) => t.to === 'a')).toBe(true);
  });
});

describe('budget helpers', () => {
  it('applies 50/30/20', () => {
    expect(fiftyThirtyTwenty(20000_00)).toEqual({
      needs: 10000_00,
      wants: 6000_00,
      savings: 4000_00,
      spending: 16000_00,
    });
  });

  it('suggests friendly limits from history', () => {
    const s = suggestLimits([
      new Map([['food', 3120_00]]),
      new Map([
        ['food', 2800_00],
        ['fun', 9000_00],
      ]),
    ]);
    expect(s.get('food')).toBe(3000_00);
    expect(s.get('fun')).toBe(4500_00);
    expect(roundUpFriendly(5001_00)).toBe(5500_00);
  });

  it('turns a daily allowance into a monthly budget and carries over savings', () => {
    expect(dailyAllowanceBudget(500_00, { start: '2026-10-01', end: '2026-10-31' })).toBe(15500_00);
    expect(rolloverAmount(10000_00, 8000_00)).toBe(2000_00);
    expect(rolloverAmount(10000_00, 12000_00)).toBe(0);
  });
});

describe('statement', () => {
  const acc = (id: string, opening = 0) => ({
    id,
    name: id,
    type: 'cash' as const,
    opening_balance: opening,
    archived: 0,
    sort: 0,
  });
  const tx = (o: Partial<import('../types').Transaction>) =>
    ({
      id: Math.random().toString(),
      type: 'expense',
      amount: 0,
      account_id: 'cash',
      to_account_id: null,
      category_id: null,
      date: '2026-10-01',
      note: '',
      recurring_id: null,
      created_at: 0,
      time: null,
      tags: '',
      receipt: null,
      split_id: null,
      group_expense_id: null,
      ...o,
    }) as import('../types').Transaction;

  it('computes opening, running and closing balances', () => {
    const s = buildStatement(
      [acc('cash', 1000_00), acc('bank')],
      [
        tx({ type: 'income', amount: 500_00, date: '2026-09-30' }),
        tx({ type: 'expense', amount: 200_00, date: '2026-10-02', time: '09:00' }),
        tx({ type: 'income', amount: 5000_00, account_id: 'bank', date: '2026-10-01' }),
        tx({ type: 'transfer', amount: 1000_00, account_id: 'bank', to_account_id: 'cash', date: '2026-10-03' }),
        tx({ type: 'expense', amount: 99_00, date: '2026-11-01' }),
      ],
      '2026-10-01',
      '2026-10-31',
    );
    expect(s.opening).toBe(1500_00);
    expect(s.lines.map((l) => l.balance)).toEqual([6500_00, 6300_00, 5300_00, 6300_00]);
    expect(s.closing).toBe(6300_00);
    expect(s.accounts.find((a) => a.account.id === 'cash')?.closing).toBe(2300_00);
  });

  it('shows a transfer to an unselected account as money out', () => {
    const s = buildStatement(
      [acc('bank', 100_00)],
      [tx({ type: 'transfer', amount: 40_00, account_id: 'bank', to_account_id: 'cash', date: '2026-10-05' })],
      '2026-10-01',
      '2026-10-31',
    );
    expect(s.lines).toHaveLength(1);
    expect(s.closing).toBe(60_00);
  });
});
