import { describe, expect, it } from 'vitest';
import { asPeriodId, persistMemberCard, persistSessionToken } from './mysql.js';

describe('mysql persist helpers', () => {
  it('accepts only ledger period ids', () => {
    expect(asPeriodId('abc-def')).toBe('abc-def');
    expect(asPeriodId('abcdefg')).toBeNull();
    expect(asPeriodId('  abc-def  ')).toBe('abc-def');
  });

  it('stores 16-digit cards and drops ciphertext or short values', () => {
    expect(persistMemberCard('6037-9911-1111-1112')).toBe('6037991111111112');
    expect(persistMemberCard('not-a-card')).toBeNull();
    expect(persistMemberCard('YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0')).toBeNull();
  });

  it('never clips session tokens', () => {
    const token = `a`.repeat(2000);
    expect(persistSessionToken(token)).toBe(token);
  });
});
