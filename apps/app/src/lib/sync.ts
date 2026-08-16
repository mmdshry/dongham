import { nanoid } from 'nanoid';
import type { PeriodKind, PeriodTemplate, RoundTo } from '@dongham/ledger';
import { ApiError, api, ensureProfile, getDeviceId } from './api';
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

type OutboxEntity = 'expense' | 'payment' | 'member' | 'chat' | 'period' | 'activity' | 'recurring';

export async function queueOp(
  periodId: string,
  entity: OutboxEntity,
  action: 'upsert' | 'delete',
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

export async function logActivity(
  periodId: string,
  actorName: string,
  action: string,
  summary: string,
) {
  const row = {
    id: nanoid(),
    periodId,
    actorName,
    action,
    summary,
    createdAt: new Date().toISOString(),
  };
  await db.activity.put(row);
  await queueOp(periodId, 'activity', 'upsert', row);
}

export type PeriodSnapshot = {
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
};

export async function applyPeriodSnapshot(snap: PeriodSnapshot): Promise<void> {
  const currency = snap.period.currency || 'IRT';
  await db.periods.put({
    id: snap.period.id,
    title: snap.period.title,
    currency,
    baseCurrency: currency,
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
    ownerGuestKey: snap.period.ownerGuestKey,
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
  for (const e of snap.expenses || []) {
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
  for (const p of snap.payments || []) await db.payments.put({ ...p, periodId: pid });
  for (const msg of snap.chat || []) {
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
  for (const a of snap.activity || []) await db.activity.put({ ...a, periodId: pid });
  for (const r of snap.recurring || []) await db.recurring.put({ ...r, periodId: pid });
}

export async function createPeriodLocal(input: {
  title: string;
  currency?: string;
  memberNames?: string[];
  kind?: PeriodKind;
  template?: PeriodTemplate;
  roundTo?: RoundTo;
  bankerName?: string;
  buildingCharge?: number;
  lunchTurnMemberId?: string;
}): Promise<string> {
  const profile = await ensureProfile();
  const id = nanoid();
  const now = new Date().toISOString();
  const kind = input.kind || 'split';
  const template = input.template || 'custom';
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
    kind,
    template,
    roundTo: input.roundTo ?? 0,
    buildingCharge: input.buildingCharge,
    lunchTurnMemberId: input.lunchTurnMemberId,
  };
  await db.periods.put(period);
  const selfMemberId = nanoid();
  await db.members.put({
    id: selfMemberId,
    periodId: id,
    displayName: profile.displayName,
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
  for (const name of input.memberNames || []) {
    if (!name.trim() || name.trim() === profile.displayName) continue;
    const friend = friends.find((f) => f.displayName === name.trim());
    const mid = nanoid();
    await db.members.put({
      id: mid,
      periodId: id,
      displayName: name.trim(),
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
  });
  await logActivity(id, profile.displayName, 'period.create', `دوره «${period.title}» ساخته شد`);
  return id;
}

export async function upsertExpense(expense: LocalExpense) {
  const normalized: LocalExpense = {
    ...expense,
    service: expense.service || noneCharge(),
    tip: expense.tip || noneCharge(),
    tax: expense.tax || noneCharge(),
    payers: expense.payers || [],
    occurredAt: expense.occurredAt || expense.createdAt,
  };
  await db.expenses.put(normalized);
  await db.periods.update(expense.periodId, { updatedAt: expense.updatedAt, synced: false });
  await queueOp(expense.periodId, 'expense', 'upsert', normalized);
  const profile = await ensureProfile();
  await logActivity(
    expense.periodId,
    profile.displayName,
    expense.deletedAt ? 'expense.delete' : 'expense.upsert',
    expense.deletedAt ? `حذف هزینه «${expense.title}»` : `ثبت هزینه «${expense.title}»`,
  );
}

export async function upsertPayment(payment: LocalPayment) {
  await db.payments.put(payment);
  await db.periods.update(payment.periodId, { updatedAt: payment.updatedAt, synced: false });
  await queueOp(payment.periodId, 'payment', 'upsert', payment);
  const profile = await ensureProfile();
  await logActivity(
    payment.periodId,
    profile.displayName,
    'payment.upsert',
    payment.kind === 'loan' ? 'ثبت قرض' : 'ثبت تسویه',
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
    const { periods } = await api<{ periods: { id: string; version?: number; updatedAt?: string }[] }>('/periods');
    const localPeriods = await db.periods.toArray();
    const serverAhead = localPeriods.some((local) => {
      const remote = periods.find((p) => p.id === local.id);
      return remote && typeof remote.version === 'number' && remote.version > local.version;
    });
    useUiStore.getState().setServerAhead(serverAhead);
    for (const p of periods) {
      const pending = await db.outbox.where('periodId').equals(p.id).count();
      if (pending > 0) continue;
      const snap = await api<PeriodSnapshot>(`/periods/${p.id}/snapshot`);
      await applyPeriodSnapshot(snap);
    }
    try {
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
    } catch {
      /* optional */
    }
    try {
      const { notifications } = await api<{ notifications: LocalNotification[] }>('/notifications');
      for (const n of notifications) await db.notifications.put(n);
    } catch {
      /* optional */
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function flushOutbox(periodId?: string): Promise<{ ok: boolean; error?: string }> {
  const profile = await ensureProfile();
  if (!profile.token) return { ok: false, error: 'برای همگام‌سازی وارد شوید' };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { ok: false, error: 'آفلاین هستید' };

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
    for (const [pid, ops] of byPeriod) {
      let period = await db.periods.get(pid);
      if (!period) continue;

      if (!period.synced) {
        const members = await db.members.where('periodId').equals(pid).toArray();
        await api('/periods', {
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
            members,
          }),
        }).catch(() => undefined);
        for (const m of members) {
          await queueOp(pid, 'member', 'upsert', m);
        }
      }

      period = (await db.periods.get(pid))!;
      const pending = await db.outbox.where('periodId').equals(pid).sortBy('createdAt');
      const res = await api<{
        version: number;
        expenses: LocalExpense[];
        payments: LocalPayment[];
        members: LocalMember[];
        chat: LocalChat[];
        activity?: LocalActivity[];
        recurring?: LocalRecurring[];
        period?: Partial<LocalPeriod>;
      }>(`/periods/${pid}/sync`, {
        method: 'POST',
        body: JSON.stringify({
          deviceId: await getDeviceId(),
          baseVersion: period.version,
          ops: pending.map((o) => ({
            entity: o.entity,
            action: o.action,
            payload: o.payload,
          })),
        }),
      });

      await applyPeriodSnapshot({
        period: {
          id: pid,
          title: period.title,
          currency: period.currency,
          createdAt: period.createdAt,
          updatedAt: new Date().toISOString(),
          version: res.version,
          ...res.period,
        },
        members: res.members,
        expenses: res.expenses,
        payments: res.payments,
        chat: res.chat,
        activity: res.activity,
        recurring: res.recurring,
      });
      await db.periods.update(pid, { synced: true, version: res.version });
      await db.outbox.where('periodId').equals(pid).delete();
    }
    useUiStore.getState().setSyncConflict(null);
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const message = e.message || 'نسخهٔ سرور با این دستگاه یکی نیست';
      useUiStore.getState().setSyncConflict(message);
      return { ok: false, error: message };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function startSyncLoop() {
  const tick = () => {
    void flushOutbox();
  };
  const pull = () => {
    void flushOutbox().then(() => pullCloud());
  };
  window.addEventListener('online', pull);
  void flushOutbox().then(() => pullCloud());
  const id = window.setInterval(tick, 15_000);
  return () => {
    window.removeEventListener('online', pull);
    window.clearInterval(id);
  };
}
