export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(header: string[], rows: (string | number | null | undefined)[][]): string {
  // Leading BOM lets Excel open Urdu text correctly.
  return '﻿' + [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
}
