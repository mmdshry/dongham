import { describe, expect, it } from 'vitest';
import { rateToPeriod } from './fx';

describe('rateToPeriod', () => {
  it('returns 1 for same currency', () => {
    expect(rateToPeriod({}, 'IRT', 'IRT')).toBe(1);
  });

  it('returns 0 when foreign rate is missing', () => {
    expect(rateToPeriod({}, 'USD', 'IRT')).toBe(0);
  });

  it('converts usd toman rate into period toman', () => {
    expect(rateToPeriod({ USD: 1_000_000 }, 'USD', 'IRT')).toBe(1_000_000);
  });
});
