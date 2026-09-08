import { describe, expect, it } from 'vitest';
import {
  applyTax,
  computeBalances,
  computeShares,
  evenPercentShares,
  expenseTotal,
  roundToStep,
  suggestSettlements,
  validateShares,
} from './index.js';
import type { ExpenseInput, PaymentInput } from './types.js';

const members = ['a', 'b', 'c'];

function equalExpense(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    id: 'e1',
    title: 'شام',
    amount: 300_000,
    currency: 'IRR',
    payerId: 'a',
    splitMode: 'equal',
    shares: members.map((id) => ({ memberId: id, value: 1 })),
    ...overrides,
  };
}

describe('tax', () => {
  it('applies percent tax', () => {
    expect(applyTax(1000, { type: 'percent', value: 10 })).toBe(1100);
  });
  it('applies amount tax', () => {
    expect(applyTax(1000, { type: 'amount', value: 50 })).toBe(1050);
  });
});

describe('service tax tip stack', () => {
  it('applies service then tax then tip', () => {
    const total = expenseTotal(
      equalExpense({
        amount: 1000,
        service: { type: 'percent', value: 10 },
        tax: { type: 'percent', value: 10 },
        tip: { type: 'amount', value: 50 },
      }),
    );
    // 1000 → 1100 service → 1210 tax → 1260 tip
    expect(total).toBe(1260);
  });

  it('roundToStep snaps to thousands', () => {
    expect(roundToStep(10_400, 1000)).toBe(10_000);
    expect(roundToStep(10_500, 1000)).toBe(11_000);
    expect(roundToStep(47_200, 10_000)).toBe(50_000);
    expect(roundToStep(250, 0)).toBe(250);
  });
});

describe('split modes', () => {
  it('splits equally with remainder', () => {
    const shares = computeShares(equalExpense({ amount: 100 }));
    const sum = shares.reduce((s, x) => s + x.amount, 0);
    expect(sum).toBe(100);
    expect(shares).toHaveLength(3);
  });

  it('splits by weight (coefficients)', () => {
    const shares = computeShares(
      equalExpense({
        amount: 1000,
        splitMode: 'weight',
        shares: [
          { memberId: 'a', value: 1 },
          { memberId: 'b', value: 2 },
          { memberId: 'c', value: 1 },
        ],
      }),
    );
    expect(shares.find((s) => s.memberId === 'b')?.amount).toBe(500);
    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(1000);
  });

  it('splits by decimal weights up to 3 places', () => {
    const shares = computeShares(
      equalExpense({
        amount: 2000,
        splitMode: 'weight',
        shares: [
          { memberId: 'a', value: 1.125 },
          { memberId: 'b', value: 0.875 },
        ],
      }),
    );
    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(2000);
    expect(shares.find((s) => s.memberId === 'a')?.amount).toBe(1125);
    expect(shares.find((s) => s.memberId === 'b')?.amount).toBe(875);
  });

  it('splits exact amounts for a person', () => {
    const shares = computeShares(
      equalExpense({
        amount: 1000,
        splitMode: 'exact',
        shares: [
          { memberId: 'a', value: 200 },
          { memberId: 'b', value: 300 },
          { memberId: 'c', value: 500 },
        ],
      }),
    );
    expect(shares.find((s) => s.memberId === 'a')?.amount).toBe(200);
  });

  it('rejects exact mismatch', () => {
    expect(() =>
      computeShares(
        equalExpense({
          amount: 1000,
          splitMode: 'exact',
          shares: [
            { memberId: 'a', value: 100 },
            { memberId: 'b', value: 100 },
            { memberId: 'c', value: 100 },
          ],
        }),
      ),
    ).toThrow(/EXACT_SPLIT_MISMATCH/);
  });

  it('splits by percent', () => {
    const shares = computeShares(
      equalExpense({
        amount: 1000,
        splitMode: 'percent',
        shares: [
          { memberId: 'a', value: 50 },
          { memberId: 'b', value: 30 },
          { memberId: 'c', value: 20 },
        ],
      }),
    );
    expect(shares.find((s) => s.memberId === 'a')?.amount).toBe(500);
  });

  it('excludes member from equal split', () => {
    const shares = computeShares(
      equalExpense({
        amount: 1000,
        shares: [
          { memberId: 'a', value: 1 },
          { memberId: 'b', value: 1 },
          { memberId: 'c', value: 1, excluded: true },
        ],
      }),
    );
    expect(shares.find((s) => s.memberId === 'c')).toBeUndefined();
    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(1000);
  });

  it('validateShares reports errors', () => {
    const bad = validateShares('percent', 1000, [
      { memberId: 'a', value: 40 },
      { memberId: 'b', value: 40 },
    ]);
    expect(bad.ok).toBe(false);
  });

  it('validateShares rejects splits with nobody active', () => {
    const excluded = validateShares('equal', 1000, [
      { memberId: 'a', value: 1, excluded: true },
      { memberId: 'b', value: 1, excluded: true },
    ]);
    expect(excluded.ok).toBe(false);
    if (!excluded.ok) expect(excluded.error).toMatch(/NO_ACTIVE_SHARES/);
    const zeroWeights = validateShares('weight', 1000, [
      { memberId: 'a', value: 0 },
      { memberId: 'b', value: 0 },
    ]);
    expect(zeroWeights.ok).toBe(false);
    expect(validateShares('equal', 1000, []).ok).toBe(false);
    expect(validateShares('equal', 1000, [{ memberId: 'a', value: 1 }]).ok).toBe(true);
  });

  it('evenPercentShares always sums to 100', () => {
    for (let n = 1; n <= 12; n += 1) {
      const parts = evenPercentShares(n);
      expect(parts).toHaveLength(n);
      expect(parts.reduce((s, x) => s + x, 0)).toBe(100);
      expect(validateShares('percent', 1000, parts.map((value, i) => ({ memberId: String(i), value }))).ok).toBe(true);
    }
    expect(evenPercentShares(3)).toEqual([33, 33, 34]);
    expect(evenPercentShares(0)).toEqual([]);
  });
});

