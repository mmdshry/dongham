import { describe, expect, it } from 'vitest';
import { memberPickKey, uniqueMemberPicks, type MemberPick } from './memberPick';

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
});
