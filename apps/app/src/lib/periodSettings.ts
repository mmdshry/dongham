import { nanoid } from 'nanoid';
import { rebaseFxRate, type PeriodKind, type PeriodTemplate, type RoundTo } from '@dongham/ledger';
import { ensureProfile } from './api';
import { db, POT_DISPLAY_NAME, type LocalExpense, type LocalMember, type LocalPayment, type LocalPeriod } from './db';
import { fetchFxRates } from './fx';
import { KIND_OPTIONS, templateById } from './templates';
import { logActivity, queueOp } from './sync';

export type PeriodSettingsPatch = {
  template?: PeriodTemplate;
  kind?: PeriodKind;
  roundTo?: RoundTo;
  currency?: string;
  bankerMemberId?: string;
};

export function ownerSeatId(period: LocalPeriod, members: LocalMember[]): string | undefined {
  const people = members.filter((m) => !m.isPot);
  if (period.ownerId) {
    const byUser = people.find((m) => m.userId === period.ownerId);
    if (byUser) return byUser.id;
  }
  if (period.ownerGuestKey) {
    const byGuest = people.find((m) => m.guestKey === period.ownerGuestKey);
    if (byGuest) return byGuest.id;
  }
  const byRole = people.find((m) => m.role === 'owner');
  if (byRole) return byRole.id;
  return people[0]?.id;
}

export function hasPotMember(members: LocalMember[]): boolean {
  return members.some((m) => m.isPot);
}

function kindLabel(kind: PeriodKind): string {
  return KIND_OPTIONS.find((k) => k.id === kind)?.label || kind;
}

function peopleOf(members: LocalMember[]): LocalMember[] {
  return members.filter((m) => !m.isPot);
}

function isSeat(members: LocalMember[], id: string | undefined): id is string {
  return Boolean(id && peopleOf(members).some((m) => m.id === id));
}

export type PreparedPeriodSettings =
  | {
      ok: true;
      changed: boolean;
      period: LocalPeriod;
      createPot: boolean;
      expenses: LocalExpense[];
      payments: LocalPayment[];
      summary: string;
    }
  | { ok: false; error: string };

export function preparePeriodSettingsUpdate(input: {
  period: LocalPeriod;
  members: LocalMember[];
  expenses: LocalExpense[];
  payments: LocalPayment[];
  patch: PeriodSettingsPatch;
  rates: Record<string, number>;
  now?: string;
}): PreparedPeriodSettings {
  const now = input.now || new Date().toISOString();
  const next: LocalPeriod = { ...input.period };
  const parts: string[] = [];
  let createPot = false;

  if (input.patch.template !== undefined && input.patch.template !== input.period.template) {
    next.template = input.patch.template;
    parts.push(`قالب «${templateById(next.template).label}»`);
    if (next.template === 'work' && !next.lunchTurnMemberId) {
      const seat = ownerSeatId(next, input.members);
      if (seat) next.lunchTurnMemberId = seat;
    }
  }

  if (input.patch.kind !== undefined && input.patch.kind !== input.period.kind) {
    next.kind = input.patch.kind;
    parts.push(`نوع حساب «${kindLabel(next.kind)}»`);
  }

  if (next.kind === 'pot' && !hasPotMember(input.members)) {
    createPot = true;
  }

  if (next.kind === 'banker') {
    if (input.patch.bankerMemberId !== undefined) {
      if (!isSeat(input.members, input.patch.bankerMemberId)) {
        return { ok: false, error: 'گنجه‌بان نامعتبر است' };
      }
      if (next.bankerMemberId !== input.patch.bankerMemberId) {
        next.bankerMemberId = input.patch.bankerMemberId;
        if (!parts.some((p) => p.startsWith('نوع حساب'))) parts.push('گنجه‌بان');
      }
    } else if (!isSeat(input.members, next.bankerMemberId)) {
      next.bankerMemberId = ownerSeatId(next, input.members);
    }
  }

  if (input.patch.roundTo !== undefined && input.patch.roundTo !== input.period.roundTo) {
    next.roundTo = input.patch.roundTo;
    parts.push('گرد کردن تسویه');
  }

  const expenses: LocalExpense[] = [];
  const payments: LocalPayment[] = [];
  if (input.patch.currency !== undefined && input.patch.currency !== input.period.currency) {
    const from = input.period.currency;
    const to = input.patch.currency;
    for (const row of input.expenses) {
      if (row.deletedAt) continue;
      const fx = rebaseFxRate(row.fxRate ?? 1, from, to, input.rates);
      if (fx == null) return { ok: false, error: 'نرخ تبدیل این ارز در دسترس نیست' };
      if (fx !== row.fxRate) expenses.push({ ...row, fxRate: fx, updatedAt: now });
    }
    for (const row of input.payments) {
      if (row.deletedAt) continue;
      const fx = rebaseFxRate(row.fxRate ?? 1, from, to, input.rates);
      if (fx == null) return { ok: false, error: 'نرخ تبدیل این ارز در دسترس نیست' };
      if (fx !== row.fxRate) payments.push({ ...row, fxRate: fx, updatedAt: now });
    }
    next.currency = to;
    next.baseCurrency = to;
    parts.push(`ارز پایه ${to}`);
  }

  const bankerFilled =
    next.kind === 'banker' && next.bankerMemberId !== input.period.bankerMemberId;
  const lunchFilled = next.lunchTurnMemberId !== input.period.lunchTurnMemberId;
  const changed = parts.length > 0 || createPot || bankerFilled || lunchFilled;
  if (!changed) {
    return { ok: true, changed: false, period: input.period, createPot: false, expenses: [], payments: [], summary: '' };
  }

  next.updatedAt = now;
  return {
    ok: true,
    changed: true,
    period: next,
    createPot,
    expenses,
    payments,
    summary: `تنظیمات دوره تغییر کرد: ${parts.join('، ') || 'به‌روزرسانی'}`,
  };
}

