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
  return 'member';
}
