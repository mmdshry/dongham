import type { Context, Next } from 'hono';
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import {
  describeSplitError,
  expenseTotal,
  isPremium as isPremiumEntitlement,
  nextRecurringAt,
  normalizeEmail,
  normalizeIranMobile,
  validateShares,
  wrapDonghamExport,
} from '@dongham/ledger';
import {
  adminPhones,
  createUser,
  extraAdminPhones,
  fetchSenatorAmount,
  findUserByPhone,
  isAdminPhone,
  isOtpMock,
  issueToken,
  sendOtp,
  verifyOtp,
} from './auth.js';
import { premiumUntilFromNow, recordBillingEvent } from './billing.js';
import { getDb } from './db.js';
import { getFxRates, recurringFxRate } from './fx.js';
import { persistPremiumExpiry, publicUser, wipePublicProfile } from './profile.js';
import { appPublicUrl } from './publicUrl.js';
import {
  adminCounts,
  bumpPeriodVersion,
  countActiveOtps,
  countSessions,
  deleteAttachment,
  deleteChat,
  deleteFriend,
  deleteInvite,
  deleteMember,
  deletePeriodCascade,
  deleteRecurring,
  deleteSessionByToken,
  deleteSessionsForUser,
  deleteSessionsForUserExcept,
  deleteZarinpalPending,
  getAttachment,
  getExpense,
  getFxCache,
  getImpersonationTicket,
  getMember,
  getPayment,
  getPeriod,
  getRecurring,
  getUserById,
  insertActivity,
  insertAdminAudit,
  insertImpersonationTicket,
  insertNotification,
  listActiveUserIds,
  listAdminAudit,
  listAdminPeriods,
  listBillingEvents,
  listFriends,
  listNotifications,
  listPeriodsForUser,
  listSessionsForUser,
  listShebaLookups,
  listUsers,
  listZarinpalPending,
  loadPeriodSnapshot,
  notifyPeriodMembers,
  purgeImpersonationTickets,
  reopenPeriod,
  restorePeriod,
  setExtraAdminPhones,
  transferPeriodOwner,
  updateImpersonationTicket,
  updatePeriod,
  updateUser,
  upsertExpense,
  upsertMember,
  upsertPayment,
  upsertRecurring,
} from './repo.js';
import type {
  AttachmentRecord,
  ExpenseRecord,
  MemberRole,
  PaymentRecord,
  PeriodKind,
  PeriodTemplate,
  SettlementStatus,
  UserRecord,
} from './types.js';

export { publicUser };

const PERIOD_KINDS: PeriodKind[] = ['split', 'banker', 'pot'];
const PERIOD_TEMPLATES: PeriodTemplate[] = [
  'travel',
  'household',
  'work',
  'family',
  'dorm',
  'ziarat',
  'wedding',
  'building',
  'custom',
];

export type AdminVariables = {
  userId?: string;
  deviceId?: string;
  role?: 'admin' | 'user';
  impersonatedBy?: string;
};

const GENERIC_OTP_ERROR = 'کد نامعتبر است';
const adminOtpHits = new Map<string, number[]>();

function tooManyAdminOtp(phone: string): boolean {
  const now = Date.now();
  const windowStart = now - 60 * 60_000;
  const prev = (adminOtpHits.get(phone) || []).filter((t) => t > windowStart);
  if (prev.length >= 5) {
    adminOtpHits.set(phone, prev);
    return true;
  }
  prev.push(now);
  adminOtpHits.set(phone, prev);
  return false;
}

export function resetAdminRateLimits(): void {
  adminOtpHits.clear();
}

function publicExpense(e: ExpenseRecord) {
  const { attachmentDataUrl: _data, ...rest } = e;
  return { ...rest, hasAttachment: Boolean(e.attachmentDataUrl || e.attachmentId) };
}

function publicPayment(p: PaymentRecord) {
  const { receiptDataUrl: _data, ...rest } = p;
  return { ...rest, hasReceipt: Boolean(p.receiptDataUrl) };
}

function publicAttachment(a: AttachmentRecord) {
  return {
    id: a.id,
    periodId: a.periodId,
    mime: a.mime,
    createdAt: a.createdAt,
    bytes: Math.ceil((a.dataBase64.length * 3) / 4),
  };
}

function receiptFromDataUrl(dataUrl?: string, fallbackMime?: string): { mime?: string; dataUrl: string } | null {
  if (!dataUrl) return null;
  const match = /^data:([^;,]+)/i.exec(dataUrl);
  return { mime: match?.[1] || fallbackMime, dataUrl };
}

async function isPremium(u: UserRecord): Promise<boolean> {
  await persistPremiumExpiry(u);
  return isPremiumEntitlement(u);
}

function parsePage(c: Context) {
  const offset = Math.max(0, Number(c.req.query('offset') || 0) || 0);
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') || 50) || 50));
  const q = (c.req.query('q') || '').trim().toLowerCase();
  return { offset, limit, q };
}

function paginate<T>(rows: T[], offset: number, limit: number) {
  return { items: rows.slice(offset, offset + limit), total: rows.length, offset, limit };
}

async function readBody<T extends object>(c: Context, fallback: T): Promise<T> {
  try {
    const body = await c.req.json<Partial<T>>();
    return { ...fallback, ...body };
  } catch {
    return fallback;
  }
}

