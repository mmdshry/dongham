import { describe, expect, it } from 'vitest';
import { displayNameQuota, signupDisplayName, tehranJalaliMonth } from './profile.js';

describe('signupDisplayName', () => {
  it('prefers a real display name over the login identifier', () => {
    expect(signupDisplayName({ displayName: 'محمد', phone: '09120000000' })).toBe('محمد');
    expect(signupDisplayName({ displayName: 'مینا', email: 'mina@example.com' })).toBe('مینا');
  });

  it('falls back to phone or email when the name is missing or placeholder', () => {
    expect(signupDisplayName({ phone: '09120000000' })).toBe('09120000000');
    expect(signupDisplayName({ displayName: 'من', phone: '09120000000' })).toBe('09120000000');
    expect(signupDisplayName({ displayName: '  ', email: 'mina@example.com' })).toBe('mina@example.com');
  });
});

describe('display name monthly quota', () => {
  const beforeNowruz = Date.parse('2026-03-20T20:00:00.000Z');
  const nowruz = Date.parse('2026-03-21T05:30:00.000Z');

  it('keys the quota to the Jalali month in Asia/Tehran', () => {
    expect(tehranJalaliMonth(beforeNowruz)).toBe('1404-12');
    expect(tehranJalaliMonth(nowruz)).toBe('1405-01');
  });

  it('does not carry last month used count into the new month', () => {
    expect(
      displayNameQuota({ displayNameMonth: '1404-12', displayNameChanges: 3 }, beforeNowruz),
    ).toEqual({ month: '1404-12', used: 3, limit: 3, remaining: 0 });
    expect(
      displayNameQuota({ displayNameMonth: '1404-12', displayNameChanges: 3 }, nowruz),
    ).toEqual({ month: '1405-01', used: 0, limit: 3, remaining: 3 });
  });
});
