import { nanoid } from 'nanoid';
import type { PeriodKind, PeriodTemplate, PeriodVisibility, RoundTo } from '@dongham/ledger';
import { isInviteExpired, newPeriodId } from '@dongham/ledger';
import { ApiError, api, ensureProfile } from './api';
import { shouldImmediateSync } from './connectionMode';
import { useUiStore } from '../store/ui';
import {
  db,
  noneCharge,
  POT_DISPLAY_NAME,
  type LocalActivity,
  type LocalChat,
  type LocalExpense,
  type LocalFriend,
  type LocalMember,
  type LocalNotification,
  type LocalPayment,
  type LocalPeriod,
  type LocalRecurring,
} from './db';
import { templateById } from './templates';
import { needsDisplayName } from './memberLabel';
import type { MemberPick } from './memberPick';
import { periodMediaFields, periodMediaSyncPayload, presetFromTemplate } from './periodCover';

type OutboxEntity = 'expense' | 'payment' | 'member' | 'chat' | 'period' | 'activity' | 'recurring' | 'periodLifecycle';

type SyncOp = {
  entity: OutboxEntity;
  action: 'upsert' | 'delete' | 'complete' | 'restore' | 'archive' | 'unarchive';
  payload: unknown;
};

type PeriodSyncResult = {
  version: number;
  expenses: LocalExpense[];
  payments: LocalPayment[];
  members: LocalMember[];
  chat: LocalChat[];
  activity?: LocalActivity[];
  recurring?: LocalRecurring[];
  period?: Partial<LocalPeriod>;
  invites?: { token: string; periodId: string; createdAt: string; expiresAt?: string }[];
};

export function coalesceSyncOps(ops: SyncOp[]): SyncOp[] {
  const mergedPeriod: Record<string, unknown> = {};
  let hasPeriodUpsert = false;
  const rest: SyncOp[] = [];
  for (const op of ops) {
    if (op.entity === 'period' && op.action === 'upsert') {
      Object.assign(mergedPeriod, op.payload && typeof op.payload === 'object' ? op.payload : {});
      hasPeriodUpsert = true;
      continue;
    }
    rest.push(op);
  }
  if (hasPeriodUpsert) rest.unshift({ entity: 'period', action: 'upsert', payload: mergedPeriod });
  return rest;
}

