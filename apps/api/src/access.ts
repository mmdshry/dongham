import { actorMemberIdsOf, memberBelongsToActor } from '@dongham/ledger';
import { getPeriod, getUserById, listMembers } from './repo.js';
import type { MemberRole } from './types.js';

async function actorMatch(userId: string) {
  const user = await getUserById(userId);
  return { userId, phone: user?.phone, email: user?.email };
}

export async function memberMatchesUser(periodId: string, userId: string): Promise<boolean> {
  const actor = await actorMatch(userId);
  const members = await listMembers(periodId);
  return members.some((m) => memberBelongsToActor(m, actor));
}

/** Every member row in the period that belongs to this user (by userId, phone or email). */
export async function actorMemberIds(userId: string, periodId: string): Promise<string[]> {
  return actorMemberIdsOf(await listMembers(periodId), await actorMatch(userId));
}

export async function canAccessPeriod(
  userId: string | null,
  periodId: string,
  mode: 'read' | 'write' = 'read',
): Promise<boolean> {
  const period = await getPeriod(periodId);
  if (!period) return false;
  const isMember = Boolean(userId && (period.ownerId === userId || (await memberMatchesUser(periodId, userId))));
  if (period.deletedAt) return isMember;
  if (mode === 'read' && (period.visibility || 'private') === 'public') return true;
  if (!userId) return false;
  return isMember;
}

export async function periodRole(userId: string, periodId: string): Promise<MemberRole | null> {
  const period = await getPeriod(periodId);
  if (!period) return null;
  if (period.ownerId === userId) return 'owner';
  const members = await listMembers(periodId);
  const mine = members.find((m) => m.userId === userId);
  if (mine) return mine.role === 'owner' ? 'member' : mine.role;
  const actor = await actorMatch(userId);
  const matched = members.find((m) => memberBelongsToActor(m, actor));
  if (matched) return matched.role === 'owner' ? 'member' : matched.role;
  return null;
}
