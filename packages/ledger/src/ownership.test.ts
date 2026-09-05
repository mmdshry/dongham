import { describe, expect, it } from 'vitest';
import { isPeriodOwner, syncedMemberRole } from './ownership.js';

describe('isPeriodOwner', () => {
  it('uses ownerId when the period is on the cloud', () => {
    expect(isPeriodOwner({ ownerId: 'u1', userId: 'u1', memberRole: 'member' })).toBe(true);
    expect(isPeriodOwner({ ownerId: 'u1', userId: 'u2', memberRole: 'owner' })).toBe(false);
  });

  it('falls back to guest key when there is no ownerId', () => {
    expect(isPeriodOwner({ ownerGuestKey: 'g1', guestKey: 'g1' })).toBe(true);
    expect(isPeriodOwner({ ownerGuestKey: 'g1', guestKey: 'g2', memberRole: 'owner' })).toBe(false);
    expect(isPeriodOwner({ memberRole: 'owner' })).toBe(true);
  });
});

describe('syncedMemberRole', () => {
  it('keeps owner only for the period ownerId', () => {
    expect(syncedMemberRole('owner', 'u1', 'u1')).toBe('owner');
    expect(syncedMemberRole('owner', 'u2', 'u1')).toBe('member');
    expect(syncedMemberRole('viewer', 'u2', 'u1')).toBe('viewer');
    expect(syncedMemberRole(undefined, undefined, 'u1')).toBe('member');
  });
});