async function postPeriodToCloud(period: LocalPeriod) {
  const members = await db.members.where('periodId').equals(period.id).toArray();
  const res = await api<{ period?: { version?: number } }>('/periods', {
    method: 'POST',
    body: JSON.stringify({
      id: period.id,
      title: period.title,
      currency: period.currency,
      kind: period.kind,
      template: period.template,
      roundTo: period.roundTo,
      bankerMemberId: period.bankerMemberId,
      buildingCharge: period.buildingCharge,
      lunchTurnMemberId: period.lunchTurnMemberId,
      encrypted: period.encrypted,
      visibility: period.visibility,
      ...periodMediaSyncPayload(period),
      members,
    }),
  });
  if (typeof res.period?.version === 'number') {
    await db.periods.update(period.id, { synced: true, version: res.period.version });
  }
  return { members, version: res.period?.version };
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

type WriteResult = { version?: number; period?: { version?: number } };

function versionOf(res: WriteResult | void): number | undefined {
  if (!res) return undefined;
  if (typeof res.version === 'number') return res.version;
  if (typeof res.period?.version === 'number') return res.period.version;
  return undefined;
}

async function fetchPeriodVersion(periodId: string): Promise<number | undefined> {
  const { periods } = await api<{ periods: { id: string; version?: number }[] }>('/periods');
  return periods.find((p) => p.id === periodId)?.version;
}

async function markPeriodSynced(periodId: string, version?: number) {
  const next = typeof version === 'number' ? version : await fetchPeriodVersion(periodId).catch(() => undefined);
  await db.periods.update(periodId, {
    synced: true,
    updatedAt: new Date().toISOString(),
    ...(typeof next === 'number' ? { version: next } : {}),
  });
}

async function flushOneOp(periodId: string, op: SyncOp): Promise<number | undefined> {
  const payload = (op.payload && typeof op.payload === 'object' ? op.payload : {}) as Record<string, unknown> & {
    id?: string;
    deletedAt?: string;
  };
  if (op.entity === 'expense') {
    if (op.action === 'delete' || payload.deletedAt) {
      if (payload.id) {
        return versionOf(await api<WriteResult>(`/periods/${periodId}/expenses/${payload.id}`, { method: 'DELETE' }));
      }
      return undefined;
    }
    return versionOf(
      await api<WriteResult>(`/periods/${periodId}/expenses`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, periodId }),
      }),
    );
  }
  if (op.entity === 'payment') {
    if (op.action === 'delete' || payload.deletedAt) {
      if (payload.id) {
        return versionOf(await api<WriteResult>(`/periods/${periodId}/payments/${payload.id}`, { method: 'DELETE' }));
      }
      return undefined;
    }
    return versionOf(
      await api<WriteResult>(`/periods/${periodId}/payments`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, periodId }),
      }),
    );
  }
  if (op.entity === 'member') {
    const memberId = typeof payload.id === 'string' ? payload.id : '';
    if (memberId) {
      try {
        return versionOf(
          await api<WriteResult>(`/periods/${periodId}/members/${memberId}`, {
            method: 'PATCH',
            body: JSON.stringify({ ...payload, periodId }),
          }),
        );
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 404) throw e;
      }
    }
    return versionOf(
      await api<WriteResult>(`/periods/${periodId}/members`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, periodId }),
      }),
    );
  }
  if (op.entity === 'chat') {
    return versionOf(await api<WriteResult>(`/periods/${periodId}/chat`, { method: 'POST', body: JSON.stringify(payload) }));
  }
  if (op.entity === 'period') {
    const local = await db.periods.get(periodId);
    const members = await db.members.where('periodId').equals(periodId).toArray();
    return versionOf(
      await api<WriteResult>('/periods', {
        method: 'POST',
        body: JSON.stringify({
          id: periodId,
          title: local?.title,
          currency: local?.currency,
          ...payload,
          members,
        }),
      }),
    );
  }
  if (op.entity === 'activity') {
    return versionOf(
      await api<WriteResult>(`/periods/${periodId}/activity`, { method: 'POST', body: JSON.stringify(payload) }),
    );
  }
  if (op.entity === 'recurring') {
    return versionOf(
      await api<WriteResult>(`/periods/${periodId}/recurring`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, periodId }),
      }),
    );
  }
  if (op.entity === 'periodLifecycle') {
    if (op.action === 'complete') {
      return versionOf(await api<WriteResult>(`/periods/${periodId}/complete`, { method: 'POST' }));
    }
    if (op.action === 'restore') {
      return versionOf(await api<WriteResult>(`/periods/${periodId}/restore`, { method: 'POST' }));
    }
    if (op.action === 'delete') {
      return versionOf(await api<WriteResult>(`/periods/${periodId}`, { method: 'DELETE' }));
    }
    if (op.action === 'archive') {
      await api(`/periods/${periodId}/archive`, { method: 'POST' });
      return undefined;
    }
    if (op.action === 'unarchive') {
      await api(`/periods/${periodId}/unarchive`, { method: 'POST' });
      return undefined;
    }
  }
  return undefined;
}


async function enqueueOp(
  periodId: string,
  entity: OutboxEntity,
  action: SyncOp['action'],
  payload: unknown,
) {
  await db.outbox.add({
    periodId,
    entity,
    action,
    payload,
    createdAt: new Date().toISOString(),
    tries: 0,
  });
}

