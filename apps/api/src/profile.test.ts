import { describe, expect, it } from 'vitest';
import { signupDisplayName } from './profile.js';

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
