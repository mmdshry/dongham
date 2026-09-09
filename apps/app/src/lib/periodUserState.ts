import { ApiError, api, ensureProfile } from './api';
import { db, type LocalPeriodPref } from './db';

const PENDING_ACKS_META = 'pendingPeriodAcks';

export type PeriodAck = {
  chatMuted?: boolean;
  chatLastReadAt?: string;
  lastSeenAt?: string;
};

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function laterIso(a?: string | null, b?: string | null): string | undefined {
  if (!a) return b || undefined;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

async function loadPendingAcks(): Promise<Record<string, PeriodAck>> {
  const row = await db.meta.get(PENDING_ACKS_META);
  try {
    const parsed = row?.value ? (JSON.parse(row.value) as unknown) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, PeriodAck>;
  } catch {
    return {};
  }
}

async function savePendingAcks(acks: Record<string, PeriodAck>): Promise<void> {
  await db.meta.put({ key: PENDING_ACKS_META, value: JSON.stringify(acks) });
}

function ackEmpty(ack: PeriodAck): boolean {
  return !('chatMuted' in ack) && !ack.chatLastReadAt && !ack.lastSeenAt;
}

export async function putPeriodPref(
  periodId: string,
  patch: {
    archivedAt?: string | null;
    chatMutedAt?: string | null;
    chatLastReadAt?: string | null;
    lastSeenAt?: string | null;
  },
): Promise<LocalPeriodPref> {
  return db.transaction('rw', db.periodPrefs, async () => {
    const existing = (await db.periodPrefs.get(periodId)) || { periodId };
    const next: LocalPeriodPref = { ...existing, periodId };
    if ('archivedAt' in patch) {
      if (patch.archivedAt) next.archivedAt = patch.archivedAt;
      else delete next.archivedAt;
    }
    if ('chatMutedAt' in patch) {
      if (patch.chatMutedAt) next.chatMutedAt = patch.chatMutedAt;
      else delete next.chatMutedAt;
    }
    if ('chatLastReadAt' in patch) {
      if (patch.chatLastReadAt) next.chatLastReadAt = patch.chatLastReadAt;
      else delete next.chatLastReadAt;
    }
    if ('lastSeenAt' in patch) {
      if (patch.lastSeenAt) next.lastSeenAt = patch.lastSeenAt;
      else delete next.lastSeenAt;
    }
    const empty = !next.archivedAt && !next.chatMutedAt && !next.chatLastReadAt && !next.lastSeenAt;
    if (empty) {
      await db.periodPrefs.delete(periodId);
      return { periodId };
    }
    await db.periodPrefs.put(next);
    return next;
  });
}

export async function applyServerPeriodPref(p: {
  id: string;
  archivedAt?: string | null;
  chatMutedAt?: string | null;
  chatLastReadAt?: string | null;
  lastSeenAt?: string | null;
}): Promise<void> {
  const acks = await loadPendingAcks();
  const pending = acks[p.id];
  let chatMutedAt = p.chatMutedAt || null;
  if (pending && 'chatMuted' in pending) {
    chatMutedAt = pending.chatMuted ? chatMutedAt || new Date().toISOString() : null;
  }
  await putPeriodPref(p.id, {
    archivedAt: p.archivedAt || null,
    chatMutedAt,
    chatLastReadAt: laterIso(p.chatLastReadAt, pending?.chatLastReadAt) || null,
    lastSeenAt: laterIso(p.lastSeenAt, pending?.lastSeenAt) || null,
  });
}

async function queueAck(periodId: string, patch: PeriodAck): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    const acks = await loadPendingAcks();
    acks[periodId] = { ...acks[periodId], ...patch };
    await savePendingAcks(acks);
  });
}

export async function setPeriodChatMutedLocal(periodId: string, muted: boolean): Promise<void> {
  await putPeriodPref(periodId, { chatMutedAt: muted ? new Date().toISOString() : null });
  await queueAck(periodId, { chatMuted: muted });
  await flushPeriodAcks();
}

export async function markPeriodChatRead(periodId: string, at = new Date().toISOString()): Promise<void> {
  const existing = await db.periodPrefs.get(periodId);
  if (existing?.chatLastReadAt && Date.parse(existing.chatLastReadAt) >= Date.parse(at)) return;
  await putPeriodPref(periodId, { chatLastReadAt: at });
  await queueAck(periodId, { chatLastReadAt: at });
  await flushPeriodAcks();
}

export async function markPeriodSeen(periodId: string, at = new Date().toISOString()): Promise<void> {
  const existing = await db.periodPrefs.get(periodId);
  if (existing?.lastSeenAt && Date.parse(existing.lastSeenAt) >= Date.parse(at)) return;
  await putPeriodPref(periodId, { lastSeenAt: at });
  await queueAck(periodId, { lastSeenAt: at });
  await flushPeriodAcks();
}

export async function flushPeriodAcks(): Promise<void> {
  const profile = await ensureProfile();
  if (!profile.token || !isOnline()) return;
  const acks = await loadPendingAcks();
  const ids = Object.keys(acks);
  if (!ids.length) return;
  for (const periodId of ids) {
    const ack = acks[periodId];
    if (!ack) continue;
    try {
      if ('chatMuted' in ack) {
        await api(ack.chatMuted ? `/periods/${periodId}/chat/mute` : `/periods/${periodId}/chat/unmute`, {
          method: 'POST',
        });
        delete ack.chatMuted;
      }
      if (ack.chatLastReadAt) {
        await api(`/periods/${periodId}/chat/read`, {
          method: 'POST',
          body: JSON.stringify({ lastReadAt: ack.chatLastReadAt }),
        });
        delete ack.chatLastReadAt;
      }
      if (ack.lastSeenAt) {
        await api(`/periods/${periodId}/seen`, {
          method: 'POST',
          body: JSON.stringify({ lastSeenAt: ack.lastSeenAt }),
        });
        delete ack.lastSeenAt;
      }
      if (ackEmpty(ack)) delete acks[periodId];
      else acks[periodId] = ack;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) {
        delete acks[periodId];
      } else break;
    }
  }
  await savePendingAcks(acks);
}