export async function queueOp(
  periodId: string,
  entity: OutboxEntity,
  action: SyncOp['action'],
  payload: unknown,
) {
  const profile = await ensureProfile();
  if (shouldImmediateSync(profile, isOnline())) {
    try {
      const version = await flushOneOp(periodId, { entity, action, payload });
      await markPeriodSynced(periodId, version);
      if (entity === 'chat') {
        const chatId = (payload as { id?: string }).id;
        if (chatId) await db.chat.update(chatId, { synced: true });
      }
      return;
    } catch (e) {
      // The server rejected this write for good (auth / validation / duplicate): queuing it would
      // only make the outbox fail forever. Surface the message and keep the local row unsynced.
      if (e instanceof ApiError && isTerminalWriteError(e)) {
        useUiStore.getState().setToast(e.message || 'ذخیره روی سرور انجام نشد', 'error');
        await db.periods.update(periodId, { synced: false });
        return;
      }
    }
  }
  await enqueueOp(periodId, entity, action, payload);
}

/** 4xx answers that will not change on retry (network/5xx are retried via the outbox). */
function isTerminalWriteError(e: ApiError): boolean {
  return e.status === 400 || e.status === 403 || e.status === 409 || e.status === 410;
}

export async function logActivity(
  periodId: string,
  actorName: string,
  action: string,
  summary: string,
  entityId?: string,
  opts?: { localOnly?: boolean },
) {
  const row = {
    id: nanoid(),
    periodId,
    actorName,
    action,
    summary,
    createdAt: new Date().toISOString(),
    entityId,
  };
  await db.activity.put(row);
  if (opts?.localOnly) return;
  await queueOp(periodId, 'activity', 'upsert', row);
}

export type CloudPeriodSnapshot = {
  period: Partial<LocalPeriod> & {
    id: string;
    title: string;
    currency: string;
    createdAt: string;
    updatedAt: string;
    version: number;
  };
  members: (Partial<LocalMember> & { id: string; displayName: string })[];
  expenses?: LocalExpense[];
  payments?: LocalPayment[];
  chat?: LocalChat[];
  activity?: LocalActivity[];
  recurring?: LocalRecurring[];
  invites?: { token: string; periodId: string; createdAt: string; expiresAt?: string }[];
  version?: number;
};

export type PeriodSnapshot = CloudPeriodSnapshot;

async function dropMissingIds(
  table: {
    where: (key: string) => { equals: (value: string) => { toArray: () => Promise<{ id: string }[]> } };
    bulkDelete: (ids: string[]) => Promise<unknown>;
  },
  periodId: string,
  keepIds: Set<string>,
) {
  const local = await table.where('periodId').equals(periodId).toArray();
  const drop = local.filter((row) => !keepIds.has(row.id)).map((row) => row.id);
  if (drop.length) await table.bulkDelete(drop);
}

