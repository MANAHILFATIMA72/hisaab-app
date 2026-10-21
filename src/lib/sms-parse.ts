// Parses a bank or wallet SMS that the user pastes into the app. No SMS permission is used:
// the user copies the message themselves, which keeps the app clear of Play's SMS policy.

export type ParsedSms = {
  amount: number; // minor units
  type: 'income' | 'expense';
  merchant: string | null;
};

const AMOUNT = /(?:rs\.?|pkr)\s*([\d,]+(?:\.\d{1,2})?)/i;
const AMOUNT_AFTER = /([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|pkr)/i;

const CREDIT_WORDS = /\b(credited|received|deposit(?:ed)?|cr\b|credit(?! card)|refund(?:ed)?|you have received)/i;
const DEBIT_WORDS =
  /\b(debited|spent|paid|sent|withdrawn|withdrawal|purchase|dr\b|debit|transferred to|payment of|bill payment)/i;

const MERCHANT =
  /\b(?:at|to|from)\s+([A-Za-z0-9&.'\- ]{2,40}?)(?=\s+(?:on|via|ref|from|for|dated|at|is|has|with|trx|tid)\b|[.,]|$)/i;

export function parseSms(text: string): ParsedSms | null {
  const m = text.match(AMOUNT) ?? text.match(AMOUNT_AFTER);
  if (!m) return null;
  const amount = Math.round(parseFloat(m[1].replace(/,/g, '')) * 100);
  if (!amount) return null;

  const creditIdx = text.search(CREDIT_WORDS);
  const debitIdx = text.search(DEBIT_WORDS);
  let type: 'income' | 'expense';
  if (creditIdx >= 0 && (debitIdx < 0 || creditIdx < debitIdx)) type = 'income';
  else type = 'expense';

  const merchantMatch = text.match(MERCHANT);
  const merchant = merchantMatch ? merchantMatch[1].trim().replace(/\s+/g, ' ') : null;
  return { amount, type, merchant: merchant && !/^(your|a\/c|ac|account)\b/i.test(merchant) ? merchant : null };
}
