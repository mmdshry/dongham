import { describe, expect, it } from 'vitest';
import { sanitizeFxWatchlist } from './fx-watchlist.js';

describe('sanitizeFxWatchlist', () => {
  it('drops IRT/IRR duplicates and invalid codes', () => {
    expect(sanitizeFxWatchlist(['usd', 'USD', 'IRT', 'IRR', 'eur', 'nope!'])).toEqual(['USD', 'EUR']);
    expect(sanitizeFxWatchlist(undefined)).toEqual([]);
    expect(sanitizeFxWatchlist(Array.from({ length: 40 }, (_, i) => `USD${i}`))).toHaveLength(30);
  });
});
