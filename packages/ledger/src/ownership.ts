import type { MemberRole } from './types.js';

/** True owner is `ownerId`. Guest periods without a cloud owner fall back to guest key / local role. */
export function isPeriodOwner(input: {
  ownerId?: string;
  ownerGuestKey?: string;
  userId?: string;
  guestKey?: string;
  memberRole?: string;
}): boolean {
  if (input.ownerId) return Boolean(input.userId && input.ownerId === input.userId);
  if (input.ownerGuestKey) return Boolean(input.guestKey && input.ownerGuestKey === input.guestKey);
  return input.memberRole === 'owner';
}

/** User sync cannot promote anyone to owner; only `ownerId` keeps that role. */
export function syncedMemberRole(
  requested: MemberRole | undefined,
  memberUserId: string | undefined,
  ownerId: string,
): MemberRole {
  if (memberUserId && memberUserId === ownerId) return 'owner';
  if (requested === 'viewer') return 'viewer';
  if (requested === 'manager') return 'manager';
  return 'member';
}

export function canWritePeriod(role: MemberRole | null | undefined): boolean {
  return role === 'owner' || role === 'manager' || role === 'member';
}

export function canManagePeriod(role: MemberRole | null | undefined): boolean {
  return role === 'owner' || role === 'manager';
}

export function canAssignMemberRole(
  actor: MemberRole | null | undefined,
  target: { role: MemberRole; isOwner?: boolean },
  next: MemberRole,
): boolean {
  if (!actor) return false;
  if (next === 'owner') return false;
  if (target.isOwner || target.role === 'owner') return false;
  if (actor === 'owner') return next === 'manager' || next === 'member' || next === 'viewer';
  if (actor === 'manager') {
    if (target.role === 'manager' || next === 'manager') return false;
    return next === 'member' || next === 'viewer';
  }
  return false;
}
