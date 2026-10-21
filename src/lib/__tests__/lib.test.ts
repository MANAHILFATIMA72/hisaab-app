import { describe, expect, it } from 'vitest';

import { budgetStatus, crossedThresholds, safeToSpend } from '../budget';
import { toCSV } from '../csv';
import { addMonths, daysLeftInPeriod, periodContaining, previousPeriod } from '../dates';
import { formatMoney, parseAmount, splitEvenly } from '../money';
import { dueOccurrences, upcomingBillsTotal, upcomingTotal } from '../recurring';
import { byCategory, insights, percentChange, summarize } from '../reports';
import { parseSms } from '../sms-parse';
import type { Udhaar } from '../types';
import { byPerson, toWhatsAppNumber, totals, withBalances } from '../udhaar';
import { calculateZakat } from '../zakat';

describe('money', () => {
  it('parses user input to paisa', () => {
    expect(parseAmount('1,250.5')).toBe(125050);
    expect(parseAmount('Rs 500')).toBe(50000);
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('12.345')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });

  it('formats PKR with lakh grouping', () => {
    expect(formatMoney(10000000, 'PKR')).toBe('Rs 1,00,000');
    expect(formatMoney(123456789, 'PKR')).toBe('Rs 12,34,567.89');
    expect(formatMoney(-50000, 'PKR')).toBe('-Rs 500');
    expect(formatMoney(10000000, 'USD')).toBe('$ 100,000');
    expect(formatMoney(500, 'PKR', { hidden: true })).toBe('Rs ••••');
  });

  it('splits without losing paisa', () => {
    const parts = splitEvenly(1000, 3);
    expect(parts).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });
});

describe('dates and periods', () => {
  it('uses calendar month when start day is 1', () => {
    expect(periodContaining('2026-10-21', 1)).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });

  it('uses salary day as month start', () => {
    expect(periodContaining('2026-10-03', 25)).toEqual({ start: '2026-09-25', end: '2026-10-24' });
    expect(periodContaining('2026-10-25', 25)).toEqual({ start: '2026-10-25', end: '2026-11-24' });
  });

  it('handles start day past the end of short months', () => {
    expect(periodContaining('2026-02-28', 31)).toEqual({ start: '2026-02-28', end: '2026-03-30' });
    expect(periodContaining('2026-01-15', 31)).toEqual({ start: '2025-12-31', end: '2026-01-30' });
  });

  it('wraps across the year', () => {
    expect(periodContaining('2026-01-05', 10)).toEqual({ start: '2025-12-10', end: '2026-01-09' });
    expect(previousPeriod({ start: '2026-01-01', end: '2026-01-31' }, 1)).toEqual({
      start: '2025-12-01',
      end: '2025-12-31',
    });
  });

  it('counts days left including today', () => {
    expect(daysLeftInPeriod({ start: '2026-10-01', end: '2026-10-31' }, '2026-10-31')).toBe(1);
    expect(daysLeftInPeriod({ start: '2026-10-01', end: '2026-10-31' }, '2026-10-21')).toBe(11);
  });

  it('clamps month addition', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
  });
});

describe('budget', () => {
  it('reports status', () => {
    expect(budgetStatus(70, 100)).toBe('ok');
    expect(budgetStatus(80, 100)).toBe('warning');
    expect(budgetStatus(100, 100)).toBe('over');
  });

  it('fires each threshold once', () => {
    expect(crossedThresholds(70, 15, 100)).toEqual([80]);
    expect(crossedThresholds(85, 10, 100)).toEqual([]);
    expect(crossedThresholds(85, 20, 100)).toEqual([100]);
    expect(crossedThresholds(10, 200, 100)).toEqual([100]);
  });

  it('computes safe to spend from the budget', () => {
    const r = safeToSpend({
      period: { start: '2026-10-01', end: '2026-10-31' },
      today: '2026-10-22',
      budget: 50000_00,
      income: 0,
      spent: 30000_00,
      upcoming: 5000_00,
      spentToday: 0,
    });
    // 15,000 left over 10 days
    expect(r.perDay).toBe(1500_00);
    expect(r.today).toBe(1500_00);
    expect(r.basis).toBe('budget');
  });

  it('shrinks today as the user spends today', () => {
    const r = safeToSpend({
      period: { start: '2026-10-01', end: '2026-10-31' },
      today: '2026-10-22',
      budget: 50000_00,
      income: 0,
      spent: 31000_00,
      upcoming: 5000_00,
      spentToday: 1000_00,
    });
    expect(r.perDay).toBe(1500_00);
    expect(r.today).toBe(500_00);
  });

  it('never goes negative', () => {
    const r = safeToSpend({
      period: { start: '2026-10-01', end: '2026-10-31' },
      today: '2026-10-22',
      budget: 100,
      income: 0,
      spent: 500,
      upcoming: 0,
      spentToday: 0,
    });
    expect(r.today).toBe(0);
    expect(r.remaining).toBe(-400);
  });
});

