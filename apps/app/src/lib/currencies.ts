import { CURRENCY_CATALOG, currencyInfo } from './currencyCatalog';

export type CurrencyCode = string;

export const CURRENCIES: Record<string, { fa: string; en: string }> = Object.fromEntries(
  CURRENCY_CATALOG.map((c) => [c.code, { fa: c.nameFa, en: c.code }]),
);

export const PERIOD_CURRENCY_CODES = CURRENCY_CATALOG.filter((c) => c.group !== 'other').map((c) => c.code);

export const FX_CURRENCY_CODES = CURRENCY_CATALOG.filter((c) => c.code !== 'IRT' && c.code !== 'IRR').map((c) => c.code);

export function currencyLabel(code: string): string {
  return currencyInfo(code).nameFa;
}
