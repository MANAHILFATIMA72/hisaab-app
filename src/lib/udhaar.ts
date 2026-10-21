import type { ISODate } from './dates';
import type { Udhaar, UdhaarPayment } from './types';

export type UdhaarWithBalance = Udhaar & { paid: number; remaining: number; settled: boolean };

export function withBalances(items: Udhaar[], payments: UdhaarPayment[]): UdhaarWithBalance[] {
  const paidById = new Map<string, number>();
  for (const p of payments) paidById.set(p.udhaar_id, (paidById.get(p.udhaar_id) ?? 0) + p.amount);
  return items.map((u) => {
    const paid = paidById.get(u.id) ?? 0;
    const remaining = Math.max(0, u.amount - paid);
    return { ...u, paid, remaining, settled: remaining === 0 };
  });
}

/** "Mujhe milna hai" (to receive) and "mujhe dena hai" (to pay) totals over open entries. */
export function totals(items: UdhaarWithBalance[]): { toReceive: number; toPay: number } {
  let toReceive = 0;
  let toPay = 0;
  for (const u of items) {
    if (u.direction === 'given') toReceive += u.remaining;
    else toPay += u.remaining;
  }
  return { toReceive, toPay };
}

export type PersonSummary = { person: string; phone: string; net: number; open: number };

/** Groups entries by person. Positive net = they owe me. */
export function byPerson(items: UdhaarWithBalance[]): PersonSummary[] {
  const map = new Map<string, PersonSummary>();
  for (const u of items) {
    const key = u.person.trim().toLowerCase();
    const s = map.get(key) ?? { person: u.person.trim(), phone: u.phone, net: 0, open: 0 };
    s.net += u.direction === 'given' ? u.remaining : -u.remaining;
    if (!u.settled) s.open += 1;
    if (!s.phone && u.phone) s.phone = u.phone;
    map.set(key, s);
  }
  return [...map.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

export function isOverdue(u: UdhaarWithBalance, todayDate: ISODate): boolean {
  return !u.settled && !!u.due_date && u.due_date < todayDate;
}

/** Converts a Pakistani mobile number like 0300-1234567 to the international form wa.me expects. */
export function toWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('92') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `92${digits.slice(1)}`;
  if (digits.startsWith('3') && digits.length === 10) return `92${digits}`;
  if (digits.length >= 8) return digits;
  return null;
}

export function whatsAppUrl(phone: string, message: string): string {
  const number = toWhatsAppNumber(phone);
  const text = encodeURIComponent(message);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}