describe('recurring', () => {
  it('lists due monthly occurrences and keeps the anchor day', () => {
    const r = dueOccurrences('2026-01-31', 'monthly', '2026-04-15');
    expect(r.dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(r.next).toBe('2026-04-30');
  });

  it('sums upcoming expenses within the period', () => {
    const total = upcomingTotal(
      [
        { amount: 100, frequency: 'weekly', next_date: '2026-10-23' },
        { amount: 5000, frequency: 'monthly', next_date: '2026-11-01' },
      ],
      '2026-10-21',
      '2026-10-31',
    );
    expect(total).toBe(200); // Oct 23 and Oct 30
  });
});

const u = (over: Partial<Udhaar>): Udhaar => ({
  id: 'x',
  person: 'Ali',
  phone: '',
  direction: 'given',
  amount: 1000,
  date: '2026-10-01',
  due_date: null,
  reason: '',
  created_at: 0,
  ...over,
});

describe('udhaar', () => {
  it('computes balances and totals', () => {
    const items = withBalances(
      [u({ id: 'a', amount: 1000 }), u({ id: 'b', direction: 'taken', amount: 500, person: 'Sara' })],
      [{ id: 'p', udhaar_id: 'a', amount: 400, date: '2026-10-05', note: '' }],
    );
    expect(items[0].remaining).toBe(600);
    expect(totals(items)).toEqual({ toReceive: 600, toPay: 500 });
  });

  it('nets per person', () => {
    const items = withBalances(
      [u({ id: 'a', amount: 1000 }), u({ id: 'b', direction: 'taken', amount: 300, person: 'ali ' })],
      [],
    );
    expect(byPerson(items)).toEqual([{ person: 'Ali', phone: '', net: 700, open: 2 }]);
  });

  it('normalizes Pakistani numbers for WhatsApp', () => {
    expect(toWhatsAppNumber('0300-1234567')).toBe('923001234567');
    expect(toWhatsAppNumber('+92 300 1234567')).toBe('923001234567');
    expect(toWhatsAppNumber('3001234567')).toBe('923001234567');
    expect(toWhatsAppNumber('')).toBeNull();
  });
});

describe('reports', () => {
  const cur = [
    { type: 'income' as const, amount: 1000, category_id: 'sal' },
    { type: 'expense' as const, amount: 400, category_id: 'food' },
    { type: 'expense' as const, amount: 100, category_id: 'bills' },
  ];
  const prev = [
    { type: 'income' as const, amount: 1000, category_id: 'sal' },
    { type: 'expense' as const, amount: 200, category_id: 'food' },
    { type: 'expense' as const, amount: 100, category_id: 'bills' },
  ];

  it('summarizes', () => {
    expect(summarize(cur)).toEqual({ income: 1000, expense: 500, savings: 500 });
    expect(byCategory(cur)[0]).toEqual({ categoryId: 'food', amount: 400, share: 0.8 });
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(150, 0)).toBeNull();
  });

  it('produces insights', () => {
    const list = insights(cur, prev);
    expect(list).toContainEqual({ kind: 'spentMore', percent: 67 });
    expect(list).toContainEqual({ kind: 'categoryUp', categoryId: 'food', percent: 100 });
    expect(list).toContainEqual({ kind: 'topCategory', categoryId: 'food', share: 0.8 });
  });
});

describe('zakat', () => {
  it('applies 2.5% above nisab', () => {
    const r = calculateZakat({
      cash: 200000_00,
      bank: 300000_00,
      goldTola: 0,
      silverTola: 0,
      goldPricePerTola: 280000_00,
      silverPricePerTola: 3000_00,
      businessStock: 0,
      receivables: 0,
      liabilities: 100000_00,
      nisabStandard: 'silver',
    });
    expect(r.nisab).toBe(157500_00);
    expect(r.net).toBe(400000_00);
    expect(r.zakat).toBe(10000_00);
  });

  it('is zero below nisab', () => {
    const r = calculateZakat({
      cash: 100000_00,
      bank: 0,
      goldTola: 0,
      silverTola: 0,
      goldPricePerTola: 280000_00,
      silverPricePerTola: 3000_00,
      businessStock: 0,
      receivables: 0,
      liabilities: 0,
      nisabStandard: 'silver',
    });
    expect(r.eligible).toBe(false);
    expect(r.zakat).toBe(0);
  });
});

describe('csv', () => {
  it('escapes and adds BOM', () => {
    expect(toCSV(['a', 'b'], [['x,y', 'he said "hi"']])).toBe('﻿a,b\r\n"x,y","he said ""hi"""');
  });
});

describe('sms parsing', () => {
  it('reads a debit', () => {
    expect(parseSms('Rs.1,250.00 debited from your A/C **1234 at KFC GULBERG on 21-Oct-26. Avl Bal Rs 20,000')).toEqual(
      { amount: 125000, type: 'expense', merchant: 'KFC GULBERG' },
    );
  });

  it('reads a wallet credit', () => {
    expect(parseSms('You have received Rs 5000.00 from ALI KHAN via JazzCash. TID 123')).toEqual({
      amount: 500000,
      type: 'income',
      merchant: 'ALI KHAN',
    });
  });

  it('reads PKR after the number', () => {
    expect(parseSms('Payment of 799 PKR to Netflix successful')?.amount).toBe(79900);
  });

  it('returns null without an amount', () => {
    expect(parseSms('Your OTP is 1234')).toBeNull();
  });
});

describe('bills', () => {
  it('counts bills due later in the period', () => {
    const bills = [
      { amount: 3000, due_day: 25, active: 1 },
      { amount: 1000, due_day: 5, active: 1 },
      { amount: 999, due_day: 28, active: 0 },
    ];
    // Period Oct 21 – Nov 20: the 25th (Oct) and the 5th (Nov) are both still ahead.
    expect(upcomingBillsTotal(bills, '2026-10-21', '2026-11-20')).toBe(4000);
    expect(upcomingBillsTotal([{ amount: 500, due_day: 31, active: 1 }], '2026-02-01', '2026-02-28')).toBe(500);
  });
});
