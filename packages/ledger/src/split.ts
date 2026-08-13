import { expenseTotal, roundMoney } from './money.js';
import type { ComputedShare, ExpenseInput, ExpenseShareInput, SplitMode } from './types.js';

function activeShares(shares: ExpenseShareInput[]): ExpenseShareInput[] {
  return shares.filter((s) => !s.excluded);
}

function distributeRemainder(
  total: number,
  parts: { memberId: string; raw: number }[],
): ComputedShare[] {
  const floored = parts.map((p) => ({
    memberId: p.memberId,
    amount: Math.floor(p.raw),
    frac: p.raw - Math.floor(p.raw),
  }));
  let allocated = floored.reduce((s, p) => s + p.amount, 0);
  let remainder = total - allocated;
  const byFrac = [...floored].sort((a, b) => b.frac - a.frac || a.memberId.localeCompare(b.memberId));
  let i = 0;
  while (remainder > 0 && byFrac.length > 0) {
    byFrac[i % byFrac.length].amount += 1;
    remainder -= 1;
    i += 1;
  }
  // If over-allocated due to rounding quirks, trim from largest
  while (remainder < 0 && byFrac.length > 0) {
    const idx = byFrac.findIndex((p) => p.amount > 0);
    if (idx < 0) break;
    byFrac[idx].amount -= 1;
    remainder += 1;
  }
  return floored.map((p) => ({ memberId: p.memberId, amount: p.amount }));
}

export function splitEqual(total: number, shares: ExpenseShareInput[]): ComputedShare[] {
  const active = activeShares(shares);
  if (active.length === 0) return [];
  const each = total / active.length;
  return distributeRemainder(
    total,
    active.map((s) => ({ memberId: s.memberId, raw: each })),
  );
}

export function splitByWeight(total: number, shares: ExpenseShareInput[]): ComputedShare[] {
  const active = activeShares(shares).filter((s) => s.value > 0);
  if (active.length === 0) return [];
  const weightSum = active.reduce((s, x) => s + x.value, 0);
  return distributeRemainder(
    total,
    active.map((s) => ({ memberId: s.memberId, raw: (total * s.value) / weightSum })),
  );
}

export function splitExact(total: number, shares: ExpenseShareInput[]): ComputedShare[] {
  const active = activeShares(shares);
  const result = active.map((s) => ({
    memberId: s.memberId,
    amount: roundMoney(s.value),
  }));
  const sum = result.reduce((s, x) => s + x.amount, 0);
  if (sum !== total) {
    throw new Error(`EXACT_SPLIT_MISMATCH: shares sum ${sum} !== total ${total}`);
  }
  return result;
}

export function splitPercent(total: number, shares: ExpenseShareInput[]): ComputedShare[] {
  const active = activeShares(shares);
  const pctSum = active.reduce((s, x) => s + x.value, 0);
  if (Math.abs(pctSum - 100) > 0.001 && active.length > 0) {
    throw new Error(`PERCENT_SPLIT_MISMATCH: percentages sum ${pctSum} !== 100`);
  }
  return distributeRemainder(
    total,
    active.map((s) => ({ memberId: s.memberId, raw: (total * s.value) / 100 })),
  );
}

export function computeShares(expense: ExpenseInput): ComputedShare[] {
  const total = expenseTotal(expense);
  const mode: SplitMode = expense.splitMode;
  switch (mode) {
    case 'equal':
      return splitEqual(total, expense.shares);
    case 'weight':
      return splitByWeight(total, expense.shares);
    case 'exact':
      return splitExact(total, expense.shares);
    case 'percent':
      return splitPercent(total, expense.shares);
    default:
      throw new Error(`UNKNOWN_SPLIT_MODE: ${mode}`);
  }
}

/** Validate share inputs before save (UI can call this). */
export function validateShares(
  mode: SplitMode,
  total: number,
  shares: ExpenseShareInput[],
): { ok: true } | { ok: false; error: string } {
  try {
    computeShares({
      id: 'tmp',
      title: '',
      amount: total,
      currency: 'IRT',
      payerId: shares[0]?.memberId ?? '',
      splitMode: mode,
      shares,
      tax: { type: 'none', value: 0 },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
