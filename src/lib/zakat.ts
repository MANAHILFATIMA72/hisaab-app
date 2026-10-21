// Zakat on wealth held for a lunar year: 2.5% of net zakatable assets, if they reach nisab.
// Nisab is 7.5 tola (87.48 g) of gold or 52.5 tola (612.36 g) of silver. Most Pakistani scholars
// advise the silver standard when assets are mixed because it is lower, so it is the default.

export const GRAMS_PER_TOLA = 11.664;
export const NISAB_GOLD_TOLA = 7.5;
export const NISAB_SILVER_TOLA = 52.5;
export const ZAKAT_RATE = 0.025;

export type ZakatInput = {
  cash: number; // minor units
  bank: number;
  goldTola: number;
  silverTola: number;
  goldPricePerTola: number; // minor units
  silverPricePerTola: number;
  businessStock: number;
  receivables: number; // money others owe you that you expect back
  liabilities: number; // debts due now
  nisabStandard: 'silver' | 'gold';
};

export type ZakatResult = {
  assets: number;
  net: number;
  nisab: number;
  eligible: boolean;
  zakat: number;
};

export function calculateZakat(i: ZakatInput): ZakatResult {
  const goldValue = Math.round(i.goldTola * i.goldPricePerTola);
  const silverValue = Math.round(i.silverTola * i.silverPricePerTola);
  const assets = i.cash + i.bank + goldValue + silverValue + i.businessStock + i.receivables;
  const net = Math.max(0, assets - i.liabilities);
  const nisab =
    i.nisabStandard === 'gold'
      ? Math.round(NISAB_GOLD_TOLA * i.goldPricePerTola)
      : Math.round(NISAB_SILVER_TOLA * i.silverPricePerTola);
  const eligible = nisab > 0 && net >= nisab;
  return { assets, net, nisab, eligible, zakat: eligible ? Math.round(net * ZAKAT_RATE) : 0 };
}
