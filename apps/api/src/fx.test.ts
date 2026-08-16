import { describe, expect, it } from 'vitest';
import { missingFxCodes, parseNavasanLastCurrencies, parseNobitexStats } from './fx.js';

describe('nobitex fx parse', () => {
  it('maps usdt-rls to USD toman', () => {
    const rates = parseNobitexStats({
      stats: {
        'usdt-rls': { latest: '1032000', bestSell: '1032500' },
      },
    });
    expect(rates.USD).toBe(1_032_000);
    expect(missingFxCodes(rates)).toContain('EUR');
  });

  it('divides rial-like usd quotes by 10', () => {
    const rates = parseNobitexStats({
      stats: {
        'usdt-rls': { latest: '10320000' },
      },
    });
    expect(rates.USD).toBe(1_032_000);
  });
});

describe('navasan last currencies', () => {
  it('uppercases codes and keeps toman values', () => {
    const rates = parseNavasanLastCurrencies({
      usd: { value: 186200, date: 1, change_val: 0, change_pct: 0 },
      aed: { value: 51180, date: 1, change_val: 0, change_pct: 0 },
      irr: { value: 0 },
    });
    expect(rates.USD).toBe(186200);
    expect(rates.AED).toBe(51180);
    expect(rates.IRR).toBeUndefined();
  });
});
