// All amounts are stored as integer minor units (paisa) to avoid float rounding.

export const CURRENCIES = ['PKR', 'USD', 'AED', 'SAR', 'GBP', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];

const SYMBOLS: Record<string, string> = {
  PKR: 'Rs',
  USD: '$',
  AED: 'AED',
  SAR: 'SAR',
  GBP: '£',
  EUR: '€',
};

export function toMinor(major: number): number {
  return Math.round(major * 100);
}

export function toMajor(minor: number): number {
  return minor / 100;
}

/** Parses user input like "1,250.50" or "1250" into minor units. Returns null for invalid input. */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, '').replace(/^(rs\.?|pkr)/i, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const value = Math.round(parseFloat(cleaned) * 100);
  return value > 0 ? value : null;
}

/** Groups digits the way they are usually written in Pakistan: 1,00,000 for one lakh. */
function groupSouthAsian(intPart: string): string {
  if (intPart.length <= 3) return intPart;
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

function groupWestern(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatMoney(
  minor: number,
  currency: string = 'PKR',
  opts: { hidden?: boolean; showSign?: boolean; decimals?: boolean } = {},
): string {
  const symbol = SYMBOLS[currency] ?? currency;
  if (opts.hidden) return `${symbol} ••••`;
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100).toString();
  const frac = abs % 100;
  const grouped = currency === 'PKR' ? groupSouthAsian(whole) : groupWestern(whole);
  const showDecimals = opts.decimals ?? frac !== 0;
  const body = showDecimals ? `${grouped}.${frac.toString().padStart(2, '0')}` : grouped;
  const sign = negative ? '-' : opts.showSign && minor > 0 ? '+' : '';
  return `${sign}${symbol} ${body}`;
}

/** Splits an amount into n parts that add back to the exact total (remainder paisa go to the first parts). */
export function splitEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}
