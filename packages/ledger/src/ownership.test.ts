import { describe, expect, it } from 'vitest';
import {
  canAssignMemberRole,
  canManagePeriod,
  canWritePeriod,
  isPeriodOwner,
  syncedMemberRole,
} from './ownership.js';

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

  it('preserves manager without promoting to owner', () => {
    expect(syncedMemberRole('manager', 'u2', 'u1')).toBe('manager');
    expect(syncedMemberRole('manager', 'u1', 'u1')).toBe('owner');
  });
});

describe('period permission helpers', () => {
  it('allows write for owner, manager, and member', () => {
    expect(canWritePeriod('owner')).toBe(true);
    expect(canWritePeriod('manager')).toBe(true);
    expect(canWritePeriod('member')).toBe(true);
    expect(canWritePeriod('viewer')).toBe(false);
    expect(canWritePeriod(null)).toBe(false);
  });

  it('allows manage for owner and manager only', () => {
    expect(canManagePeriod('owner')).toBe(true);
    expect(canManagePeriod('manager')).toBe(true);
    expect(canManagePeriod('member')).toBe(false);
    expect(canManagePeriod('viewer')).toBe(false);
  });

  it('lets the owner assign manager, member, and viewer', () => {
    expect(canAssignMemberRole('owner', { role: 'member' }, 'manager')).toBe(true);
    expect(canAssignMemberRole('owner', { role: 'manager' }, 'member')).toBe(true);
    expect(canAssignMemberRole('owner', { role: 'viewer' }, 'viewer')).toBe(true);
    expect(canAssignMemberRole('owner', { role: 'member', isOwner: true }, 'manager')).toBe(false);
    expect(canAssignMemberRole('owner', { role: 'owner' }, 'member')).toBe(false);
    expect(canAssignMemberRole('owner', { role: 'member' }, 'owner')).toBe(false);
  });

  it('lets a manager switch member and viewer only', () => {
    expect(canAssignMemberRole('manager', { role: 'member' }, 'viewer')).toBe(true);
    expect(canAssignMemberRole('manager', { role: 'viewer' }, 'member')).toBe(true);
    expect(canAssignMemberRole('manager', { role: 'member' }, 'manager')).toBe(false);
    expect(canAssignMemberRole('manager', { role: 'manager' }, 'member')).toBe(false);
    expect(canAssignMemberRole('manager', { role: 'owner' }, 'member')).toBe(false);
    expect(canAssignMemberRole('member', { role: 'member' }, 'viewer')).toBe(false);
  });
});