function bearer(c: Context): string | null {
  const header = c.req.header('Authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

async function actorFrom(c: Context<{ Variables: AdminVariables }>): Promise<UserRecord | null> {
  const userId = c.get('userId');
  if (!userId) return null;
  const user = await getUserById(userId);
  if (!user || user.deletedAt) return null;
  return user;
}

async function writeAudit(
  actor: UserRecord,
  action: string,
  targetType: string,
  targetId: string,
  summary: string,
): Promise<void> {
  await insertAdminAudit({
    actorUserId: actor.id,
    actorPhone: actor.phone,
    action,
    targetType,
    targetId,
    summary,
  });
}

async function pushActivity(
  periodId: string,
  actor: UserRecord,
  action: string,
  summary: string,
  entityId?: string,
): Promise<void> {
  await insertActivity({
    id: nanoid(),
    periodId,
    actorName: `ادمین (${actor.displayName})`,
    action,
    summary,
    createdAt: new Date().toISOString(),
    entityId,
  });
}

async function notifyPeriod(periodId: string, actorUserId: string, title: string, body: string): Promise<void> {
  await notifyPeriodMembers(periodId, actorUserId, title, body);
}

async function notePeriodChange(periodId: string, actor: UserRecord, summary: string, entityId?: string): Promise<void> {
  await pushActivity(periodId, actor, 'admin_update', summary, entityId);
  await notifyPeriod(periodId, actor.id, 'به‌روزرسانی دوره', summary);
}

async function bumpLedger(periodId: string, actor: UserRecord, summary: string, entityId?: string): Promise<void> {
  await bumpPeriodVersion(periodId);
  await notePeriodChange(periodId, actor, summary, entityId);
}

async function requireAdminMw(c: Context<{ Variables: AdminVariables }>, next: Next) {
  const path = c.req.path;
  if (path.endsWith('/auth/otp/request') || path.endsWith('/auth/otp/verify')) {
    await next();
    return;
  }
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  if (c.get('role') !== 'admin') return c.json({ error: 'اجازه ندارید' }, 403);
  const user = await getUserById(userId);
  if (!user || user.deletedAt || !(await isAdminPhone(user.phone))) return c.json({ error: 'اجازه ندارید' }, 403);
  await next();
}

export async function consumeImpersonation(
  code: string,
  deviceId: string,
): Promise<{ token: string; user: UserRecord } | { error: string; status: 400 | 404 }> {
  const now = Date.now();
  await purgeImpersonationTickets(now);
  const ticket = await getImpersonationTicket(code);
  if (!ticket) return { error: 'کد نامعتبر است', status: 400 };
  if (ticket.token) {
    const user = await getUserById(ticket.userId);
    if (!user || user.deletedAt) return { error: 'پیدا نشد', status: 404 };
    if (user.bannedAt) return { error: 'این حساب مسدود است', status: 400 };
    return { token: ticket.token, user };
  }
  if (ticket.expiresAt <= now) return { error: 'کد نامعتبر است', status: 400 };
  const user = await getUserById(ticket.userId);
  if (!user || user.deletedAt) return { error: 'پیدا نشد', status: 404 };
  if (user.bannedAt) return { error: 'این حساب مسدود است', status: 400 };
  const token = await issueToken(user.id, deviceId || nanoid(), {
    expiresIn: '1h',
    impersonatedBy: ticket.actorUserId,
  });
  await updateImpersonationTicket({ code, token, consumedAt: Date.now() });
  return { token, user };
}

export const adminApp = new Hono<{ Variables: AdminVariables }>();

adminApp.post('/auth/otp/request', async (c) => {
  const { phone } = await readBody(c, { phone: '' });
  const local = normalizeIranMobile(phone || '');
  if (!local || !(await isAdminPhone(local)) || tooManyAdminOtp(local)) {
    return c.json({ error: GENERIC_OTP_ERROR }, 400);
  }
  try {
    const code = await sendOtp(local);
    const body: Record<string, unknown> = { ok: true };
    if (isOtpMock()) body.devCode = code;
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : GENERIC_OTP_ERROR }, 502);
  }
});

adminApp.post('/auth/otp/verify', async (c) => {
  const { phone, code, deviceId } = await readBody(c, { phone: '', code: '', deviceId: '' });
  const local = normalizeIranMobile(phone || '');
  if (!local || !(await isAdminPhone(local)) || !code || !(await verifyOtp(local, code))) {
    return c.json({ error: GENERIC_OTP_ERROR }, 400);
  }
  let user = await findUserByPhone(local);
  if (!user) {
    user = await createUser({ phone: local, displayName: `ادمین ${local.slice(-4)}` });
  }
  const token = await issueToken(user.id, deviceId || nanoid(), {
    expiresIn: '24h',
    role: 'admin',
  });
  await writeAudit(user, 'admin_login', 'session', user.id, 'ورود به پنل ادمین');
  return c.json({ token, user: publicUser(user) });
});

adminApp.use('*', requireAdminMw);

adminApp.get('/auth/me', async (c) => {
  const user = (await actorFrom(c))!;
  return c.json({ user: publicUser(user) });
});

adminApp.post('/auth/logout', async (c) => {
  const token = bearer(c);
  const user = (await actorFrom(c))!;
  if (token) await deleteSessionByToken(token);
  await writeAudit(user, 'admin_logout', 'session', user.id, 'خروج از پنل ادمین');
  return c.json({ ok: true });
});

adminApp.get('/stats', async (c) => {
  const counts = await adminCounts();
  return c.json({
    ...counts,
    health: { ok: true, service: 'dongham-api' },
  });
});

