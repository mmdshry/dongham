import { computeBalances, computeShares, suggestSettlements, toBaseCurrency } from '@dongham/ledger';
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
  // Totals and tags are in the period currency, converted with the stored fxRate — same as balances.
  const byTag: Record<string, number> = {};
  let total = 0;
  for (const exp of e) {
    const shares = computeShares(exp);
    const sum = toBaseCurrency(
      shares.reduce((s, x) => s + x.amount, 0),
      exp.fxRate ?? 1,
    );
    total += sum;
    for (const tag of expenses.find((x) => x.id === exp.id)?.tags || ['بدون‌تگ']) {
      byTag[tag] = (byTag[tag] || 0) + sum;
    }
  }
  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName || id;
  return { balances, settlements, total, byTag, nameOf };
}

/** Tag totals across periods, rolled up to toman with the live period→IRT rate. */
export function globalTagTotals(
  periods: LocalPeriod[],
  allMembers: LocalMember[],
  allExpenses: LocalExpense[],
  allPayments: LocalPayment[],
  rates: FxRates = {},
): { byTag: [string, number][]; mixedUnconverted: boolean } {
  const acc: Record<string, number> = {};
  let mixedUnconverted = false;
  for (const period of periods) {
    const pe = allExpenses.filter((e) => e.periodId === period.id);
    const pp = allPayments.filter((p) => p.periodId === period.id);
    const pm = allMembers.filter((m) => m.periodId === period.id);
    const { byTag } = periodAnalytics(pe, pp, pm, period.roundTo || 0);
    for (const [tag, amount] of Object.entries(byTag)) {
      const irt = toIrt(amount, period.currency, rates);
      if (irt == null) {
        if (amount) mixedUnconverted = true;
        continue;
      }
      acc[tag] = (acc[tag] || 0) + irt;
    }
  }
  return { byTag: Object.entries(acc).sort((a, b) => b[1] - a[1]), mixedUnconverted };
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
    displayName: self.displayName || '',
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
    // Same pairwise «کی به کی» edges the period's balance tab shows, not each person's group net.
    const { settlements } = periodAnalytics(expenses, payments, members, period.roundTo || 0);
    const myMember = members.find((m) => personKey(m) === me);
    if (!myMember) continue;

    for (const edge of settlements) {
      const owedByMe = edge.fromMemberId === myMember.id;
      const owedToMeEdge = edge.toMemberId === myMember.id;
      if (!owedByMe && !owedToMeEdge) continue;
      const otherId = owedByMe ? edge.toMemberId : edge.fromMemberId;
      const other = members.find((m) => m.id === otherId);
      if (!other || other.isPot) continue;
      const irt = toIrt(edge.amount, period.currency, rates);
      if (irt == null) {
        mixedUnconverted = true;
        continue;
      }
      // Positive = they owe me, negative = I owe them.
      const signed = owedByMe ? -irt : irt;
      if (signed > 0) owedToMe += signed;
      else iOwe += -signed;
      const key = personKey(other);
      const prev = acc.get(key) || { name: other.displayName, amount: 0 };
      prev.amount += signed;
      acc.set(key, prev);
    }
  }

  for (const [key, v] of acc) {
    byPerson.push({ key, name: v.name, amount: v.amount });
  }
  byPerson.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  return { owedToMe, iOwe, byPerson, mixedUnconverted };
}
