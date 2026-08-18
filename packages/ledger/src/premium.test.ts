import { describe, expect, it } from 'vitest';
import { expirePremium, isPremium } from './premium.js';

describe('isPremium', () => {
  const now = Date.parse('2026-08-18T12:00:00.000Z');

  it('requires plan and a future until', () => {
    expect(isPremium(null, now)).toBe(false);
    expect(isPremium({ plan: 'premium' }, now)).toBe(false);
    expect(isPremium({ plan: 'free', premiumUntil: '2026-09-01T00:00:00.000Z' }, now)).toBe(false);
    expect(isPremium({ plan: 'premium', premiumUntil: '2026-08-18T11:00:00.000Z' }, now)).toBe(false);
    expect(isPremium({ plan: 'premium', premiumUntil: '2026-08-18T13:00:00.000Z' }, now)).toBe(true);
  });
});

describe('expirePremium', () => {
  const now = Date.parse('2026-08-18T12:00:00.000Z');

  it('sets plan to free when until is missing or past', () => {
    const expired = { plan: 'premium' as const, premiumUntil: '2026-01-01T00:00:00.000Z' };
    expect(expirePremium(expired, now)).toBe(true);
    expect(expired.plan).toBe('free');
    const dateless = { plan: 'premium' as const };
    expect(expirePremium(dateless, now)).toBe(true);
    expect(dateless.plan).toBe('free');
    const active = { plan: 'premium' as const, premiumUntil: '2026-09-01T00:00:00.000Z' };
    expect(expirePremium(active, now)).toBe(false);
    expect(active.plan).toBe('premium');
  });
});