adminApp.get('/users', async (c) => {
  const { offset, limit, q } = parsePage(c);
  const rows = await listUsers(q || undefined);
  const page = paginate(rows, offset, limit);
  return c.json({ ...page, items: page.items.map(publicUser) });
});

adminApp.get('/users/:id', async (c) => {
  const user = await getUserById(c.req.param('id'));
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  const periods = (
    await listPeriodsForUser(user.id, normalizeIranMobile(user.phone) || undefined, normalizeEmail(user.email) || undefined)
  ).map((p) => ({
    id: p.id,
    title: p.title,
    currency: p.currency,
    ownerId: p.ownerId,
    createdAt: p.createdAt,
    version: p.version,
  }));
  const sessions = (await listSessionsForUser(user.id)).map((s) => ({
    id: s.id,
    deviceId: s.deviceId,
    createdAt: s.createdAt,
  }));
  const friends = await listFriends(user.id);
  return c.json({
    user: publicUser(user),
    avatarDataUrl: user.avatarDataUrl,
    avatarPreset: user.avatarPreset,
    profileCoverPreset: user.profileCoverPreset,
    profileCoverDataUrl: user.profileCoverDataUrl,
    periods,
    sessions,
    friends,
  });
});

adminApp.get('/users/:id/notifications', async (c) => {
  const user = await getUserById(c.req.param('id'));
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  const items = await listNotifications(user.id, 100);
  return c.json({ items, total: items.length });
});

adminApp.delete('/users/:id/friends/:friendId', async (c) => {
  const actor = (await actorFrom(c))!;
  const id = c.req.param('id');
  const friendId = c.req.param('friendId');
  const row = (await listFriends(id)).find((f) => f.id === friendId);
  if (!row) return c.json({ error: 'پیدا نشد' }, 404);
  await deleteFriend(friendId, id);
  await writeAudit(actor, 'friend_delete', 'user', id, `حذف دوست «${row.displayName}»`);
  return c.json({ ok: true });
});

adminApp.patch('/users/:id', async (c) => {
  const actor = (await actorFrom(c))!;
  const id = c.req.param('id');
  const body = await readBody(c, { displayName: '' });
  const user = await getUserById(id);
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  const displayName = (body.displayName || '').trim();
  if (!displayName) return c.json({ error: 'نام نمایشی لازم است' }, 400);
  user.displayName = displayName;
  user.prefsUpdatedAt = new Date().toISOString();
  await updateUser(user);
  await writeAudit(actor, 'user_rename', 'user', id, `تغییر نام به «${displayName}»`);
  const next = (await getUserById(id))!;
  return c.json({ user: publicUser(next) });
});

adminApp.delete('/users/:id/avatar', async (c) => {
  const actor = (await actorFrom(c))!;
  const id = c.req.param('id');
  const user = await getUserById(id);
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  if (!user.avatarDataUrl && !user.avatarPreset) return c.json({ error: 'آواتاری ثبت نشده' }, 404);
  user.avatarDataUrl = undefined;
  user.avatarPreset = undefined;
  user.avatarUpdatedAt = undefined;
  await updateUser(user);
  await writeAudit(actor, 'user_avatar_delete', 'user', id, `حذف آواتار «${user.displayName}»`);
  const next = (await getUserById(id))!;
  return c.json({ user: publicUser(next), avatarDataUrl: next.avatarDataUrl, avatarPreset: next.avatarPreset });
});

adminApp.delete('/users/:id/cover', async (c) => {
  const actor = (await actorFrom(c))!;
  const id = c.req.param('id');
  const user = await getUserById(id);
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  if (!user.profileCoverDataUrl && !user.profileCoverPreset) return c.json({ error: 'بک‌گراندی ثبت نشده' }, 404);
  user.profileCoverDataUrl = undefined;
  user.profileCoverPreset = undefined;
  await updateUser(user);
  await writeAudit(actor, 'user_cover_delete', 'user', id, `حذف بک‌گراند «${user.displayName}»`);
  const next = (await getUserById(id))!;
  return c.json({ user: publicUser(next), profileCoverPreset: next.profileCoverPreset, profileCoverDataUrl: next.profileCoverDataUrl });
});

adminApp.post('/users/:id/premium', async (c) => {
  const actor = (await actorFrom(c))!;
  const id = c.req.param('id');
  const body = await readBody(c, { days: undefined as number | undefined, until: undefined as string | undefined, revoke: false });
  const user = await getUserById(id);
  if (!user || user.deletedAt) return c.json({ error: 'پیدا نشد' }, 404);
  if (body.revoke) {
    user.plan = 'free';
    user.premiumUntil = undefined;
  } else {
    user.plan = 'premium';
    if (body.until) user.premiumUntil = new Date(body.until).toISOString();
    else user.premiumUntil = premiumUntilFromNow(body.days === 365 ? 365 : body.days === 30 ? 30 : 30);
  }
  await updateUser(user);
  const next = (await getUserById(id))!;
  if (!body.revoke && next.premiumUntil) {
    await recordBillingEvent({ userId: id, source: 'admin', until: next.premiumUntil });
  }
  await writeAudit(
    actor,
    body.revoke ? 'premium_revoke' : 'premium_grant',
    'user',
    id,
    body.revoke ? 'بازپس‌گیری پریمیوم' : `اعطا تا ${next.premiumUntil}`,
  );
  return c.json({ user: publicUser(next) });
});

