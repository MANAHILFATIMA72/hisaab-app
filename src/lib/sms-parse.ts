// Parses a bank or wallet SMS that the user pastes into the app. No SMS permission is used:
// the user copies the message themselves, which keeps the app clear of Play's SMS policy.

import type { ISODate } from './dates';

export type SmsKind = 'income' | 'expense' | 'withdrawal';
export type SmsChannel = 'card' | 'atm' | 'transfer' | 'bill' | 'wallet' | null;

export type ParsedSms = {
  amount: number; // minor units
  /** 'withdrawal' = cash taken out at an ATM, which is a transfer from the bank to cash. */
  kind: SmsKind;
  type: 'income' | 'expense';
  merchant: string | null;
  bank: string | null; // display name, e.g. 'HBL'
  bankType: 'bank' | 'wallet' | null;
  last4: string | null; // last digits of the card or account
  channel: SmsChannel;
  date: ISODate | null;
  time: string | null; // 'HH:MM', 24 hour
  balance: number | null; // available balance after the transaction, minor units
  fee: number | null;
  reference: string | null;
};

// Order matters: wallets run by banks (HBL Konnect, Meezan's) must match before the bank itself.
const BANKS: { name: string; type: 'bank' | 'wallet'; re: RegExp }[] = [
  { name: 'JazzCash', type: 'wallet', re: /jazz\s?cash|mobilink\s?bank/i },
  { name: 'Easypaisa', type: 'wallet', re: /easy\s?paisa|telenor\s?(?:microfinance|bank)/i },
  { name: 'SadaPay', type: 'wallet', re: /sada\s?pay/i },
  { name: 'NayaPay', type: 'wallet', re: /naya\s?pay/i },
  { name: 'HBL Konnect', type: 'wallet', re: /konnect/i },
  { name: 'UPaisa', type: 'wallet', re: /u\s?paisa/i },
  { name: 'Meezan', type: 'bank', re: /meezan/i },
  { name: 'Bank Alfalah', type: 'bank', re: /alfalah|\bbafl\b/i },
  { name: 'Bank Al Habib', type: 'bank', re: /al[\s-]?habib|\bbahl\b/i },
  { name: 'Habib Metro', type: 'bank', re: /habib\s?metro|\bhmb\b/i },
  { name: 'HBL', type: 'bank', re: /\bhbl\b|habib\s?bank/i },
  { name: 'MCB', type: 'bank', re: /\bmcb\b|muslim\s?commercial/i },
  { name: 'UBL', type: 'bank', re: /\bubl\b|united\s?bank/i },
  { name: 'Allied Bank', type: 'bank', re: /\babl\b|allied\s?bank/i },
  { name: 'Askari', type: 'bank', re: /askari/i },
  { name: 'Faysal Bank', type: 'bank', re: /faysal|\bfbl\b/i },
  { name: 'Standard Chartered', type: 'bank', re: /standard\s?chartered|\bscb\b/i },
  { name: 'BankIslami', type: 'bank', re: /bank\s?islami/i },
  { name: 'Dubai Islamic', type: 'bank', re: /dubai\s?islamic|\bdib\b/i },
  { name: 'JS Bank', type: 'bank', re: /\bjs\s?bank\b/i },
  { name: 'Bank of Punjab', type: 'bank', re: /bank\s?of\s?punjab|\bbop\b/i },
  { name: 'NBP', type: 'bank', re: /\bnbp\b|national\s?bank/i },
  { name: 'Soneri', type: 'bank', re: /soneri/i },
  { name: 'Silk Bank', type: 'bank', re: /silk\s?bank/i },
  { name: 'Al Baraka', type: 'bank', re: /al\s?baraka/i },
  { name: 'Sindh Bank', type: 'bank', re: /sindh\s?bank/i },
  { name: 'Bank of Khyber', type: 'bank', re: /bank\s?of\s?khyber|\bbok\b/i },
];

const NUM = '([\\d,]+(?:\\.\\d{1,2})?)';
const CUR = '(?:rs\\.?|pkr)';
const AMOUNT_RE = new RegExp(`${CUR}\\s*${NUM}|${NUM}\\s*${CUR}`, 'gi');

// Words that mark an amount as something other than the transaction amount.
const BALANCE_BEFORE =
  /(?:bal(?:ance)?|avl\.?|available|limit|fee|charges?|fed|tax)\s*(?:is|:|of|bal(?:ance)?)?\s*[:.]?\s*$/i;
const FEE_BEFORE = /(?:fee|charges?)\s*(?:of|:)?\s*$/i;

const CREDIT_WORDS =
  /\b(credited|received|deposit(?:ed)?|cr\b|credit(?! card)|refund(?:ed)?|you have received|has been added|reversed|cashback)/i;
const DEBIT_WORDS =
  /\b(debited|charged|spent|paid|sent|withdrawn|withdrawal|purchase|dr\b|debit|transferred|payment of|bill payment|deducted|used at)/i;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const STOP =
  '(?=\\s+(?:on|via|ref|from|for|dated|at|is|has|with|trx|tid|txn|using|through|dt|date)\\b|\\s*[.,;(]|\\s+\\d{2}[-/]|\\s+0?3\\d{2}|$)';
