import type { ExpenseInput, TaxInput } from './types.js';

/** Round to nearest integer currency unit (half-up). */
export function roundMoney(n: number): number {
  return Math.round(n);
}

export function applyTax(baseAmount: number, tax?: TaxInput): number {
  if (!tax || tax.type === 'none') return baseAmount;
  if (tax.type === 'percent') {
    return roundMoney(baseAmount + (baseAmount * tax.value) / 100);
  }
  return roundMoney(baseAmount + tax.value);
}

/**
 * Order: base → service → tax → tip.
 * Service and tax are typically percent of the running subtotal; tip last.
 */
export function expenseTotal(expense: ExpenseInput): number {
  const afterService = applyTax(expense.amount, expense.service);
  const afterTax = applyTax(afterService, expense.tax);
  return applyTax(afterTax, expense.tip);
}

export function toBaseCurrency(amount: number, fxRate = 1): number {
  return roundMoney(amount * fxRate);
}

/**
 * Rate that converts `from` into `periodCurrency`. `rates` are تومان per 1 unit of each code.
 * تومان↔ریال is fixed (×10) and needs no live rate. Returns 0 when unknown.
 */
export function rateToPeriod(rates: Record<string, number>, from: string, periodCurrency: string): number {
  if (from === periodCurrency) return 1;
  const tomanPerFrom = from === 'IRT' ? 1 : from === 'IRR' ? 0.1 : rates[from];
  if (!tomanPerFrom) return 0;
  if (periodCurrency === 'IRT') return tomanPerFrom;
  if (periodCurrency === 'IRR') return tomanPerFrom * 10;
  const tomanPerPeriod = rates[periodCurrency];
  if (!tomanPerPeriod) return 0;
  return tomanPerFrom / tomanPerPeriod;
}

/**
 * Convert a stored fxRate (amount × rate = period currency) from one period currency to another.
 * Returns null when the conversion factor is unknown so callers can abort.
 */
export function rebaseFxRate(
  oldFxRate: number,
  fromPeriodCurrency: string,
  toPeriodCurrency: string,
  rates: Record<string, number>,
): number | null {
  if (fromPeriodCurrency === toPeriodCurrency) return oldFxRate;
  const factor = rateToPeriod(rates, fromPeriodCurrency, toPeriodCurrency);
  if (!factor) return null;
  return oldFxRate * factor;
}

/** Round a settlement amount to the nearest step; 0 means no rounding. */
export function roundToStep(amount: number, step: number): number {
  if (!step || step <= 0) return roundMoney(amount);
  return roundMoney(amount / step) * step;
}