adminApp.post('/users/:id/revoke-sessions', async (c) => {
  const actor = (await actorFrom(c))!;
  const id = c.req.param('id');
  const user = await getUserById(id);
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  const keep = bearer(c);
  if (actor.id === id) await deleteSessionsForUserExcept(id, keep);
  else await deleteSessionsForUser(id);
  await writeAudit(actor, 'revoke_sessions', 'user', id, 'ابطال نشست‌ها');
  return c.json({ ok: true });
});

adminApp.post('/users/:id/delete', async (c) => {
  const actor = (await actorFrom(c))!;
  const id = c.req.param('id');
  if (id === actor.id) return c.json({ error: 'نمی‌توانید حساب خودتان را حذف کنید' }, 400);
  const user = await getUserById(id);
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  user.deletedAt = new Date().toISOString();
  user.phone = undefined;
  user.email = undefined;
  user.googleId = undefined;
  user.passwordHash = undefined;
  user.displayName = 'حساب حذف‌شده';
  wipePublicProfile(user);
  await updateUser(user);
  await deleteSessionsForUser(id);
  await writeAudit(actor, 'user_delete', 'user', id, 'حذف نرم حساب');
  return c.json({ ok: true });
});

adminApp.post('/users/:id/restore', async (c) => {
  const actor = (await actorFrom(c))!;
  const id = c.req.param('id');
  const user = await getUserById(id);
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  if (!user.deletedAt) return c.json({ error: 'این حساب حذف نشده' }, 400);
  if (!user.phone && !user.email && !user.googleId) {
    return c.json({ error: 'بازیابی ممکن نیست؛ اطلاعات تماس پاک شده است' }, 409);
  }
  user.deletedAt = undefined;
  await updateUser(user);
  await writeAudit(actor, 'user_restore', 'user', id, 'بازیابی حساب');
  const next = (await getUserById(id))!;
  return c.json({ user: publicUser(next) });
});

adminApp.post('/users/:id/ban', async (c) => {
  const actor = (await actorFrom(c))!;
  const id = c.req.param('id');
  if (id === actor.id) return c.json({ error: 'نمی‌توانید حساب خودتان را مسدود کنید' }, 400);
  const user = await getUserById(id);
  if (!user || user.deletedAt) return c.json({ error: 'پیدا نشد' }, 404);
  user.bannedAt = new Date().toISOString();
  await updateUser(user);
  await deleteSessionsForUser(id);
  await writeAudit(actor, 'user_ban', 'user', id, `مسدود کردن «${user.displayName}»`);
  return c.json({ user: publicUser((await getUserById(id))!) });
});

adminApp.post('/users/:id/unban', async (c) => {
  const actor = (await actorFrom(c))!;
  const id = c.req.param('id');
  const user = await getUserById(id);
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  if (!user.bannedAt) return c.json({ error: 'این حساب مسدود نیست' }, 400);
  user.bannedAt = undefined;
  await updateUser(user);
  await writeAudit(actor, 'user_unban', 'user', id, `رفع مسدودی «${user.displayName}»`);
  return c.json({ user: publicUser((await getUserById(id))!) });
});

adminApp.post('/users/:id/impersonate', async (c) => {
  const actor = (await actorFrom(c))!;
  const id = c.req.param('id');
  const user = await getUserById(id);
  if (!user || user.deletedAt) return c.json({ error: 'پیدا نشد' }, 404);
  if (user.bannedAt) return c.json({ error: 'این حساب مسدود است' }, 400);
  const code = nanoid(16);
  const expiresAt = Date.now() + 2 * 60_000;
  await purgeImpersonationTickets();
  await insertImpersonationTicket({ code, userId: id, actorUserId: actor.id, expiresAt });
  await writeAudit(actor, 'impersonate', 'user', id, `ورود به جای «${user.displayName}»`);
  return c.json({
    ok: true,
    code,
    expiresAt,
    appUrl: `${appPublicUrl()}/auth?imp=${encodeURIComponent(code)}`,
  });
});

adminApp.get('/periods', async (c) => {
  const { offset, limit, q } = parsePage(c);
  const rows = await listAdminPeriods(q || undefined);
  return c.json(paginate(rows, offset, limit));
});

adminApp.get('/periods/:id', async (c) => {
  const id = c.req.param('id');
  const snap = await loadPeriodSnapshot(id);
  if (!snap) return c.json({ error: 'پیدا نشد' }, 404);
  const owner = await getUserById(snap.period.ownerId);
  return c.json({
    period: snap.period,
    owner: owner ? publicUser(owner) : null,
    members: snap.members,
    expenses: snap.expenses.map(publicExpense),
    payments: snap.payments.map(publicPayment),
    chat: snap.chat,
    recurring: snap.recurring,
    activity: snap.activity,
    invites: snap.invites,
    attachments: snap.attachments.map(publicAttachment),
  });
});

