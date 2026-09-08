import { describe, expect, it } from 'vitest';
import { actorMemberIdsOf, memberBelongsToActor } from './member-match.js';

describe('memberBelongsToActor', () => {
  it('matches userId or guestKey first', () => {
    expect(memberBelongsToActor({ userId: 'u1' }, { userId: 'u1' })).toBe(true);
    expect(memberBelongsToActor({ guestKey: 'g1' }, { guestKey: 'g1' })).toBe(true);
    expect(memberBelongsToActor({ userId: 'u1', guestKey: 'g1' }, { guestKey: 'g2', userId: 'u1' })).toBe(true);
    expect(memberBelongsToActor({ guestKey: 'g1' }, { guestKey: 'g2' })).toBe(false);
    expect(memberBelongsToActor(null, { userId: 'u1' })).toBe(false);
  });

  it('matches normalized phone or email when ids differ', () => {
    expect(memberBelongsToActor({ phone: '09121111111' }, { userId: 'u1', phone: '09121111111' })).toBe(true);
    expect(memberBelongsToActor({ phone: '+989121111111' }, { phone: '09121111111' })).toBe(true);
    expect(memberBelongsToActor({ email: 'A@Ex.com' }, { email: 'a@ex.com' })).toBe(true);
    expect(memberBelongsToActor({ phone: '09121111111' }, { userId: 'u1', phone: '09122222222' })).toBe(false);
  });
});

describe('actorMemberIdsOf', () => {
  it('returns every matching seat', () => {
    expect(
      actorMemberIdsOf(
        [
          { id: 'own-1', userId: 'u1', phone: '09121111111' },
          { id: 'seat-2', phone: '09121111111' },
          { id: 'other', phone: '09123333333' },
        ],
        { userId: 'u1', phone: '09121111111' },
      ),
    ).toEqual(['own-1', 'seat-2']);
  });
});
