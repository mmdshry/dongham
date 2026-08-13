import { computeBalances, computeShares, suggestSettlements } from '@dongham/ledger';
import type { LocalExpense, LocalMember, LocalPayment, LocalPeriod } from './db';
import { noneCharge } from './db';
import { rateToPeriod, type FxRates } from './fx';

export function buildLedgerInputs(expenses: LocalExpense[], payments: LocalPayment[]) {
  return {
    expenses: expenses
      .filter((e) => !e.deletedAt)
      .map((e) => ({
        id: e.id,
        title: e.title,
        amount: e.amount,
        currency: e.currency,
        payerId: e.payerId,
        payers: e.payers?.length ? e.payers : undefined,
        splitMode: e.splitMode,
        shares: e.shares,
        tax: e.tax || noneCharge(),
        service: e.service || noneCharge(),
        tip: e.tip || noneCharge(),
        fxRate: e.fxRate,
        createdAt: e.createdAt,
        occurredAt: e.occurredAt,
      })),
    payments: payments
      .filter((p) => !p.deletedAt && p.status !== 'pending_confirm' && p.status !== 'sent')
      .map((p) => ({
        id: p.id,
        fromMemberId: p.fromMemberId,
        toMemberId: p.toMemberId,
        amount: p.amount,
        currency: p.currency,
        kind: p.kind,
        fxRate: p.fxRate,
        createdAt: p.createdAt,
      })),
  };
}

export function periodAnalytics(
  expenses: LocalExpense[],
  payments: LocalPayment[],
  members: LocalMember[],
  roundTo = 0,
) {
  const { expenses: e, payments: p } = buildLedgerInputs(expenses, payments);
  const balances = computeBalances(e, p);
  const settlements = suggestSettlements(balances, roundTo);
  const byTag: Record<string, number> = {};
  let total = 0;
  for (const exp of e) {
    const shares = computeShares(exp);
    const sum = shares.reduce((s, x) => s + x.amount, 0);
    total += sum;
    for (const tag of expenses.find((x) => x.id === exp.id)?.tags || ['بدون‌تگ']) {
      byTag[tag] = (byTag[tag] || 0) + sum;
    }
  }
  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName || id;
  return { balances, settlements, total, byTag, nameOf };
}

export type PersonKey = string;

export function personKey(member: LocalMember): PersonKey {
  if (member.userId) return `u:${member.userId}`;
  if (member.phone) return `p:${member.phone}`;
  if (member.guestKey) return `g:${member.guestKey}`;
  return `n:${member.displayName.trim()}`;
}

function toIrt(amount: number, periodCurrency: string, rates: FxRates): number | null {
  if (periodCurrency === 'IRT') return amount;
  const rate = rateToPeriod(rates, periodCurrency, 'IRT');
  if (!rate) return null;
  return Math.round(amount * rate);
}

export function globalDebts(
  periods: LocalPeriod[],
  allMembers: LocalMember[],
  allExpenses: LocalExpense[],
  allPayments: LocalPayment[],
  self: { userId?: string; guestKey?: string; displayName?: string; phone?: string },
  rates: FxRates = {},
) {
  const selfMemberLike: LocalMember = {
    id: 'self',
    periodId: '',
    displayName: self.displayName || 'من',
    userId: self.userId,
    guestKey: self.guestKey,
    phone: self.phone,
    weightDefault: 1,
    role: 'owner',
  };
  const me = personKey(selfMemberLike);
  let owedToMe = 0;
  let iOwe = 0;
  let mixedUnconverted = false;
  const byPerson: { key: string; name: string; amount: number }[] = [];
  const acc = new Map<string, { name: string; amount: number }>();

  for (const period of periods) {
    const members = allMembers.filter((m) => m.periodId === period.id);
    const expenses = allExpenses.filter((e) => e.periodId === period.id);
    const payments = allPayments.filter((p) => p.periodId === period.id);
    const { balances } = periodAnalytics(expenses, payments, members, period.roundTo || 0);
    const myMember = members.find((m) => personKey(m) === me);
    if (!myMember) continue;
    const myBal = balances[myMember.id] || 0;
    const converted = toIrt(myBal, period.currency, rates);
    if (converted == null && myBal) {
      mixedUnconverted = true;
      continue;
    }
    const irtBal = converted ?? 0;
    if (irtBal > 0) owedToMe += irtBal;
    if (irtBal < 0) iOwe += -irtBal;

    for (const [mid, bal] of Object.entries(balances)) {
      if (mid === myMember.id || !bal) continue;
      const other = members.find((m) => m.id === mid);
      if (!other || other.isPot) continue;
      const otherIrt = toIrt(bal, period.currency, rates);
      if (otherIrt == null) {
        mixedUnconverted = true;
        continue;
      }
      const key = personKey(other);
      const prev = acc.get(key) || { name: other.displayName, amount: 0 };
      prev.amount += -otherIrt;
      acc.set(key, prev);
    }
  }

  for (const [key, v] of acc) {
    byPerson.push({ key, name: v.name, amount: v.amount });
  }
  byPerson.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  return { owedToMe, iOwe, byPerson, mixedUnconverted };
}
