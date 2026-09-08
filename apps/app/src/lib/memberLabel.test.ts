import { describe, expect, it } from 'vitest';
import {
  displayNameWithMe,
  isGuestDisplayName,
  isSelfMember,
  needsDisplayName,
  normalizeDisplayName,
  randomGuestDisplayName,
} from './memberLabel';

describe('needsDisplayName', () => {
  it('treats empty and placeholder من as missing', () => {
    expect(needsDisplayName(undefined)).toBe(true);
    expect(needsDisplayName('')).toBe(true);
    expect(needsDisplayName('   ')).toBe(true);
    expect(needsDisplayName('من')).toBe(true);
    expect(needsDisplayName(' من ')).toBe(true);
  });

  it('accepts a real name', () => {
    expect(needsDisplayName('محمد')).toBe(false);
    expect(needsDisplayName('منیره')).toBe(false);
  });

  it('treats guest labels as a real name', () => {
    expect(needsDisplayName('کاربر مهمان 48217')).toBe(false);
    expect(needsDisplayName(randomGuestDisplayName())).toBe(false);
  });
});

describe('randomGuestDisplayName', () => {
  it('is کاربر مهمان plus a 5-digit number from 10000 to 99999', () => {
    for (let i = 0; i < 20; i += 1) {
      const name = randomGuestDisplayName();
      expect(name).toMatch(/^کاربر مهمان \d{5}$/);
      const n = Number(name.slice('کاربر مهمان '.length));
      expect(n).toBeGreaterThanOrEqual(10000);
      expect(n).toBeLessThanOrEqual(99999);
      expect(isGuestDisplayName(name)).toBe(true);
    }
  });

  it('rejects other labels as guest names', () => {
    expect(isGuestDisplayName('کاربر مهمان 1234')).toBe(false);
    expect(isGuestDisplayName('کاربر مهمان 123456')).toBe(false);
    expect(isGuestDisplayName('محمد')).toBe(false);
    expect(isGuestDisplayName('')).toBe(false);
  });
});

describe('normalizeDisplayName', () => {
  it('trims and caps length', () => {
    expect(normalizeDisplayName('  محمد  ')).toBe('محمد');
    expect(normalizeDisplayName('الف'.repeat(40)).length).toBe(80);
  });
});

describe('isSelfMember', () => {
  it('matches guestKey or userId', () => {
    expect(isSelfMember({ guestKey: 'g1' }, { guestKey: 'g1' })).toBe(true);
    expect(isSelfMember({ userId: 'u1' }, { userId: 'u1' })).toBe(true);
    expect(isSelfMember({ guestKey: 'g1', userId: 'u1' }, { guestKey: 'g2', userId: 'u1' })).toBe(true);
    expect(isSelfMember({ guestKey: 'g1' }, { guestKey: 'g2' })).toBe(false);
    expect(isSelfMember({ userId: 'u1' }, { guestKey: 'g1' })).toBe(false);
    expect(isSelfMember(null, { guestKey: 'g1' })).toBe(false);
  });

  it('matches phone or email like the API actor', () => {
    expect(isSelfMember({ phone: '09121111111' }, { userId: 'u1', phone: '09121111111' })).toBe(true);
    expect(isSelfMember({ email: 'a@ex.com' }, { email: 'A@Ex.com' })).toBe(true);
    expect(isSelfMember({ phone: '09121111111' }, { userId: 'u1', phone: '09122222222' })).toBe(false);
  });
});

describe('displayNameWithMe', () => {
  it('appends (من) only for self with a name', () => {
    expect(displayNameWithMe('محمد', true)).toBe('محمد (من)');
    expect(displayNameWithMe('محمد', false)).toBe('محمد');
    expect(displayNameWithMe('  محمد  ', true)).toBe('محمد (من)');
    expect(displayNameWithMe('', true)).toBe('');
  });
});
