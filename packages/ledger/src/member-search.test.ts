import { describe, expect, it } from 'vitest';
import {
  classifyMemberSearchQuery,
  memberSearchNeedsCloud,
  MEMBER_SEARCH_MIN,
} from './member-search.js';

describe('classifyMemberSearchQuery', () => {
  it('requires at least three characters after normalizing digits and @', () => {
    expect(classifyMemberSearchQuery('')).toEqual({ kind: 'too_short' });
    expect(classifyMemberSearchQuery('  ')).toEqual({ kind: 'too_short' });
    expect(classifyMemberSearchQuery('ab')).toEqual({ kind: 'too_short' });
    expect(classifyMemberSearchQuery('@ab')).toEqual({ kind: 'too_short' });
    expect(classifyMemberSearchQuery('09')).toEqual({ kind: 'too_short' });
    expect(MEMBER_SEARCH_MIN).toBe(3);
  });

  it('matches a complete Iranian mobile exactly, including Persian digits', () => {
    expect(classifyMemberSearchQuery('09128883011')).toEqual({ kind: 'phone', phone: '09128883011' });
    expect(classifyMemberSearchQuery('  +98 912 888 3011 ')).toEqual({ kind: 'phone', phone: '09128883011' });
    expect(classifyMemberSearchQuery('۰۹۱۲۸۸۸۳۰۱۱')).toEqual({ kind: 'phone', phone: '09128883011' });
  });

  it('does not prefix-search an incomplete mobile', () => {
    expect(classifyMemberSearchQuery('0912')).toEqual({ kind: 'incomplete_phone' });
    expect(classifyMemberSearchQuery('98912')).toEqual({ kind: 'incomplete_phone' });
  });

  it('matches a complete email exactly', () => {
    expect(classifyMemberSearchQuery('Sara@Example.com')).toEqual({
      kind: 'email',
      email: 'sara@example.com',
    });
  });

  it('does not search incomplete emails as usernames', () => {
    expect(classifyMemberSearchQuery('sara@')).toEqual({ kind: 'empty' });
    expect(classifyMemberSearchQuery('a@b')).toEqual({ kind: 'empty' });
  });

  it('treats latin username prefixes as prefix search', () => {
    expect(classifyMemberSearchQuery('sar')).toEqual({ kind: 'username', prefix: 'sar' });
    expect(classifyMemberSearchQuery('@Ali12')).toEqual({ kind: 'username', prefix: 'ali12' });
    expect(classifyMemberSearchQuery('  sara88  ')).toEqual({ kind: 'username', prefix: 'sara88' });
  });

  it('does not search Persian display names on the cloud directory', () => {
    expect(classifyMemberSearchQuery('علی')).toEqual({ kind: 'empty' });
    expect(classifyMemberSearchQuery('محمد رضا')).toEqual({ kind: 'empty' });
  });
});

describe('memberSearchNeedsCloud', () => {
  it('only hits the directory for phone, email, or username', () => {
    expect(memberSearchNeedsCloud({ kind: 'username', prefix: 'sar' })).toBe(true);
    expect(memberSearchNeedsCloud({ kind: 'phone', phone: '09128883011' })).toBe(true);
    expect(memberSearchNeedsCloud({ kind: 'email', email: 'a@b.co' })).toBe(true);
    expect(memberSearchNeedsCloud({ kind: 'too_short' })).toBe(false);
    expect(memberSearchNeedsCloud({ kind: 'incomplete_phone' })).toBe(false);
    expect(memberSearchNeedsCloud({ kind: 'empty' })).toBe(false);
  });
});
