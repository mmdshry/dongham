import { normalizeEmail, normalizeIranMobile } from '@dongham/ledger';
import { getPeriod, getUserById, listMembers } from './repo.js';
import type { MemberRole } from './types.js';

export async function memberMatchesUser(periodId: string, userId: string): Promise<boolean> {
  const user = await getUserById(userId);
  const phone = normalizeIranMobile(user?.phone);
  const email = normalizeEmail(user?.email);
  const members = await listMembers(periodId);
  return members.some((m) => {
    if (m.userId === userId) return true;
    if (phone && normalizeIranMobile(m.phone) === phone) return true;
    if (email && m.email && normalizeEmail(m.email) === email) return true;
    return false;
  });
}

export async function canAccessPeriod(
  userId: string | null,
  periodId: string,
  mode: 'read' | 'write' = 'read',
): Promise<boolean> {
  const period = await getPeriod(periodId);
  if (!period) return false;
  if (mode === 'read' && (period.visibility || 'private') === 'public') return true;
  if (!userId) return false;
  if (period.ownerId === userId) return true;
  return memberMatchesUser(periodId, userId);
}

export async function periodRole(userId: string, periodId: string): Promise<MemberRole | null> {
  const period = await getPeriod(periodId);
  if (!period) return null;
  if (period.ownerId === userId) return 'owner';
  const members = await listMembers(periodId);
  const mine = members.find((m) => m.userId === userId);
  if (mine) return mine.role === 'owner' ? 'member' : mine.role;
  if (await memberMatchesUser(periodId, userId)) {
    const user = await getUserById(userId);
    const phone = normalizeIranMobile(user?.phone);
    const email = normalizeEmail(user?.email);
    const matched = members.find((m) => {
      if (phone && normalizeIranMobile(m.phone) === phone) return true;
      if (email && m.email && normalizeEmail(m.email) === email) return true;
      return false;
    });
    return matched?.role === 'viewer' ? 'viewer' : 'member';
  }
  return null;
}
