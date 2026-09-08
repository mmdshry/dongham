import { describe, expect, it } from 'vitest';
import { noneCharge, type LocalExpense, type LocalMember, type LocalPayment, type LocalPeriod } from './db';
import { hasPotMember, ownerSeatId, preparePeriodSettingsUpdate } from './periodSettings';

const now = '2026-09-08T08:00:00.000Z';

function period(overrides: Partial<LocalPeriod> = {}): LocalPeriod {
  return {
    id: 'p1',
    title: 'سفر',
    currency: 'IRT',
    baseCurrency: 'IRT',
    createdAt: now,
    updatedAt: now,
    version: 1,
    synced: false,
    ownerId: 'u-owner',
    kind: 'split',
    template: 'travel',
    roundTo: 0,
    ...overrides,
  };
}

function member(id: string, displayName: string, extra: Partial<LocalMember> = {}): LocalMember {
  return {
    id,
    periodId: 'p1',
    displayName,
    weightDefault: 1,
    role: 'member',
    ...extra,
  };
}

function expense(overrides: Partial<LocalExpense> = {}): LocalExpense {
  return {
    id: 'e1',
    periodId: 'p1',
    title: 'شام',
    amount: 100,
    currency: 'IRT',
    payerId: 'owner',
    payers: [],
    splitMode: 'equal',
    shares: [{ memberId: 'owner', value: 1 }],
    tax: noneCharge(),
    service: noneCharge(),
    tip: noneCharge(),
    tags: [],
    fxRate: 1,
    createdAt: now,
    occurredAt: now,
    updatedAt: now,
    version: 1,
    ...overrides,
  };
}

function payment(overrides: Partial<LocalPayment> = {}): LocalPayment {
  return {
    id: 'pay1',
    periodId: 'p1',
    fromMemberId: 'owner',
    toMemberId: 'm2',
    amount: 50,
    currency: 'IRT',
    kind: 'settlement',
    fxRate: 1,
    createdAt: now,
    updatedAt: now,
    version: 1,
    ...overrides,
  };
}

const members: LocalMember[] = [
  member('owner', 'مالک', { role: 'owner', userId: 'u-owner' }),
  member('m2', 'سارا'),
];

describe('ownerSeatId', () => {
  it('prefers the cloud owner userId', () => {
    expect(ownerSeatId(period(), members)).toBe('owner');
  });
});

describe('preparePeriodSettingsUpdate', () => {
  it('creates a pot member when switching to pot and none exists', () => {
    const res = preparePeriodSettingsUpdate({
      period: period(),
      members,
      expenses: [],
      payments: [],
      patch: { kind: 'pot' },
      rates: {},
      now,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.createPot).toBe(true);
    expect(res.period.kind).toBe('pot');
  });

  it('does not create a second pot member', () => {
    const withPot = [...members, member('pot', 'صندوق', { isPot: true })];
    expect(hasPotMember(withPot)).toBe(true);
    const res = preparePeriodSettingsUpdate({
      period: period({ kind: 'split' }),
      members: withPot,
      expenses: [],
      payments: [],
      patch: { kind: 'pot' },
      rates: {},
      now,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.createPot).toBe(false);
  });

  it('defaults banker to the owner when switching to banker', () => {
    const res = preparePeriodSettingsUpdate({
      period: period(),
      members,
      expenses: [],
      payments: [],
      patch: { kind: 'banker' },
      rates: {},
      now,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.createPot).toBe(false);
    expect(res.period.kind).toBe('banker');
    expect(res.period.bankerMemberId).toBe('owner');
  });

  it('keeps a valid banker seat', () => {
    const res = preparePeriodSettingsUpdate({
      period: period({ kind: 'banker', bankerMemberId: 'm2' }),
      members,
      expenses: [],
      payments: [],
      patch: { template: 'family' },
      rates: {},
      now,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.period.bankerMemberId).toBe('m2');
  });

  it('sets lunch turn on the work template when missing', () => {
    const res = preparePeriodSettingsUpdate({
      period: period({ template: 'travel' }),
      members,
      expenses: [],
      payments: [],
      patch: { template: 'work' },
      rates: {},
      now,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.period.template).toBe('work');
    expect(res.period.lunchTurnMemberId).toBe('owner');
  });

  it('rebases live expense and payment fx rates onto the new currency', () => {
    const res = preparePeriodSettingsUpdate({
      period: period(),
      members,
      expenses: [expense({ fxRate: 1 }), expense({ id: 'gone', fxRate: 1, deletedAt: now })],
      payments: [payment({ fxRate: 1 })],
      patch: { currency: 'USD' },
      rates: { USD: 100_000 },
      now,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.period.currency).toBe('USD');
    expect(res.period.baseCurrency).toBe('USD');
    expect(res.expenses).toHaveLength(1);
    expect(res.expenses[0].id).toBe('e1');
    expect(res.expenses[0].amount).toBe(100);
    expect(res.expenses[0].fxRate).toBeCloseTo(1 / 100_000);
    expect(res.payments).toHaveLength(1);
    expect(res.payments[0].fxRate).toBeCloseTo(1 / 100_000);
  });

  it('leaves an existing pot member in place when switching away from pot', () => {
    const withPot = [...members, member('pot', 'صندوق', { isPot: true })];
    const res = preparePeriodSettingsUpdate({
      period: period({ kind: 'pot' }),
      members: withPot,
      expenses: [],
      payments: [],
      patch: { kind: 'split' },
      rates: {},
      now,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.createPot).toBe(false);
    expect(res.period.kind).toBe('split');
  });

  it('rebases IRT to IRR without live rates', () => {
    const res = preparePeriodSettingsUpdate({
      period: period(),
      members,
      expenses: [expense({ fxRate: 1 })],
      payments: [],
      patch: { currency: 'IRR' },
      rates: {},
      now,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.period.currency).toBe('IRR');
    expect(res.expenses[0].fxRate).toBe(10);
  });

  it('aborts currency change when the rate is missing', () => {
    const res = preparePeriodSettingsUpdate({
      period: period(),
      members,
      expenses: [expense()],
      payments: [],
      patch: { currency: 'EUR' },
      rates: {},
      now,
    });
    expect(res).toEqual({ ok: false, error: 'نرخ تبدیل این ارز در دسترس نیست' });
  });
});
