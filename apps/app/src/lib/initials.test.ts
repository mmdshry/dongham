import { describe, expect, it } from 'vitest';
import { firstName, initials } from './initials';

describe('initials', () => {
  it('takes up to two letters', () => {
    expect(initials('محمد شهریاری')).toBe('مش');
    expect(initials('  ')).toBe('؟');
  });
});

describe('firstName', () => {
  it('falls back to شما instead of guest copy', () => {
    expect(firstName('')).toBe('شما');
    expect(firstName('من')).toBe('شما');
    expect(firstName('محمد رضا')).toBe('محمد');
  });
});