adminApp.get('/periods/:id/expenses/:expenseId/receipt', async (c) => {
  const periodId = c.req.param('id');
  const expenseId = c.req.param('expenseId');
  const expense = await getExpense(expenseId);
  if (!expense || expense.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  let payload = receiptFromDataUrl(expense.attachmentDataUrl);
  if (!payload && expense.attachmentId) {
    const att = await getAttachment(expense.attachmentId);
    if (att?.dataBase64) {
      payload = { mime: att.mime, dataUrl: `data:${att.mime};base64,${att.dataBase64}` };
    }
  }
  if (!payload) return c.json({ error: 'پیدا نشد' }, 404);
  return c.json(payload);
});

adminApp.get('/periods/:id/payments/:paymentId/receipt', async (c) => {
  const periodId = c.req.param('id');
  const paymentId = c.req.param('paymentId');
  const payment = await getPayment(paymentId);
  if (!payment || payment.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  const payload = receiptFromDataUrl(payment.receiptDataUrl);
  if (!payload) return c.json({ error: 'پیدا نشد' }, 404);
  return c.json(payload);
});

adminApp.patch('/periods/:id', async (c) => {
  const actor = (await actorFrom(c))!;
  const id = c.req.param('id');
  const body = await readBody(c, {
    title: undefined as string | undefined,
    currency: undefined as string | undefined,
    visibility: undefined as 'private' | 'public' | undefined,
    kind: undefined as PeriodKind | undefined,
    template: undefined as PeriodTemplate | undefined,
    encrypted: undefined as boolean | undefined,
    ownerId: undefined as string | undefined,
  });
  const period = await getPeriod(id);
  if (!period) return c.json({ error: 'پیدا نشد' }, 404);
  if (body.ownerId) {
    const owner = await getUserById(body.ownerId);
    if (!owner || owner.deletedAt) return c.json({ error: 'صاحب دوره پیدا نشد' }, 400);
  }
  if (body.title?.trim()) period.title = body.title.trim();
  if (body.currency?.trim()) period.currency = body.currency.trim();
  if (body.visibility === 'public' || body.visibility === 'private') period.visibility = body.visibility;
  if (body.kind && PERIOD_KINDS.includes(body.kind)) period.kind = body.kind;
  if (body.template && PERIOD_TEMPLATES.includes(body.template)) period.template = body.template;
  if (body.encrypted === true || body.encrypted === false) period.encrypted = body.encrypted;
  await updatePeriod(period);
  if (body.ownerId) await transferPeriodOwner(id, body.ownerId);
  const next = await getPeriod(id);
  await bumpLedger(id, actor, `ویرایش مشخصات دوره «${next?.title}»`);
  await writeAudit(actor, 'period_patch', 'period', id, 'ویرایش دوره');
  return c.json({ period: next });
});

adminApp.delete('/periods/:id', async (c) => {
  const actor = (await actorFrom(c))!;
  const id = c.req.param('id');
  const period = await getPeriod(id);
  if (!period) return c.json({ error: 'پیدا نشد' }, 404);
  await deletePeriodCascade(id, actor.userId);
  await notifyPeriodMembers(id, actor.userId, 'حذف دوره', `دوره «${period.title}» حذف شد`);
  await writeAudit(actor, 'period_delete', 'period', id, `حذف نرم دوره «${period.title}»`);
  return c.json({ ok: true, period: await getPeriod(id) });
});

adminApp.post('/periods/:id/restore', async (c) => {
  const actor = (await actorFrom(c))!;
  const id = c.req.param('id');
  const period = await getPeriod(id);
  if (!period) return c.json({ error: 'پیدا نشد' }, 404);
  const next = await restorePeriod(id);
  await notifyPeriodMembers(id, actor.userId, 'بازیابی دوره', `دوره «${period.title}» بازیابی شد`);
  await writeAudit(actor, 'period_restore', 'period', id, `بازیابی دوره «${period.title}»`);
  return c.json({ ok: true, period: next });
});

adminApp.post('/periods/:id/reopen', async (c) => {
  const actor = (await actorFrom(c))!;
  const id = c.req.param('id');
  const period = await getPeriod(id);
  if (!period) return c.json({ error: 'پیدا نشد' }, 404);
  const next = await reopenPeriod(id);
  await writeAudit(actor, 'period_reopen', 'period', id, `برداشتن اتمام دوره «${period.title}»`);
  return c.json({ ok: true, period: next });
});

adminApp.patch('/periods/:id/members/:memberId', async (c) => {
  const actor = (await actorFrom(c))!;
  const periodId = c.req.param('id');
  const memberId = c.req.param('memberId');
  const body = await readBody(c, {
    displayName: undefined as string | undefined,
    role: undefined as MemberRole | undefined,
    phone: undefined as string | undefined,
    email: undefined as string | undefined,
  });
  const member = await getMember(memberId);
  if (!member || member.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  const period = await getPeriod(periodId);
  if (body.role === 'owner' && !member.userId) {
    return c.json({ error: 'صاحب دوره باید حساب کاربری داشته باشد' }, 400);
  }
  if (
    (body.role === 'member' || body.role === 'viewer' || body.role === 'manager') &&
    period &&
    member.userId &&
    period.ownerId === member.userId
  ) {
    return c.json({ error: 'ابتدا صاحب دوره را به عضو دیگری منتقل کنید' }, 400);
  }
  if (body.displayName?.trim()) member.displayName = body.displayName.trim();
  if (body.phone !== undefined) member.phone = normalizeIranMobile(body.phone) || body.phone || undefined;
  if (body.email !== undefined) member.email = normalizeEmail(body.email) || body.email || undefined;
  if (body.role === 'owner' && member.userId) {
    await transferPeriodOwner(periodId, member.userId);
    member.role = 'owner';
  } else if (body.role === 'member' || body.role === 'viewer' || body.role === 'manager') {
    member.role = body.role;
  }
  await upsertMember(member);
  const next = (await getMember(memberId))!;
  await bumpLedger(periodId, actor, `ویرایش عضو «${next.displayName}»`, memberId);
  await writeAudit(actor, 'member_patch', 'member', memberId, `ویرایش عضو در دوره ${periodId}`);
  return c.json({ member: next });
});

adminApp.delete('/periods/:id/members/:memberId', async (c) => {
  const actor = (await actorFrom(c))!;
  const periodId = c.req.param('id');
  const memberId = c.req.param('memberId');
  const member = await getMember(memberId);
  if (!member || member.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  const period = await getPeriod(periodId);
  if (period && member.userId && period.ownerId === member.userId) {
    return c.json({ error: 'صاحب دوره را نمی‌توان حذف کرد' }, 400);
  }
  await deleteMember(memberId);
  await bumpLedger(periodId, actor, `حذف عضو «${member.displayName}»`, memberId);
  await writeAudit(actor, 'member_delete', 'member', memberId, `حذف عضو از دوره ${periodId}`);
  return c.json({ ok: true });
});

adminApp.patch('/periods/:id/expenses/:expenseId', async (c) => {
  const actor = (await actorFrom(c))!;
  const periodId = c.req.param('id');
  const expenseId = c.req.param('expenseId');
  const body = await readBody(c, {
    title: undefined as string | undefined,
    amount: undefined as number | undefined,
    note: undefined as string | undefined,
    currency: undefined as string | undefined,
  });
  const expense = await getExpense(expenseId);
  if (!expense || expense.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  if (body.title?.trim()) expense.title = body.title.trim();
  if (typeof body.amount === 'number' && Number.isFinite(body.amount)) expense.amount = body.amount;
  if (body.note !== undefined) expense.note = body.note;
  if (body.currency?.trim()) expense.currency = body.currency.trim();
  // A changed amount must still agree with fixed/percent shares, or every balance read would throw.
  const check = validateShares(expense.splitMode, expenseTotal(expense), expense.shares);
  if (!check.ok) return c.json({ error: describeSplitError(check.error) }, 400);
  expense.updatedAt = new Date().toISOString();
  expense.version = (expense.version || 0) + 1;
  await upsertExpense(expense);
  const next = (await getExpense(expenseId))!;
  await notePeriodChange(periodId, actor, `ویرایش هزینه «${next.title}»`, expenseId);
  await writeAudit(actor, 'expense_patch', 'expense', expenseId, `ویرایش هزینه در دوره ${periodId}`);
  return c.json({ expense: next });
});

adminApp.delete('/periods/:id/expenses/:expenseId', async (c) => {
  const actor = (await actorFrom(c))!;
  const periodId = c.req.param('id');
  const expenseId = c.req.param('expenseId');
  const expense = await getExpense(expenseId);
  if (!expense || expense.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  expense.deletedAt = new Date().toISOString();
  expense.updatedAt = expense.deletedAt;
  expense.version = (expense.version || 0) + 1;
  await upsertExpense(expense);
  await notePeriodChange(periodId, actor, `حذف هزینه «${expense.title}»`, expenseId);
  await writeAudit(actor, 'expense_delete', 'expense', expenseId, `حذف نرم هزینه در دوره ${periodId}`);
  return c.json({ ok: true });
});

adminApp.patch('/periods/:id/payments/:paymentId', async (c) => {
  const actor = (await actorFrom(c))!;
  const periodId = c.req.param('id');
  const paymentId = c.req.param('paymentId');
  const body = await readBody(c, {
    amount: undefined as number | undefined,
    status: undefined as SettlementStatus | undefined,
    note: undefined as string | undefined,
    kind: undefined as 'settlement' | 'loan' | undefined,
  });
  const payment = await getPayment(paymentId);
  if (!payment || payment.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  if (typeof body.amount === 'number' && Number.isFinite(body.amount)) payment.amount = body.amount;
  if (body.status === 'sent' || body.status === 'pending_confirm' || body.status === 'settled') {
    payment.status = body.status;
  }
  if (body.note !== undefined) payment.note = body.note;
  if (body.kind === 'settlement' || body.kind === 'loan') payment.kind = body.kind;
  payment.updatedAt = new Date().toISOString();
  payment.version = (payment.version || 0) + 1;
  await upsertPayment(payment);
  await notePeriodChange(periodId, actor, 'ویرایش تسویه/قرض', paymentId);
  await writeAudit(actor, 'payment_patch', 'payment', paymentId, `ویرایش پرداخت در دوره ${periodId}`);
  return c.json({ payment: await getPayment(paymentId) });
});

adminApp.delete('/periods/:id/payments/:paymentId', async (c) => {
  const actor = (await actorFrom(c))!;
  const periodId = c.req.param('id');
  const paymentId = c.req.param('paymentId');
  const payment = await getPayment(paymentId);
  if (!payment || payment.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  payment.deletedAt = new Date().toISOString();
  payment.updatedAt = payment.deletedAt;
  payment.version = (payment.version || 0) + 1;
  await upsertPayment(payment);
  await notePeriodChange(periodId, actor, 'حذف تسویه/قرض', paymentId);
  await writeAudit(actor, 'payment_delete', 'payment', paymentId, `حذف نرم پرداخت در دوره ${periodId}`);
  return c.json({ ok: true });
});

adminApp.delete('/periods/:id/chat/:msgId', async (c) => {
  const actor = (await actorFrom(c))!;
  const periodId = c.req.param('id');
  const msgId = c.req.param('msgId');
  const snap = await loadPeriodSnapshot(periodId);
  const msg = snap?.chat.find((m) => m.id === msgId);
  if (!msg) return c.json({ error: 'پیدا نشد' }, 404);
  await deleteChat(msgId);
  await bumpLedger(periodId, actor, 'حذف پیام چت', msgId);
  await writeAudit(actor, 'chat_delete', 'chat', msgId, `حذف پیام در دوره ${periodId}`);
  return c.json({ ok: true });
});

adminApp.patch('/periods/:id/recurring/:rid', async (c) => {
  const actor = (await actorFrom(c))!;
  const periodId = c.req.param('id');
  const rid = c.req.param('rid');
  const body = await readBody(c, { active: undefined as boolean | undefined });
  const rule = await getRecurring(rid);
  if (!rule || rule.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  if (body.active === true || body.active === false) rule.active = body.active;
  await upsertRecurring(rule);
  const next = (await getRecurring(rid))!;
  await notePeriodChange(
    periodId,
    actor,
    next.active ? `فعال‌سازی هزینه تکراری «${next.title}»` : `خاموش کردن هزینه تکراری «${next.title}»`,
    rid,
  );
  await writeAudit(actor, 'recurring_patch', 'recurring', rid, `ویرایش تکراری در دوره ${periodId}`);
  return c.json({ recurring: next });
});

adminApp.delete('/periods/:id/recurring/:rid', async (c) => {
  const actor = (await actorFrom(c))!;
  const periodId = c.req.param('id');
  const rid = c.req.param('rid');
  const rule = await getRecurring(rid);
  if (!rule || rule.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  await deleteRecurring(rid);
  await bumpLedger(periodId, actor, `حذف هزینه تکراری «${rule.title}»`, rid);
  await writeAudit(actor, 'recurring_delete', 'recurring', rid, `حذف تکراری در دوره ${periodId}`);
  return c.json({ ok: true });
});

adminApp.post('/periods/:id/recurring/:rid/run', async (c) => {
  const actor = (await actorFrom(c))!;
  const periodId = c.req.param('id');
  const rid = c.req.param('rid');
  const rule = await getRecurring(rid);
  if (!rule || rule.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  const period = await getPeriod(periodId);
  const now = new Date().toISOString();
  const expenseId = nanoid();
  await upsertExpense({
    id: expenseId,
    periodId,
    title: rule.title,
    amount: rule.amount,
    currency: rule.currency,
    payerId: rule.payerId,
    splitMode: rule.splitMode,
    shares: rule.shares,
    tax: { type: 'none', value: 0 },
    service: { type: 'none', value: 0 },
    tip: { type: 'none', value: 0 },
    tags: ['تکراری'],
    fxRate: await recurringFxRate(rule.currency, period?.currency),
    createdAt: now,
    occurredAt: now,
    updatedAt: now,
    version: 1,
  });
  await upsertRecurring(
    { ...rule, nextAt: nextRecurringAt(now, rule.cadence || 'days', rule.intervalDays) },
    { bump: false },
  );
  await pushActivity(periodId, actor, 'admin_update', `اجرای هزینه تکراری «${rule.title}»`, expenseId);
  await notifyPeriod(periodId, actor.id, 'به‌روزرسانی دوره', `اجرای هزینه تکراری «${rule.title}»`);
  await writeAudit(actor, 'recurring_run', 'recurring', rid, `اجرای تکراری در دوره ${periodId}`);
  return c.json({ ok: true, expenseId });
});

adminApp.delete('/periods/:id/invites/:token', async (c) => {
  const actor = (await actorFrom(c))!;
  const periodId = c.req.param('id');
  const token = decodeURIComponent(c.req.param('token'));
  const snap = await loadPeriodSnapshot(periodId);
  const invite = snap?.invites.find((i) => i.token === token);
  if (!invite) return c.json({ error: 'پیدا نشد' }, 404);
  await deleteInvite(token);
  await bumpLedger(periodId, actor, 'ابطال دعوت', token);
  await writeAudit(actor, 'invite_revoke', 'invite', token, `ابطال دعوت دوره ${periodId}`);
  return c.json({ ok: true });
});

adminApp.delete('/periods/:id/attachments/:aid', async (c) => {
  const actor = (await actorFrom(c))!;
  const periodId = c.req.param('id');
  const aid = c.req.param('aid');
  const snap = await loadPeriodSnapshot(periodId);
  const att = snap?.attachments.find((a) => a.id === aid);
  if (!snap || !att) return c.json({ error: 'پیدا نشد' }, 404);
  await deleteAttachment(aid);
  const now = new Date().toISOString();
  for (const e of (snap.expenses || []).filter((x) => x.attachmentId === aid)) {
    await upsertExpense(
      {
        ...e,
        attachmentId: undefined,
        attachmentDataUrl: undefined,
        updatedAt: now,
        version: (e.version || 0) + 1,
      },
      { bump: false },
    );
  }
  await bumpLedger(periodId, actor, 'حذف پیوست', aid);
  await writeAudit(actor, 'attachment_delete', 'attachment', aid, `حذف پیوست دوره ${periodId}`);
  return c.json({ ok: true });
});

adminApp.delete('/periods/:id/expenses/:expenseId/attachment', async (c) => {
  const actor = (await actorFrom(c))!;
  const periodId = c.req.param('id');
  const expenseId = c.req.param('expenseId');
  const expense = await getExpense(expenseId);
  if (!expense || expense.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  if (expense.attachmentId) await deleteAttachment(expense.attachmentId);
  await upsertExpense({
    ...expense,
    attachmentId: undefined,
    attachmentDataUrl: undefined,
    updatedAt: new Date().toISOString(),
    version: (expense.version || 0) + 1,
  });
  await bumpLedger(periodId, actor, `حذف رسید «${expense.title}»`, expenseId);
  await writeAudit(actor, 'expense_attachment_delete', 'expense', expenseId, `حذف رسید هزینه در دوره ${periodId}`);
  return c.json({ ok: true });
});

adminApp.get('/billing/zarinpal-pending', async (c) => {
  const { offset, limit } = parsePage(c);
  const rows = [...(await listZarinpalPending())].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return c.json(paginate(rows, offset, limit));
});

adminApp.get('/billing/events', async (c) => {
  const { offset, limit, q } = parsePage(c);
  const events = await listBillingEvents();
  const users = q ? await listUsers() : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const rows = events.filter((e) => {
    if (!q) return true;
    const user = byId.get(e.userId);
    return `${e.id} ${e.userId} ${e.source} ${e.sku || ''} ${user?.displayName || ''} ${user?.phone || ''}`
      .toLowerCase()
      .includes(q);
  });
  return c.json(paginate(rows, offset, limit));
});

adminApp.delete('/billing/zarinpal-pending/:authority', async (c) => {
  const actor = (await actorFrom(c))!;
  const authority = decodeURIComponent(c.req.param('authority'));
  const exists = (await listZarinpalPending()).some((p) => p.authority === authority);
  if (!exists) return c.json({ error: 'پیدا نشد' }, 404);
  await deleteZarinpalPending(authority);
  await writeAudit(actor, 'zarinpal_pending_delete', 'billing', authority, 'حذف پرداخت معلق زرین‌پال');
  return c.json({ ok: true });
});

adminApp.get('/billing/sheba-lookups', async (c) => {
  const { offset, limit } = parsePage(c);
  const rows = await listShebaLookups();
  return c.json(paginate(rows, offset, limit));
});

adminApp.get('/audit', async (c) => {
  const { offset, limit, q } = parsePage(c);
  const rows = (await listAdminAudit()).filter((a) => {
    if (!q) return true;
    return `${a.action} ${a.targetType} ${a.targetId} ${a.summary} ${a.actorPhone || ''}`.toLowerCase().includes(q);
  });
  return c.json(paginate(rows, offset, limit));
});

adminApp.post('/notifications', async (c) => {
  const actor = (await actorFrom(c))!;
  const body = await readBody(c, {
    userId: undefined as string | undefined,
    all: false,
    title: '',
    body: '',
  });
  const title = (body.title || '').trim();
  const text = (body.body || '').trim();
  if (!title || !text) return c.json({ error: 'عنوان و متن لازم است' }, 400);
  const activeIds = await listActiveUserIds();
  const targets = body.all
    ? activeIds
    : body.userId && activeIds.includes(body.userId)
      ? [body.userId]
      : [];
  if (!targets.length) return c.json({ error: 'گیرنده پیدا نشد' }, 404);
  const createdAt = new Date().toISOString();
  for (const userId of targets) {
    await insertNotification({
      id: nanoid(),
      userId,
      title,
      body: text,
      read: false,
      createdAt,
    });
  }
  await writeAudit(
    actor,
    body.all ? 'notif_broadcast' : 'notif_send',
    'notification',
    body.all ? 'all' : targets[0],
    body.all ? `نوتیف همگانی به ${targets.length} کاربر` : `نوتیف به کاربر ${targets[0]}`,
  );
  return c.json({ ok: true, sent: targets.length });
});

adminApp.get('/settings', async (c) => {
  const [extra, fx, sessions, otpsActive, senator] = await Promise.all([
    extraAdminPhones(),
    getFxCache(),
    countSessions(),
    countActiveOtps(),
    fetchSenatorAmount(),
  ]);
  return c.json({
    envAdminPhones: adminPhones(),
    extraAdminPhones: extra,
    senator,
    fx: fx || null,
    sessions,
    otpsActive,
  });
});

adminApp.patch('/settings', async (c) => {
  const actor = (await actorFrom(c))!;
  const body = await readBody(c, { extraAdminPhones: undefined as string[] | undefined });
  if (!Array.isArray(body.extraAdminPhones)) return c.json({ error: 'شماره‌ها لازم است' }, 400);
  const phones = [
    ...new Set(
      body.extraAdminPhones
        .map((p) => normalizeIranMobile(String(p)))
        .filter((p): p is string => Boolean(p)),
    ),
  ];
  await setExtraAdminPhones(phones);
  await writeAudit(actor, 'settings_admin_phones', 'settings', 'platform', `${phones.length} شماره ادمین اضافه`);
  return c.json({ extraAdminPhones: await extraAdminPhones() });
});

adminApp.post('/fx/refresh', async (c) => {
  const actor = (await actorFrom(c))!;
  const fx = await getFxRates({ force: true });
  await writeAudit(actor, 'fx_refresh', 'fx', 'cache', `نوسازی نرخ ارز (${fx.source})`);
  return c.json(fx);
});

adminApp.get('/export', async (c) => {
  const actor = (await actorFrom(c))!;
  const db = await getDb();
  const dump = {
    ...db,
    users: db.users.map((u) => {
      const { passwordHash: _pw, payoutMethods: _cards, ...rest } = u;
      return rest;
    }),
    otps: db.otps.map((o) => ({ phone: o.phone, expiresAt: o.expiresAt })),
  };
  await writeAudit(actor, 'export', 'store', 'json', 'خروجی پشتیبان JSON');
  c.header('Content-Disposition', 'attachment; filename="dongham-export.json"');
  return c.json(wrapDonghamExport('server', dump));
});