describe('balances and settlement', () => {
  it('computes balances for equal expense paid by one', () => {
    const balances = computeBalances([equalExpense()], []);
    expect(balances.a).toBe(200_000);
    expect(balances.b).toBe(-100_000);
    expect(balances.c).toBe(-100_000);
  });

  it('applies tax into balances', () => {
    const balances = computeBalances(
      [equalExpense({ tax: { type: 'percent', value: 10 } })],
      [],
    );
    // total 330000 → each 110000; a paid all → +220000
    expect(balances.a).toBe(220_000);
    expect(balances.b).toBe(-110_000);
  });

  it('handles loans and settlements', () => {
    const expenses: ExpenseInput[] = [equalExpense()];
    const payments: PaymentInput[] = [
      {
        id: 'p1',
        fromMemberId: 'b',
        toMemberId: 'a',
        amount: 100_000,
        currency: 'IRR',
        kind: 'settlement',
      },
    ];
    const balances = computeBalances(expenses, payments);
    expect(balances.b).toBe(0);
    expect(balances.a).toBe(100_000);
    expect(balances.c).toBe(-100_000);
  });

  it('suggests minimal settlements', () => {
    const balances = computeBalances([equalExpense()], []);
    const plan = suggestSettlements(balances);
    const total = plan.reduce((s, e) => s + e.amount, 0);
    expect(total).toBe(200_000);
    expect(plan.every((e) => e.toMemberId === 'a')).toBe(true);
  });

  it('credits multiple payers', () => {
    const balances = computeBalances(
      [
        equalExpense({
          payers: [
            { memberId: 'a', amount: 150_000 },
            { memberId: 'b', amount: 150_000 },
          ],
        }),
      ],
      [],
    );
    expect(balances.a).toBe(50_000);
    expect(balances.b).toBe(50_000);
    expect(balances.c).toBe(-100_000);
  });

  it('rounds suggested settlements to 1000', () => {
    const balances = { a: 10_400, b: -10_400 };
    const plan = suggestSettlements(balances, 1000);
    expect(plan).toEqual([{ fromMemberId: 'b', toMemberId: 'a', amount: 10_000 }]);
  });

  it('rounds suggested settlements to 10000', () => {
    const balances = { a: 47_200, b: -47_200 };
    const plan = suggestSettlements(balances, 10_000);
    expect(plan[0]?.amount).toBe(50_000);
  });

  it('loan creates creditor/debtor', () => {
    const balances = computeBalances(
      [],
      [
        {
          id: 'l1',
          fromMemberId: 'a',
          toMemberId: 'b',
          amount: 50_000,
          currency: 'IRR',
          kind: 'loan',
        },
      ],
    );
    expect(balances.a).toBe(50_000);
    expect(balances.b).toBe(-50_000);
  });
});