export async function applyPeriodSnapshot(snap: PeriodSnapshot): Promise<void> {
  const currency = snap.period.currency || 'IRT';
  const prevPeriod = await db.periods.get(snap.period.id);
  await db.periods.put({
    id: snap.period.id,
    title: snap.period.title,
    currency,
    baseCurrency:
      prevPeriod && prevPeriod.currency === currency ? prevPeriod.baseCurrency || currency : currency,
    createdAt: snap.period.createdAt,
    updatedAt: snap.period.updatedAt,
    version: snap.period.version,
    synced: true,
    kind: snap.period.kind || 'split',
    template: snap.period.template || 'custom',
    roundTo: snap.period.roundTo ?? 0,
    bankerMemberId: snap.period.bankerMemberId,
    buildingCharge: snap.period.buildingCharge,
    lunchTurnMemberId: snap.period.lunchTurnMemberId,
    encrypted: snap.period.encrypted,
    // The server never stores the guest owner key; keep the local one so the owner UI survives logout.
    ownerGuestKey: snap.period.ownerGuestKey ?? prevPeriod?.ownerGuestKey,
    ownerId: snap.period.ownerId,
    visibility: snap.period.visibility || 'private',
    ...periodMediaFields(snap.period),
    ...(snap.period.deletedAt ? { deletedAt: snap.period.deletedAt } : {}),
    ...(snap.period.deletedByUserId ? { deletedByUserId: snap.period.deletedByUserId } : {}),
    ...(snap.period.completedAt ? { completedAt: snap.period.completedAt } : {}),
    ...(snap.period.completedByUserId ? { completedByUserId: snap.period.completedByUserId } : {}),
  });
  const pid = snap.period.id;
  for (const m of snap.members || []) {
    const prev = await db.members.get(m.id);
    await db.members.put({
      id: m.id,
      periodId: pid,
      displayName: m.displayName,
      guestKey: m.guestKey ?? prev?.guestKey,
      userId: m.userId ?? prev?.userId,
      weightDefault: m.weightDefault ?? prev?.weightDefault ?? 1,
      role: m.role || prev?.role || 'member',
      phone: m.phone ?? prev?.phone,
      email: m.email ?? prev?.email,
      cardNumber: m.cardNumber ?? prev?.cardNumber,
      sheba: m.sheba ?? prev?.sheba,
      cardHolderName: m.cardHolderName ?? prev?.cardHolderName,
      bankName: m.bankName ?? prev?.bankName,
      excludeFromNew: m.excludeFromNew ?? prev?.excludeFromNew,
      isPot: m.isPot ?? prev?.isPot,
      unitLabel: m.unitLabel ?? prev?.unitLabel,
    });
  }
  await dropMissingIds(db.members, pid, new Set((snap.members || []).map((m) => m.id)));
  if (Array.isArray(snap.expenses)) {
    for (const e of snap.expenses) {
      await db.expenses.put({
        ...e,
        periodId: pid,
        service: e.service || noneCharge(),
        tip: e.tip || noneCharge(),
        tax: e.tax || noneCharge(),
        payers: e.payers || [],
        occurredAt: e.occurredAt || e.createdAt,
        attachmentDataUrl: e.attachmentDataUrl,
      });
    }
    await dropMissingIds(db.expenses, pid, new Set(snap.expenses.map((e) => e.id)));
  }
  if (Array.isArray(snap.payments)) {
    for (const p of snap.payments) await db.payments.put({ ...p, periodId: pid });
    await dropMissingIds(db.payments, pid, new Set(snap.payments.map((p) => p.id)));
  }
  if (Array.isArray(snap.chat)) {
    for (const msg of snap.chat) {
      await db.chat.put({
        id: msg.id,
        periodId: pid,
        senderMemberId: msg.senderMemberId,
        body: msg.body,
        expenseId: msg.expenseId,
        createdAt: msg.createdAt,
        synced: true,
      });
    }
    await dropMissingIds(db.chat, pid, new Set(snap.chat.map((m) => m.id)));
  }
  if (Array.isArray(snap.activity)) {
    for (const a of snap.activity) await db.activity.put({ ...a, periodId: pid });
    await dropMissingIds(db.activity, pid, new Set(snap.activity.map((a) => a.id)));
  }
  if (Array.isArray(snap.recurring)) {
    for (const r of snap.recurring) await db.recurring.put({ ...r, periodId: pid });
    await dropMissingIds(db.recurring, pid, new Set(snap.recurring.map((r) => r.id)));
  }
  if (Array.isArray(snap.invites)) {
    const keep = new Set<string>();
    for (const inv of snap.invites) {
      if (!inv.token || isInviteExpired(inv)) continue;
      keep.add(inv.token);
      await db.invites.put({
        token: inv.token,
        periodId: pid,
        createdAt: inv.createdAt || new Date().toISOString(),
        expiresAt: inv.expiresAt,
      });
    }
    const localInvites = await db.invites.where('periodId').equals(pid).toArray();
    const drop = localInvites.filter((row) => !keep.has(row.token) || isInviteExpired(row)).map((row) => row.token);
    if (drop.length) await db.invites.bulkDelete(drop);
  }
}

const PENDING_READS_META = 'pendingNotificationReads';

