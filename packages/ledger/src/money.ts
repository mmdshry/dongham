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

/** Round a settlement amount to the nearest step; 0 means no rounding. */
export function roundToStep(amount: number, step: number): number {
  if (!step || step <= 0) return roundMoney(amount);
  return roundMoney(amount / step) * step;
}
