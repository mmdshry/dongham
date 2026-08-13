import { describe, expect, it } from 'vitest';
import { missingFxCodes, parseNobitexStats } from './fx.js';

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
