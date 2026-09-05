import { describe, expect, it } from 'vitest';
import { INVITE_TTL_MS, inviteExpiresAt, isInviteExpired } from './invite.js';

describe('invite expiry', () => {
  it('marks past expiresAt as expired and derives TTL from createdAt when expiresAt is missing', () => {
    expect(isInviteExpired({}, Date.parse('2026-09-01T00:00:00.000Z'))).toBe(true);
    expect(
      isInviteExpired({ expiresAt: '2026-08-01T00:00:00.000Z' }, Date.parse('2026-09-01T00:00:00.000Z')),
    ).toBe(true);
    expect(
      isInviteExpired({ createdAt: '2026-08-20T00:00:00.000Z' }, Date.parse('2026-09-01T00:00:00.000Z')),
    ).toBe(false);
    expect(
      isInviteExpired({ createdAt: '2026-07-01T00:00:00.000Z' }, Date.parse('2026-09-01T00:00:00.000Z')),
    ).toBe(true);
    const from = new Date('2026-01-01T00:00:00.000Z');
    expect(Date.parse(inviteExpiresAt(from)) - from.getTime()).toBe(INVITE_TTL_MS);
  });
});