async function pendingNotificationReads(): Promise<Set<string>> {
  const row = await db.meta.get(PENDING_READS_META);
  try {
    const parsed = row?.value ? (JSON.parse(row.value) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

async function savePendingNotificationReads(ids: Set<string>): Promise<void> {
  await db.meta.put({ key: PENDING_READS_META, value: JSON.stringify([...ids]) });
}

/** Send queued «read» marks; the next pull must not flip them back to unread. */
export async function flushNotificationReads(): Promise<void> {
  const pending = await pendingNotificationReads();
  if (!pending.size) return;
  const profile = await ensureProfile();
  if (!profile.token || !isOnline()) return;
  for (const id of [...pending]) {
    try {
      await api(`/notifications/${id}/read`, { method: 'POST' });
      pending.delete(id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) pending.delete(id);
      else break;
    }
  }
  await savePendingNotificationReads(pending);
}

export async function markNotificationRead(id: string): Promise<void> {
  const row = await db.notifications.get(id);
  if (!row || row.read) return;
  await db.notifications.update(id, { read: true });
  const profile = await ensureProfile();
  if (!profile.token) return;
  const pending = await pendingNotificationReads();
  pending.add(id);
  await savePendingNotificationReads(pending);
  await flushNotificationReads();
}

export async function createPeriodLocal(input: {
  title: string;
  currency?: string;
  memberNames?: string[];
  memberPicks?: MemberPick[];
  kind?: PeriodKind;
  template?: PeriodTemplate;
  roundTo?: RoundTo;
  bankerName?: string;
  buildingCharge?: number;
  lunchTurnMemberId?: string;
  visibility?: PeriodVisibility;
  coverPreset?: string;
  coverDataUrl?: string;
}): Promise<string> {
  const profile = await ensureProfile();
  const taken = (await db.periods.toArray()).map((p) => p.id);
  const id = newPeriodId(taken);
  const now = new Date().toISOString();
  const kind = input.kind || 'split';
  const template = input.template || 'custom';
  const mediaPreset = input.coverPreset || presetFromTemplate(template);
  const period: LocalPeriod = {
    id,
    title: input.title,
    currency: input.currency || 'IRT',
    baseCurrency: input.currency || 'IRT',
    createdAt: now,
    updatedAt: now,
    version: 0,
    synced: false,
    ownerGuestKey: profile.guestKey,
    ownerId: profile.userId,
    kind,
    template,
    roundTo: input.roundTo ?? 0,
    buildingCharge: input.buildingCharge,
    lunchTurnMemberId: input.lunchTurnMemberId,
    visibility: input.visibility || 'private',
    coverPreset: mediaPreset,
    coverDataUrl: input.coverDataUrl,
  };
  await db.periods.put(period);
  const selfMemberId = nanoid();
  await db.members.put({
    id: selfMemberId,
    periodId: id,
    displayName: needsDisplayName(profile.displayName) ? 'کاربر' : profile.displayName,
    guestKey: profile.guestKey,
    userId: profile.userId,
    phone: profile.phone,
    weightDefault: 1,
    role: 'owner',
  });

  let bankerMemberId: string | undefined;
  if (kind === 'banker') {
    bankerMemberId = selfMemberId;
    await db.periods.update(id, { bankerMemberId });
  }

  if (kind === 'pot') {
    await db.members.put({
      id: nanoid(),
      periodId: id,
      displayName: POT_DISPLAY_NAME,
      weightDefault: 1,
      role: 'member',
      isPot: true,
    });
  }

  if (template === 'work') {
    period.lunchTurnMemberId = selfMemberId;
    await db.periods.update(id, { lunchTurnMemberId: selfMemberId });
  }

  const friends = await db.friends.toArray();
  const picks: MemberPick[] =
    input.memberPicks ||
    (input.memberNames || []).map((displayName) => ({ kind: 'name' as const, displayName }));
  for (const pick of picks) {
    if (pick.kind === 'user') {
      if (pick.userId && pick.userId === profile.userId) continue;
      const mid = nanoid();
      await db.members.put({
        id: mid,
        periodId: id,
        displayName: pick.displayName,
        userId: pick.userId,
        weightDefault: 1,
        role: 'member',
      });
      continue;
    }
    const name = pick.displayName.trim();
    if (!name || name === profile.displayName) continue;
    const friend = friends.find((f) => f.displayName === name);
    const mid = nanoid();
    await db.members.put({
      id: mid,
      periodId: id,
      displayName: name,
      phone: friend?.phone,
      email: friend?.email,
      weightDefault: 1,
      role: 'member',
    });
  }

  const tpl = templateById(template);
  const members = await db.members.where('periodId').equals(id).toArray();
  const payer = members.find((m) => m.id === selfMemberId) || members[0];
  if (tpl.recurring && payer) {
    for (const rule of tpl.recurring) {
      const row: LocalRecurring = {
        id: nanoid(),
        periodId: id,
        title: rule.title,
        amount: 0,
        currency: period.currency,
        payerId: payer.id,
        splitMode: 'equal',
        shares: members.filter((m) => !m.isPot).map((m) => ({ memberId: m.id, value: 1 })),
        intervalDays: rule.intervalDays || (rule.cadence === 'jalaliBimonthly' ? 60 : 30),
        cadence: rule.cadence || 'days',
        nextAt: now,
        active: true,
      };
      await db.recurring.put(row);
      await queueOp(id, 'recurring', 'upsert', row);
    }
  }

  await queueOp(id, 'period', 'upsert', {
    title: period.title,
    currency: period.currency,
    kind: period.kind,
    template: period.template,
    roundTo: period.roundTo,
    bankerMemberId,
    buildingCharge: period.buildingCharge,
    lunchTurnMemberId: period.lunchTurnMemberId,
    visibility: period.visibility,
    ...periodMediaSyncPayload(period),
  });
  const usernameByUserId = new Map(
    picks.filter((p): p is Extract<MemberPick, { kind: 'user' }> => p.kind === 'user').map((p) => [p.userId, p.username]),
  );
  for (const member of await db.members.where('periodId').equals(id).toArray()) {
    const username = member.userId ? usernameByUserId.get(member.userId) : undefined;
    await queueOp(id, 'member', 'upsert', username ? { ...member, username } : member);
  }
  await logActivity(id, profile.displayName, 'period.create', `دوره «${period.title}» ساخته شد`);
  return id;
}

export async function savePeriodMedia(
  periodId: string,
  media: {
    coverPreset?: string;
    coverDataUrl?: string;
  },
): Promise<void> {
  const period = await db.periods.get(periodId);
  if (!period) return;
  const next: LocalPeriod = { ...period, updatedAt: new Date().toISOString() };
  if (media.coverPreset) next.coverPreset = media.coverPreset;
  else delete next.coverPreset;
  if (media.coverDataUrl) next.coverDataUrl = media.coverDataUrl;
  else delete next.coverDataUrl;
  await db.periods.put(next);
  await queueOp(periodId, 'period', 'upsert', periodMediaSyncPayload(next));
}

export async function upsertExpense(expense: LocalExpense) {
  const prev = await db.expenses.get(expense.id);
  const normalized: LocalExpense = {
    ...expense,
    service: expense.service || noneCharge(),
    tip: expense.tip || noneCharge(),
    tax: expense.tax || noneCharge(),
    payers: expense.payers || [],
    occurredAt: expense.occurredAt || expense.createdAt,
  };
  await db.expenses.put(normalized);
  if (!normalized.deletedAt) {
    const period = await db.periods.get(expense.periodId);
    if (period?.completedAt) {
      const { completedAt: _c, completedByUserId: _by, ...rest } = period;
      await db.periods.put({ ...rest, updatedAt: expense.updatedAt });
    }
  }
  await db.periods.update(expense.periodId, { updatedAt: expense.updatedAt });
  await queueOp(expense.periodId, 'expense', 'upsert', normalized);
  const profile = await ensureProfile();
  const isUpdate = !!prev && !expense.deletedAt;
  await logActivity(
    expense.periodId,
    profile.displayName,
    expense.deletedAt ? 'expense.delete' : isUpdate ? 'expense.update' : 'expense.upsert',
    expense.deletedAt
      ? `حذف هزینه «${expense.title}»`
      : isUpdate
        ? `ویرایش هزینه «${expense.title}»`
        : `ثبت هزینه «${expense.title}»`,
    expense.id,
    { localOnly: true },
  );
}

export async function upsertPayment(payment: LocalPayment) {
  await db.payments.put(payment);
  await db.periods.update(payment.periodId, { updatedAt: payment.updatedAt });
  await queueOp(payment.periodId, 'payment', 'upsert', payment);
  const profile = await ensureProfile();
  await logActivity(
    payment.periodId,
    profile.displayName,
    'payment.upsert',
    payment.kind === 'loan' ? 'ثبت قرض' : 'ثبت تسویه',
    payment.id,
    { localOnly: true },
  );
}

export async function upsertRecurring(rule: LocalRecurring) {
  await db.recurring.put(rule);
  await queueOp(rule.periodId, 'recurring', 'upsert', rule);
}

export async function pullCloud(): Promise<{ ok: boolean; error?: string }> {
  const profile = await ensureProfile();
  if (!profile.token) return { ok: false, error: 'برای همگام‌سازی وارد شوید' };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { ok: false, error: 'آفلاین هستید' };
  try {
    try {
      const { syncCloudProfile } = await import('./cloudProfile');
      await syncCloudProfile();
    } catch {
      /* optional */
    }
    const { periods } = await api<{
      periods: {
        id: string;
        version?: number;
        updatedAt?: string;
        deletedAt?: string | null;
        completedAt?: string | null;
        archivedAt?: string | null;
        chatMutedAt?: string | null;
        chatLastReadAt?: string | null;
        lastSeenAt?: string | null;
      }[];
    }>('/periods');
    let serverAhead = false;
    const { applyServerPeriodPref, flushPeriodAcks } = await import('./periodUserState');
    await flushPeriodAcks();
    for (const p of periods) {
      const local = await db.periods.get(p.id);
      const pendingRows = await db.outbox.where('periodId').equals(p.id).toArray();
      const pendingLifecycle = pendingRows.some((row) => row.entity === 'periodLifecycle');
      if (local && !pendingLifecycle) {
        const next = { ...local };
        if (p.deletedAt) next.deletedAt = p.deletedAt;
        else delete next.deletedAt;
        if (p.completedAt) next.completedAt = p.completedAt;
        else delete next.completedAt;
        await db.periods.put(next);
      }
      if (!pendingLifecycle) await applyServerPeriodPref(p);
      const upToDate = Boolean(local && typeof p.version === 'number' && local.version >= p.version);
      // Periods with queued local writes are pulled only after those flush (last write wins).
      const pending = pendingRows.length;
      if (pending > 0) {
        if (local && !upToDate) serverAhead = true;
        continue;
      }
      if (upToDate) continue;
      const snap = await api<PeriodSnapshot>(`/periods/${p.id}/snapshot`);
      await applyPeriodSnapshot(snap);
    }
    useUiStore.getState().setServerAhead(serverAhead);
    try {
      await pullFriends();
    } catch {
      /* optional */
    }
    try {
      await flushNotificationReads();
      const stillPending = await pendingNotificationReads();
      const { notifications } = await api<{ notifications: LocalNotification[] }>('/notifications');
      for (const n of notifications) {
        await db.notifications.put({ ...n, read: n.read || stillPending.has(n.id) });
      }
    } catch {
      /* optional */
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Send one (possibly coalesced) op; on success drop its outbox rows, on failure count the try and rethrow. */
async function flushRow(periodId: string, op: SyncOp, rows: { id?: number; tries: number }[]): Promise<void> {
  try {
    await flushOneOp(periodId, op);
  } catch (e) {
    for (const row of rows) {
      if (row.id != null) await db.outbox.update(row.id, { tries: (row.tries || 0) + 1 });
    }
    throw e;
  }
  const ids = rows.map((row) => row.id).filter((id): id is number => id != null);
  if (ids.length) await db.outbox.bulkDelete(ids);
}

export async function flushOutbox(periodId?: string): Promise<{ ok: boolean; error?: string }> {
  const profile = await ensureProfile();
  if (!profile.token) return { ok: false, error: 'برای همگام‌سازی وارد شوید' };
  if (!isOnline()) return { ok: false, error: 'آفلاین هستید' };

  const items = periodId
    ? await db.outbox.where('periodId').equals(periodId).sortBy('createdAt')
    : await db.outbox.orderBy('createdAt').toArray();

  const byPeriod = new Map<string, typeof items>();
  for (const item of items) {
    const list = byPeriod.get(item.periodId) || [];
    list.push(item);
    byPeriod.set(item.periodId, list);
  }

  try {
    for (const [pid, rawPending] of byPeriod) {
      const period = await db.periods.get(pid);
      if (!period) {
        // The period is gone locally; its queued ops can never be applied.
        await db.outbox.where('periodId').equals(pid).delete();
        continue;
      }

      try {
        await api<PeriodSnapshot>(`/periods/${pid}/snapshot`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          await postPeriodToCloud(period);
        } else {
          throw e;
        }
      }

      // Every op is removed right after its own success, so a later failure never replays
      // already-applied rows (chat/activity ids would otherwise collide on retry).
      const periodRows = rawPending.filter((item) => item.entity === 'period' && item.action === 'upsert');
      const otherRows = rawPending.filter((item) => !(item.entity === 'period' && item.action === 'upsert'));
      if (periodRows.length) {
        const [merged] = coalesceSyncOps(
          periodRows.map((item) => ({ entity: item.entity, action: item.action, payload: item.payload })),
        );
        await flushRow(pid, merged, periodRows);
      }
      for (const item of otherRows) {
        await flushRow(pid, { entity: item.entity, action: item.action, payload: item.payload }, [item]);
      }

      const latest = await api<PeriodSnapshot>(`/periods/${pid}/snapshot`);
      await applyPeriodSnapshot(latest);
      await db.periods.update(pid, { synced: true, version: latest.version ?? latest.period.version });
      await db.outbox.where('periodId').equals(pid).delete();
    }
    return { ok: true };
  } catch (e) {
    // Server is last-write-wins; any error here is the server's own message (auth, validation, duplicate).
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Drop queued ops the server has refused for good (4xx other than auth), so one bad row
 * does not block the rest of the period's queue forever. Returns the dropped count.
 */
export async function discardRejectedOps(periodId: string): Promise<number> {
  const rows = await db.outbox.where('periodId').equals(periodId).toArray();
  const stuck = rows.filter((row) => (row.tries || 0) >= 3).map((row) => row.id).filter((id): id is number => id != null);
  if (stuck.length) await db.outbox.bulkDelete(stuck);
  return stuck.length;
}

export async function pullFriends(): Promise<void> {
  const { friends } = await api<{ friends: (LocalFriend & { userId?: string })[] }>('/friends');
  for (const f of friends) {
    await db.friends.put({
      id: f.id,
      displayName: f.displayName,
      phone: f.phone,
      email: f.email,
      friendUserId: f.friendUserId,
    });
  }
}

export async function pullPeriod(periodId: string): Promise<void> {
  const pendingRows = await db.outbox.where('periodId').equals(periodId).toArray();
  if (pendingRows.length) return;
  const snap = await api<PeriodSnapshot>(`/periods/${periodId}/snapshot`);
  await applyPeriodSnapshot(snap);
  await db.periods.update(periodId, { synced: true, version: snap.version ?? snap.period.version });
}

let liveConnected = false;

export function setLiveConnected(on: boolean): void {
  liveConnected = on;
}

export function startSyncLoop() {
  let inFlight = false;
  let timer = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    void (async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const profile = await ensureProfile();
        if (!shouldImmediateSync(profile, isOnline())) return;
        await flushOutbox();
        await pullCloud();
      } finally {
        inFlight = false;
        schedule();
      }
    })();
  };
  const schedule = () => {
    if (stopped) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(tick, liveConnected ? 60_000 : 15_000);
  };
  window.addEventListener('online', tick);
  void tick();
  return () => {
    stopped = true;
    window.removeEventListener('online', tick);
    window.clearTimeout(timer);
  };
}