describe('iran banks', () => {
  it('detects bank from BIN and sheba', async () => {
    const { detectBankFromCard, detectBankFromSheba, formatCardGrouped } = await import('./iran-banks.js');
    expect(detectBankFromCard('6037991111111111')?.name).toBe('ملی');
    expect(detectBankFromSheba('IR060170000000000000000000')?.name).toBe('ملی');
    expect(detectBankFromSheba('060170000000000000000000')?.name).toBe('ملی');
    expect(detectBankFromCard('4111111111111111')).toBeUndefined();
    const { bankFromDrapi } = await import('./iran-banks.js');
    expect(bankFromDrapi('EGHTESAD_NOVIN')?.name).toBe('اقتصاد نوین');
    expect(bankFromDrapi('eghtesad-novin')?.code).toBe('055');
    expect(formatCardGrouped('6037991111111111')).toBe('6037 9911 1111 1111');
  });

  it('uses official CBI IBAN codes (bank code = IBAN positions 4–6)', async () => {
    const { detectBankFromSheba, detectBankFromCard, bankByCode, listIranBanks } = await import('./iran-banks.js');
    expect(detectBankFromSheba('IR000700000000000000000000')?.name).toBe('رسالت');
    expect(detectBankFromSheba('IR000780000000000000000000')?.name).toBe('خاورمیانه');
    expect(detectBankFromSheba('IR000630000000000000000000')?.name).toBe('انصار');
    expect(detectBankFromSheba('IR000200000000000000000000')?.name).toBe('توسعه صادرات');
    expect(detectBankFromSheba('IR000220000000000000000000')?.name).toBe('توسعه تعاون');
    expect(detectBankFromSheba('IR000110000000000000000000')?.name).toBe('صنعت و معدن');
    // BIN table agrees with the same codes.
    expect(detectBankFromCard('5041721111111111')?.code).toBe('070');
    expect(detectBankFromCard('5859471111111111')?.code).toBe('078');
    expect(detectBankFromCard('6273811111111111')?.code).toBe('063');
    // Every entry's key is its own code, so bankByCode(x).code === x and the list has no duplicates.
    for (const b of listIranBanks()) expect(bankByCode(b.code)?.code).toBe(b.code);
    expect(new Set(listIranBanks().map((b) => b.code)).size).toBe(listIranBanks().length);
  });
});

describe('jalali recurring', () => {
  it('advances by jalali month not 30 gregorian days', async () => {
    const { nextRecurringAt, gregorianToJalali, isoToJalaliParts } = await import('./jalali.js');
    const from = new Date(2026, 2, 21, 12, 0, 0).toISOString();
    const [jy] = gregorianToJalali(2026, 3, 21);
    expect(isoToJalaliParts(from).m).toBe(1);
    const next = nextRecurringAt(from, 'jalaliMonthly');
    expect(isoToJalaliParts(next).m).toBe(2);
    expect(isoToJalaliParts(next).y).toBe(jy);
    const bi = nextRecurringAt(from, 'jalaliBimonthly');
    expect(isoToJalaliParts(bi).m).toBe(3);
  });

  it('builds saturday-first month grids and roundtrips calendars', async () => {
    const {
      calendarPartsToIso,
      isoToCalendarParts,
      calendarMonthGrid,
      gregorianMonthDays,
      saturdayIndex,
    } = await import('./jalali.js');
    const iso = calendarPartsToIso(1405, 1, 1, 'jalali');
    expect(isoToCalendarParts(iso, 'jalali')).toEqual({ y: 1405, m: 1, d: 1 });
    expect(isoToCalendarParts(iso, 'gregorian')).toEqual({ y: 2026, m: 3, d: 21 });
    expect(gregorianMonthDays(2024, 2)).toBe(29);
    const grid = calendarMonthGrid(2026, 3, 'gregorian');
    expect(grid.length % 7).toBe(0);
    expect(grid.filter((c) => c.inMonth)).toHaveLength(31);
    expect(saturdayIndex(new Date(2026, 2, 21))).toBe((new Date(2026, 2, 21).getDay() + 1) % 7);
  });
});

describe('gold index', () => {
  it('scales principal by rate change', async () => {
    const { indexedAmountNow } = await import('./normalize.js');
    expect(indexedAmountNow(1_000_000, 5_000_000, 6_000_000)).toBe(1_200_000);
  });
});