const MERCHANT_RE = new RegExp(`\\b(?:at|to|from|towards)\\s+([A-Za-z0-9&*'\\-. ]{2,40}?)${STOP}`, 'gi');
const NOT_MERCHANT =
  /^(your|you|a\/c|ac|acc|account|atm|the|pkr|rs|card|debit|credit|wallet|mobile|ibft|raast|\d+|x+\d*|\*+\d*)\b/i;

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function toMinor(s: string): number {
  return Math.round(parseFloat(s.replace(/,/g, '')) * 100);
}

function validDate(y: number, m: number, d: number): ISODate | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Finds a date written in any of the formats Pakistani banks use. Day comes before month. */
export function findDate(text: string): ISODate | null {
  let m = text.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = text.match(/\b(\d{1,2})[-/ .]([A-Za-z]{3})[A-Za-z]*[-/ ,.]+(\d{2,4})\b/);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    if (month) return validDate(+m[3], month, +m[1]);
  }
  m = text.match(/\b([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    if (month) return validDate(+m[3], month, +m[2]);
  }
  m = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) return validDate(+m[3], +m[2], +m[1]);
  return null;
}

/** Finds a time like 14:32, 2:32 PM or 14:32:10 and returns 'HH:MM'. */
export function findTime(text: string): string | null {
  const m = text.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i);
  if (!m) return null;
  let h = +m[1];
  const min = +m[2];
  const ampm = m[3]?.toLowerCase().replace(/\./g, '');
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

function findLast4(text: string): string | null {
  const m =
    text.match(
      /(?:card|a\/c|acc(?:oun)?t?|ac)\s*(?:no\.?|number|#|ending(?:\s+(?:in|with))?)?\s*[:.]?\s*[x*.\d-]*?(\d{3,4})\b/i,
    ) ?? text.match(/\b[x*]{2,}[-\s]?(\d{3,4})\b/i);
  return m ? m[1] : null;
}

function findChannel(text: string): SmsChannel {
  if (/\batm\b|cash withdrawal/i.test(text)) return 'atm';
  if (/\b(bill|utility|k-?electric|lesco|iesco|sngpl|ssgc|ptcl)\b/i.test(text)) return 'bill';
  if (/\b(pos|card|purchase|e-?commerce|online shopping)\b/i.test(text)) return 'card';
  if (/\b(ibft|raast|fund transfer|transferred|sent to|received from|ift)\b/i.test(text)) return 'transfer';
  return null;
}

function cleanMerchant(raw: string): string | null {
  const s = raw
    .replace(/\s+/g, ' ')
    .replace(/\s*\d{4,}.*$/, '') // trailing phone or account numbers
    .replace(/[-.*]+$/, '')
    .trim();
  if (s.length < 2 || NOT_MERCHANT.test(s)) return null;
  for (const b of BANKS) if (b.re.test(s) && s.split(' ').length <= 3) return null;
  return s;
}

export function parseSms(text: string): ParsedSms | null {
  const flat = text.replace(/\s+/g, ' ').trim();

  // Pick the first amount that is not a balance, limit or fee.
  let amount = 0;
  let balance: number | null = null;
  let fee: number | null = null;
  for (const m of flat.matchAll(AMOUNT_RE)) {
    const value = toMinor(m[1] ?? m[2]);
    const before = flat.slice(Math.max(0, (m.index ?? 0) - 25), m.index);
    if (FEE_BEFORE.test(before)) {
      fee ??= value;
    } else if (BALANCE_BEFORE.test(before)) {
      balance ??= value;
    } else if (!amount && value) {
      amount = value;
    }
  }
  if (!amount) return null;

  const creditIdx = flat.search(CREDIT_WORDS);
  const debitIdx = flat.search(DEBIT_WORDS);
  const channel = findChannel(flat);
  let kind: SmsKind;
  if (creditIdx >= 0 && (debitIdx < 0 || creditIdx < debitIdx)) kind = 'income';
  else if (channel === 'atm' && /withdr|cash/i.test(flat)) kind = 'withdrawal';
  else kind = 'expense';

  const bank = BANKS.find((b) => b.re.test(flat)) ?? null;

  let merchant: string | null = null;
  for (const m of flat.matchAll(MERCHANT_RE)) {
    // For money received, "from X" names the sender; for spending, "at X" or "to X" names the shop or person.
    const word = m[0].trim().split(/\s+/)[0].toLowerCase();
    if (kind === 'income' && word !== 'from') continue;
    if (kind !== 'income' && word === 'from') continue;
    merchant = cleanMerchant(m[1]);
    if (merchant) break;
  }

  const ref = flat.match(
    /\b(?:tid|trx\s?id|txn\s?id|ref(?:erence)?\s?(?:no|#)?|transaction id|rrn)\s*[:.#]?\s*([A-Za-z0-9]{5,})/i,
  );

  return {
    amount,
    kind,
    type: kind === 'income' ? 'income' : 'expense',
    merchant: kind === 'withdrawal' ? null : merchant,
    bank: bank?.name ?? null,
    bankType: bank?.type ?? null,
    last4: findLast4(flat),
    channel,
    date: findDate(flat),
    time: findTime(flat),
    balance,
    fee,
    reference: ref ? ref[1] : null,
  };
}