export async function updatePeriodSettings(
  periodId: string,
  patch: PeriodSettingsPatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const period = await db.periods.get(periodId);
  if (!period) return { ok: false, error: 'دوره پیدا نشد' };
  const members = await db.members.where('periodId').equals(periodId).toArray();
  const expenses = await db.expenses.where('periodId').equals(periodId).toArray();
  const payments = await db.payments.where('periodId').equals(periodId).toArray();

  let rates: Record<string, number> = {};
  if (patch.currency && patch.currency !== period.currency) {
    const probe = preparePeriodSettingsUpdate({ period, members, expenses, payments, patch, rates });
    if (!probe.ok) rates = await fetchFxRates();
  }

  const prepared = preparePeriodSettingsUpdate({ period, members, expenses, payments, patch, rates });
  if (!prepared.ok) return prepared;
  if (!prepared.changed) return { ok: true };

  await db.periods.put(prepared.period);
  await queueOp(periodId, 'period', 'upsert', {
    title: prepared.period.title,
    currency: prepared.period.currency,
    kind: prepared.period.kind,
    template: prepared.period.template,
    roundTo: prepared.period.roundTo,
    bankerMemberId: prepared.period.bankerMemberId,
    lunchTurnMemberId: prepared.period.lunchTurnMemberId,
    buildingCharge: prepared.period.buildingCharge,
    visibility: prepared.period.visibility,
  });

  if (prepared.createPot) {
    const pot: LocalMember = {
      id: nanoid(),
      periodId,
      displayName: POT_DISPLAY_NAME,
      weightDefault: 1,
      role: 'member',
      isPot: true,
    };
    await db.members.put(pot);
    await queueOp(periodId, 'member', 'upsert', pot);
  }

  for (const row of prepared.expenses) {
    await db.expenses.put(row);
    await queueOp(periodId, 'expense', 'upsert', row);
  }
  for (const row of prepared.payments) {
    await db.payments.put(row);
    await queueOp(periodId, 'payment', 'upsert', row);
  }

  const profile = await ensureProfile();
  await logActivity(periodId, profile.displayName, 'period.settings', prepared.summary);
  return { ok: true };
}
