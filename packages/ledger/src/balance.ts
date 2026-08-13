import { computeShares } from './split.js';
import { expenseTotal, roundToStep, toBaseCurrency } from './money.js';
import type { BalanceMap, ExpenseInput, PaymentInput, SettlementEdge } from './types.js';

function resolvedPayers(expense: ExpenseInput): { memberId: string; amount: number }[] {
  if (expense.payers && expense.payers.length > 0) {
    return expense.payers.filter((p) => p.amount > 0);
  }
  return [{ memberId: expense.payerId, amount: expenseTotal(expense) }];
}

/**
 * Positive balance = others owe this member (creditor).
 * Negative balance = this member owes others (debtor).
 */
export function computeBalances(
  expenses: ExpenseInput[],
  payments: PaymentInput[],
): BalanceMap {
  const balances: BalanceMap = {};

  const touch = (id: string) => {
    if (balances[id] === undefined) balances[id] = 0;
  };

  for (const expense of expenses) {
    const shares = computeShares(expense);
    const fx = expense.fxRate ?? 1;

    for (const payer of resolvedPayers(expense)) {
      touch(payer.memberId);
      balances[payer.memberId] += toBaseCurrency(payer.amount, fx);
    }

    for (const share of shares) {
      touch(share.memberId);
      balances[share.memberId] -= toBaseCurrency(share.amount, fx);
    }
  }

  for (const payment of payments) {
    const fx = payment.fxRate ?? 1;
    const amount = toBaseCurrency(payment.amount, fx);
    touch(payment.fromMemberId);
    touch(payment.toMemberId);

    if (payment.kind === 'settlement') {
      // from pays to → from debt decreases, to credit decreases
      balances[payment.fromMemberId] += amount;
      balances[payment.toMemberId] -= amount;
    } else {
      // loan: from lends to → from becomes creditor, to debtor
      balances[payment.fromMemberId] += amount;
      balances[payment.toMemberId] -= amount;
    }
  }

  // Clean near-zeros
  for (const id of Object.keys(balances)) {
    if (Math.abs(balances[id]) < 1) balances[id] = 0;
  }

  return balances;
}

/** Greedy minimize-transaction settlement. */
export function suggestSettlements(balances: BalanceMap, roundTo = 0): SettlementEdge[] {
  const debtors: { id: string; amount: number }[] = [];
  const creditors: { id: string; amount: number }[] = [];

  for (const [id, bal] of Object.entries(balances)) {
    if (bal < -0.5) debtors.push({ id, amount: -bal });
    else if (bal > 0.5) creditors.push({ id, amount: bal });
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const edges: SettlementEdge[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    if (pay > 0) {
      edges.push({
        fromMemberId: debtors[i].id,
        toMemberId: creditors[j].id,
        amount: Math.round(pay),
      });
    }
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount < 0.5) i += 1;
    if (creditors[j].amount < 0.5) j += 1;
  }

  const raw = edges.filter((e) => e.amount > 0);
  if (!roundTo || roundTo <= 0) return raw;
  return roundSettlementEdges(raw, roundTo);
}

/**
 * Round each edge to `step`. Absorb leftover so the net of rounded edges
 * stays as close as possible to the original net (largest edge takes remainder).
 */
export function roundSettlementEdges(edges: SettlementEdge[], step: number): SettlementEdge[] {
  if (!step || edges.length === 0) return edges;
  const rounded = edges.map((e) => ({
    ...e,
    amount: roundToStep(e.amount, step),
  }));
  const originalSum = edges.reduce((s, e) => s + e.amount, 0);
  const roundedSum = rounded.reduce((s, e) => s + e.amount, 0);
  let drift = originalSum - roundedSum;
  if (Math.abs(drift) < step / 2) {
    return rounded.filter((e) => e.amount > 0);
  }
  const idx = rounded.reduce(
    (best, e, i) => (e.amount >= rounded[best].amount ? i : best),
    0,
  );
  const adjust = roundToStep(drift, step);
  rounded[idx] = { ...rounded[idx], amount: Math.max(0, rounded[idx].amount + adjust) };
  return rounded.filter((e) => e.amount > 0);
}

export function memberNet(balances: BalanceMap, memberId: string): number {
  return balances[memberId] ?? 0;
}
