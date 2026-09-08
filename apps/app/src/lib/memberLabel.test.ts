import { describe, expect, it } from 'vitest';
import {
  displayNameWithMe,
  isSelfMember,
  needsDisplayName,
  normalizeDisplayName,
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
