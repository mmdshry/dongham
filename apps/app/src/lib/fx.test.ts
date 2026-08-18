import { describe, expect, it } from 'vitest';
import { browseRateCurrencies, displayTomanRate } from './currencyCatalog';
import { parseWatchlist, rateToPeriod } from './fx';

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

describe('parseWatchlist', () => {
  it('starts empty and drops IRT duplicates', () => {
    expect(parseWatchlist(undefined)).toEqual([]);
    expect(parseWatchlist('["usd","USD","IRT","IRR","eur"]')).toEqual(['USD', 'EUR']);
    expect(parseWatchlist('nope')).toEqual([]);
  });
});

describe('browseRateCurrencies', () => {
  it('shows priced currencies before they are pinned', () => {
    const listed = browseRateCurrencies('', { USD: 186400, EUR: 215000 }, []);
    expect(listed.map((c) => c.code)).toEqual(expect.arrayContaining(['USD', 'EUR']));
    expect(listed.find((c) => c.code === 'USD')?.nameFa).toBe('دلار آمریکا');
    expect(browseRateCurrencies('', { USD: 186400 }, ['USD']).map((c) => c.code)).toContain('IRR');
    expect(displayTomanRate('IRR', 999)).toBe(0.1);
    expect(displayTomanRate('USD', 186400)).toBe(186400);
  });
});
