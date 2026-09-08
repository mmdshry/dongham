import { describe, expect, it } from 'vitest';
import { friendByUserId, friendContactTaken } from './friends';

describe('friendContactTaken', () => {
  const friends = [
    { id: '1', displayName: 'هادی', phone: '09121111111', email: 'a@ex.com' },
    { id: '2', displayName: 'سارا' },
  ];

  it('detects normalized phone and email', () => {
    expect(friendContactTaken(friends, { phone: '+989121111111' })).toBe('phone');
    expect(friendContactTaken(friends, { email: 'A@ex.com' })).toBe('email');
  });

  it('ignores empty contact and the edited row', () => {
    expect(friendContactTaken(friends, { phone: '' })).toBeNull();
    expect(friendContactTaken(friends, { phone: '09121111111' }, '1')).toBeNull();
  });
});

describe('friendByUserId', () => {
  it('finds a linked cloud user and ignores empty ids', () => {
    const friends = [
      { id: '1', displayName: 'هادی', friendUserId: 'u-1' },
      { id: '2', displayName: 'سارا' },
    ];
    expect(friendByUserId(friends, 'u-1')?.id).toBe('1');
    expect(friendByUserId(friends, 'u-9')).toBeUndefined();
    expect(friendByUserId(friends, undefined)).toBeUndefined();
  });
});
