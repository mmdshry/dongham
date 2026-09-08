import { isPeriodId } from '@dongham/ledger';
import { api } from './api';
import { db } from './db';
import { toLatinDigits } from './format';
import { applyPeriodSnapshot } from './sync';

export const JOIN_OFFLINE_ERROR = 'برای ورود با شناسه باید آنلاین باشید';

export type JoinTarget = { type: 'period'; id: string } | { type: 'invite'; token: string };

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

export function parseJoinPayload(raw: string): JoinTarget | null {
  const text = toLatinDigits(raw.trim());
  if (!text) return null;
  try {
    const url = new URL(text);
    const parts = url.pathname.split('/').filter(Boolean);
    const inviteAt = parts.indexOf('i');
    if (inviteAt >= 0 && parts[inviteAt + 1]) return { type: 'invite', token: parts[inviteAt + 1]! };
    const periodAt = parts.indexOf('periods');
    if (periodAt >= 0 && parts[periodAt + 1] && isPeriodId(parts[periodAt + 1]!)) {
      return { type: 'period', id: parts[periodAt + 1]! };
    }
  } catch {
    /* not a URL */
  }
  const invite = text.match(/\/i\/([A-Za-z0-9_-]+)/);
  if (invite?.[1]) return { type: 'invite', token: invite[1] };
  const compact = text.replace(/\s/g, '');
  if (isPeriodId(compact)) return { type: 'period', id: compact };
  return null;
}

export async function resolveJoin(target: JoinTarget): Promise<{ path: string } | { error: string }> {
  if (target.type === 'invite') return { path: `/i/${target.token}` };
  const local = await db.periods.get(target.id);
  if (local) return { path: `/periods/${target.id}` };
  if (!isOnline()) return { error: JOIN_OFFLINE_ERROR };
  try {
    const snap = await api<Parameters<typeof applyPeriodSnapshot>[0]>(`/periods/${target.id}/snapshot`);
    await applyPeriodSnapshot(snap);
    return { path: `/periods/${target.id}` };
  } catch {
    return { error: 'دوره پیدا نشد' };
  }
}
