import { canManagePeriod } from './ownership.js';
import type { MemberRole } from './types.js';

export const PERIOD_STALE_MS = 30 * 24 * 60 * 60 * 1000;

export type PeriodLifecycleStatus = 'deleted' | 'archived' | 'completed' | 'stale' | 'active';

export const PERIOD_STATUS_LABEL_FA: Record<PeriodLifecycleStatus, string> = {
  deleted: 'حذف',
  archived: 'آرشیو',
  completed: 'اتمام',
  stale: 'راکد',
  active: 'فعال',
};

export const PERIOD_DELETED_MESSAGE = 'این دوره حذف شده است';
export const PERIOD_COMPLETED_WRITE_MESSAGE = 'این دوره به اتمام رسیده است';
export const PERIOD_COMPLETED_REOPEN_HINT = 'با ثبت هزینه جدید دوره دوباره فعال می‌شود';

export type PeriodActivityRow = {
  deletedAt?: string | null;
  occurredAt?: string | null;
  createdAt?: string | null;
};

export function lastPeriodActivityAt(input: {
  createdAt: string;
  expenses?: PeriodActivityRow[];
  payments?: PeriodActivityRow[];
}): string {
  let latest = input.createdAt;
  for (const row of input.expenses || []) {
    if (row.deletedAt) continue;
    const at = row.occurredAt || row.createdAt;
    if (at && at > latest) latest = at;
  }
  for (const row of input.payments || []) {
    if (row.deletedAt) continue;
    if (row.createdAt && row.createdAt > latest) latest = row.createdAt;
  }
  return latest;
}

export function periodLifecycleStatus(input: {
  deletedAt?: string | null;
  archivedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  now?: number;
  expenses?: PeriodActivityRow[];
  payments?: PeriodActivityRow[];
}): PeriodLifecycleStatus {
  if (input.deletedAt) return 'deleted';
  if (input.archivedAt) return 'archived';
  if (input.completedAt) return 'completed';
  const last = lastPeriodActivityAt(input);
  const now = input.now ?? Date.now();
  const lastMs = Date.parse(last);
  if (!Number.isNaN(lastMs) && now - lastMs > PERIOD_STALE_MS) return 'stale';
  return 'active';
}

/** Null means the write is allowed. Expense by owner/manager on a completed period reopens it. */
export function periodLifecycleWriteDenial(input: {
  deletedAt?: string | null;
  completedAt?: string | null;
  role?: MemberRole | null;
  kind: 'expense' | 'other';
}): string | null {
  if (input.deletedAt) return PERIOD_DELETED_MESSAGE;
  if (!input.completedAt) return null;
  if (input.kind === 'expense' && canManagePeriod(input.role)) return null;
  return PERIOD_COMPLETED_WRITE_MESSAGE;
}
