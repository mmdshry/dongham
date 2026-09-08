import { describe, expect, it } from 'vitest';
import {
  contactMatchesMemberQuery,
  memberPickKey,
  memberPickLabel,
  uniqueMemberPicks,
  type MemberPick,
} from './memberPick';

describe('member picks', () => {
  it('dedupes name and user keys separately', () => {
    const picks: MemberPick[] = [
      { kind: 'name', displayName: 'علی' },
      { kind: 'name', displayName: 'علی' },
      { kind: 'user', displayName: 'سارا', userId: 'u1', username: 'sara88' },
      { kind: 'user', displayName: 'سارا', userId: 'u1', username: 'sara88' },
    ];
    const unique = uniqueMemberPicks(picks);
    expect(unique).toHaveLength(2);
    expect(memberPickKey(unique[0]!)).toBe('n:علی');
    expect(memberPickKey(unique[1]!)).toBe('u:u1');
  });

  it('omits empty username from the label', () => {
    expect(memberPickLabel({ kind: 'user', displayName: 'سارا', userId: 'u1', username: '' })).toBe('سارا');
    expect(memberPickLabel({ kind: 'user', displayName: 'سارا', userId: 'u1', username: 'sara88' })).toBe(
      'سارا (@sara88)',
    );
  });
});

describe('contactMatchesMemberQuery', () => {
  it('matches local names after three characters and exact phone or email', () => {
    expect(contactMatchesMemberQuery('عل', { displayName: 'علی' })).toBe(false);
    expect(contactMatchesMemberQuery('علی', { displayName: 'علی رضایی' })).toBe(true);
    expect(contactMatchesMemberQuery('09128883011', { displayName: 'سارا', phone: '09128883011' })).toBe(true);
    expect(contactMatchesMemberQuery('0912', { displayName: 'سارا', phone: '09128883011' })).toBe(true);
    expect(contactMatchesMemberQuery('sara@example.com', { displayName: 'سارا', email: 'sara@example.com' })).toBe(
      true,
    );
    expect(contactMatchesMemberQuery('09128883011', { displayName: 'سارا', phone: '09120000000' })).toBe(false);
  });
});
