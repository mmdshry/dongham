import { describe, expect, it } from 'vitest';
import { rateToPeriod, rebaseFxRate } from './money.js';

describe('rebaseFxRate', () => {
  it('keeps the stored rate when the period currency is unchanged', () => {
    expect(rebaseFxRate(2.5, 'IRT', 'IRT', { USD: 100_000 })).toBe(2.5);
  });

  it('converts IRT ↔ IRR without live rates', () => {
    expect(rebaseFxRate(1, 'IRT', 'IRR', {})).toBe(10);
    expect(rebaseFxRate(10, 'IRR', 'IRT', {})).toBe(1);
  });

  it('scales an IRT period rate into USD with the toman-per-dollar quote', () => {
    const rates = { USD: 100_000 };
    expect(rateToPeriod(rates, 'IRT', 'USD')).toBe(1 / 100_000);
    expect(rebaseFxRate(1, 'IRT', 'USD', rates)).toBeCloseTo(1 / 100_000);
    expect(rebaseFxRate(100_000, 'IRT', 'USD', rates)).toBeCloseTo(1);
  });

  it('returns null when the target currency has no rate', () => {
    expect(rebaseFxRate(1, 'IRT', 'EUR', {})).toBeNull();
  });
});
