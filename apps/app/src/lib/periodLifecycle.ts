import {
  PERIOD_COMPLETED_REOPEN_HINT,
  PERIOD_COMPLETED_WRITE_MESSAGE,
  PERIOD_DELETED_MESSAGE,
  canManagePeriod,
  canWritePeriod,
  isPeriodOwner,
  periodLifecycleStatus,
  periodLifecycleWriteDenial,
  type MemberRole,
  type PeriodLifecycleStatus,
} from '@dongham/ledger';
import { db, type LocalExpense, type LocalMember, type LocalPayment, type LocalPeriod, type LocalProfile } from './db';
import { isSelfMember } from './memberLabel';
import { putPeriodPref } from './periodUserState';
import { logActivity, queueOp } from './sync';

export {
  PERIOD_COMPLETED_REOPEN_HINT,
  PERIOD_COMPLETED_WRITE_MESSAGE,
  PERIOD_DELETED_MESSAGE,
  periodLifecycleStatus,
};
export type { PeriodLifecycleStatus };

export function actorRoleOf(
  period: LocalPeriod | undefined,
  members: LocalMember[],
  profile: LocalProfile | null | undefined,
): MemberRole | undefined {
  const me = members.find((m) => isSelfMember(m, profile));
  if (
    isPeriodOwner({
      ownerId: period?.ownerId,
      ownerGuestKey: period?.ownerGuestKey,
      userId: profile?.userId,
      guestKey: profile?.guestKey,
      memberRole: me?.role,
    })
  ) {
    return 'owner';
  }
  return me?.role;
}

export function periodStatusOf(
  period: LocalPeriod,
  opts: {
    archivedAt?: string | null;
    expenses?: LocalExpense[];
    payments?: LocalPayment[];
    now?: number;
  } = {},
): PeriodLifecycleStatus {
  return periodLifecycleStatus({
    deletedAt: period.deletedAt,
    archivedAt: opts.archivedAt,
    completedAt: period.completedAt,
    createdAt: period.createdAt,
    now: opts.now,
    expenses: opts.expenses,
    payments: opts.payments,
  });
}

export async function archivedAtOf(periodId: string): Promise<string | undefined> {
  const row = await db.periodPrefs.get(periodId);
  return row?.archivedAt;
}

async function actorName(profile: LocalProfile | null | undefined): Promise<string> {
  return profile?.displayName || 'کاربر';
}

export async function setPeriodArchivedLocal(periodId: string, archived: boolean): Promise<void> {
  if (archived) {
    await putPeriodPref(periodId, { archivedAt: new Date().toISOString() });
    await queueOp(periodId, 'periodLifecycle', 'archive', {});
    return;
  }
  await putPeriodPref(periodId, { archivedAt: null });
  await queueOp(periodId, 'periodLifecycle', 'unarchive', {});
}

export async function completePeriodLocal(period: LocalPeriod, profile?: LocalProfile | null): Promise<void> {
  const now = new Date().toISOString();
  await db.periods.put({
    ...period,
    completedAt: now,
    completedByUserId: profile?.userId,
    updatedAt: now,
  });
  await logActivity(period.id, await actorName(profile), 'period.complete', `دوره «${period.title}» به اتمام رسید`, undefined, {
    localOnly: true,
  });
  await queueOp(period.id, 'periodLifecycle', 'complete', {});
}

export async function softDeletePeriodLocal(period: LocalPeriod, profile?: LocalProfile | null): Promise<void> {
  const now = new Date().toISOString();
  await db.periods.put({
    ...period,
    deletedAt: now,
    deletedByUserId: profile?.userId,
    updatedAt: now,
  });
  await logActivity(period.id, await actorName(profile), 'period.delete', `دوره «${period.title}» حذف شد`, undefined, {
    localOnly: true,
  });
  await queueOp(period.id, 'periodLifecycle', 'delete', {});
}

export async function restorePeriodLocal(period: LocalPeriod, profile?: LocalProfile | null): Promise<void> {
  const { deletedAt: _d, deletedByUserId: _by, ...rest } = period;
  await db.periods.put({ ...rest, updatedAt: new Date().toISOString() });
  await logActivity(period.id, await actorName(profile), 'period.restore', `دوره «${period.title}» بازیابی شد`, undefined, {
    localOnly: true,
  });
  await queueOp(period.id, 'periodLifecycle', 'restore', {});
}

export async function reopenPeriodLocal(periodId: string): Promise<void> {
  const period = await db.periods.get(periodId);
  if (!period?.completedAt) return;
  const { completedAt: _c, completedByUserId: _by, ...rest } = period;
  await db.periods.put({ ...rest, updatedAt: new Date().toISOString() });
}

export function periodWriteMessage(
  period: LocalPeriod | undefined,
  role: MemberRole | null | undefined,
  kind: 'expense' | 'other',
): string | null {
  if (!period) return null;
  return periodLifecycleWriteDenial({
    deletedAt: period.deletedAt,
    completedAt: period.completedAt,
    role,
    kind,
  });
}

export function canArchivePeriod(role: MemberRole | null | undefined): boolean {
  return canWritePeriod(role);
}

export function canCompleteOrDeletePeriod(role: MemberRole | null | undefined): boolean {
  return canManagePeriod(role);
}
