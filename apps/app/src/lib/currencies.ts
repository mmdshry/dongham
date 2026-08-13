export type CurrencyCode = 'IRT' | 'IRR' | 'USD' | 'EUR' | 'TRY' | 'AED' | 'IQD' | 'XAU';

export const CURRENCIES: Record<string, { fa: string; en: string }> = {
  IRT: { fa: 'تومان', en: 'Toman' },
  IRR: { fa: 'ریال', en: 'Rial' },
  USD: { fa: 'دلار آمریکا', en: 'USD' },
  EUR: { fa: 'یورو', en: 'EUR' },
  TRY: { fa: 'لیر ترکیه', en: 'TRY' },
  AED: { fa: 'درهم امارات', en: 'AED' },
  IQD: { fa: 'دینار عراق', en: 'IQD' },
  XAU: { fa: 'طلا ۱۸ عیار', en: '18k Gold' },
};

export const PERIOD_CURRENCY_CODES = ['IRT', 'IRR', 'USD', 'EUR', 'TRY', 'AED', 'IQD'] as const;

export const FX_CURRENCY_CODES = ['USD', 'EUR', 'TRY', 'AED', 'IQD', 'XAU'] as const;

export function currencyLabel(code: string): string {
  const row = CURRENCIES[code];
  if (!row) return code;
  return row.fa;
}
