import type { Context, Next } from 'hono';
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { isPremium as isPremiumEntitlement, nextRecurringAt, normalizeEmail, normalizeIranMobile } from '@dongham/ledger';
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
import { bumpPeriodVersion, getDb, mutate } from './db.js';
import { getFxRates } from './fx.js';
import { persistPremiumExpiry, publicUser } from './profile.js';
import { appPublicUrl } from './publicUrl.js';
import type {
  AdminAuditRecord,
  AttachmentRecord,
  ExpenseRecord,
  MemberRecord,
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
  const { attachmentDataUrl, ...rest } = e;
  return { ...rest, hasAttachment: Boolean(attachmentDataUrl || e.attachmentId) };
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

function isPremium(u: UserRecord): boolean {
  persistPremiumExpiry(u);
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

function actorFrom(c: Context<{ Variables: AdminVariables }>): UserRecord | null {
  const userId = c.get('userId');
  if (!userId) return null;
  return getDb().users.find((u) => u.id === userId && !u.deletedAt) || null;
}

function writeAudit(
  actor: UserRecord,
  action: string,
  targetType: string,
  targetId: string,
  summary: string,
): void {
  const row: AdminAuditRecord = {
    id: nanoid(),
    actorUserId: actor.id,
    actorPhone: actor.phone,
    action,
    targetType,
    targetId,
    summary,
    createdAt: new Date().toISOString(),
  };
  mutate((d) => {
    if (!d.adminAudit) d.adminAudit = [];
    d.adminAudit.unshift(row);
    if (d.adminAudit.length > 2000) d.adminAudit = d.adminAudit.slice(0, 2000);
  });
}

function pushActivity(
  periodId: string,
  actor: UserRecord,
  action: string,
  summary: string,
  entityId?: string,
): void {
  mutate((d) => {
    if (!d.activity) d.activity = [];
    d.activity.push({
      id: nanoid(),
      periodId,
      actorName: `ادمین (${actor.displayName})`,
      action,
      summary,
      createdAt: new Date().toISOString(),
      entityId,
    });
  });
}

function notifyPeriod(periodId: string, actorUserId: string, title: string, body: string): void {
  mutate((d) => {
    const p = d.periods.find((x) => x.id === periodId);
    if (!p) return;
    for (const m of d.members.filter((x) => x.periodId === periodId && x.userId && x.userId !== actorUserId)) {
      d.notifications.push({
        id: nanoid(),
        userId: m.userId!,
        title,
        body,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
  });
}

function bumpLedger(periodId: string, actor: UserRecord, summary: string, entityId?: string): void {
  mutate((d) => bumpPeriodVersion(d, periodId));
  pushActivity(periodId, actor, 'admin_update', summary, entityId);
  notifyPeriod(periodId, actor.id, 'به‌روزرسانی دوره', summary);
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
  const user = getDb().users.find((u) => u.id === userId && !u.deletedAt);
  if (!user || !isAdminPhone(user.phone)) return c.json({ error: 'اجازه ندارید' }, 403);
  await next();
}

function memberMatchesUser(periodId: string, userId: string): boolean {
  const db = getDb();
  const user = db.users.find((u) => u.id === userId);
  const phone = normalizeIranMobile(user?.phone);
  const email = normalizeEmail(user?.email);
  return db.members.some((m) => {
    if (m.periodId !== periodId) return false;
    if (m.userId === userId) return true;
    if (phone && normalizeIranMobile(m.phone) === phone) return true;
    if (email && m.email && normalizeEmail(m.email) === email) return true;
    return false;
  });
}

function transferPeriodOwner(d: { periods: { id: string; ownerId: string }[]; members: MemberRecord[] }, periodId: string, newOwnerUserId: string): void {
  const p = d.periods.find((x) => x.id === periodId);
  if (!p) return;
  p.ownerId = newOwnerUserId;
  for (const m of d.members.filter((row) => row.periodId === periodId)) {
    if (m.userId === newOwnerUserId) m.role = 'owner';
    else if (m.role === 'owner') m.role = 'member';
  }
}

function periodsForUser(userId: string) {
  const db = getDb();
  return db.periods.filter((p) => p.ownerId === userId || memberMatchesUser(p.id, userId));
}

export async function consumeImpersonation(
  code: string,
  deviceId: string,
): Promise<{ token: string; user: UserRecord } | { error: string; status: 400 | 404 }> {
  const now = Date.now();
  mutate((d) => {
    d.impersonationTickets = (d.impersonationTickets || []).filter((t) => {
      if (t.token && t.consumedAt) return now - t.consumedAt < 15_000;
      return t.expiresAt > now;
    });
  });
  const ticket = (getDb().impersonationTickets || []).find((t) => t.code === code);
  if (!ticket) return { error: 'کد نامعتبر است', status: 400 };
  if (ticket.token) {
    const user = getDb().users.find((u) => u.id === ticket.userId && !u.deletedAt);
    if (!user) return { error: 'پیدا نشد', status: 404 };
    if (user.bannedAt) return { error: 'این حساب مسدود است', status: 400 };
    return { token: ticket.token, user };
  }
  if (ticket.expiresAt <= now) return { error: 'کد نامعتبر است', status: 400 };
  const user = getDb().users.find((u) => u.id === ticket.userId && !u.deletedAt);
  if (!user) return { error: 'پیدا نشد', status: 404 };
  if (user.bannedAt) return { error: 'این حساب مسدود است', status: 400 };
  const token = await issueToken(user.id, deviceId || nanoid(), {
    expiresIn: '1h',
    impersonatedBy: ticket.actorUserId,
  });
  mutate((d) => {
    const row = (d.impersonationTickets || []).find((t) => t.code === code);
    if (row) {
      row.token = token;
      row.consumedAt = Date.now();
    }
  });
  return { token, user };
}

export const adminApp = new Hono<{ Variables: AdminVariables }>();

adminApp.post('/auth/otp/request', async (c) => {
  const { phone } = await readBody(c, { phone: '' });
  const local = normalizeIranMobile(phone || '');
  if (!local || !isAdminPhone(local) || tooManyAdminOtp(local)) {
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
  if (!local || !isAdminPhone(local) || !code || !verifyOtp(local, code)) {
    return c.json({ error: GENERIC_OTP_ERROR }, 400);
  }
  let user = findUserByPhone(local);
  if (!user) {
    user = createUser({ phone: local, displayName: `ادمین ${local.slice(-4)}` });
  }
  const token = await issueToken(user.id, deviceId || nanoid(), {
    expiresIn: '24h',
    role: 'admin',
  });
  writeAudit(user, 'admin_login', 'session', user.id, 'ورود به پنل ادمین');
  return c.json({ token, user: publicUser(user) });
});

adminApp.use('*', requireAdminMw);

adminApp.get('/auth/me', (c) => {
  const user = actorFrom(c)!;
  return c.json({ user: publicUser(user) });
});

adminApp.post('/auth/logout', (c) => {
  const token = bearer(c);
  const user = actorFrom(c)!;
  if (token) {
    mutate((d) => {
      d.sessions = d.sessions.filter((s) => s.token !== token);
    });
  }
  writeAudit(user, 'admin_logout', 'session', user.id, 'خروج از پنل ادمین');
  return c.json({ ok: true });
});

adminApp.get('/stats', (c) => {
  const db = getDb();
  const users = db.users;
  const active = users.filter((u) => !u.deletedAt && !u.bannedAt);
  return c.json({
    usersActive: active.length,
    usersDeleted: users.filter((u) => u.deletedAt).length,
    usersPremium: active.filter(isPremium).length,
    periods: db.periods.length,
    expenses: db.expenses.filter((e) => !e.deletedAt).length,
    payments: db.payments.filter((p) => !p.deletedAt).length,
    sessions: db.sessions.length,
    zarinpalPending: (db.zarinpalPending || []).length,
    telegramLinks: (db.telegramLinks || []).length,
    health: { ok: true, service: 'dongham-api' },
  });
});

adminApp.get('/users', (c) => {
  const { offset, limit, q } = parsePage(c);
  const rows = getDb()
    .users.filter((u) => {
      if (!q) return true;
      const hay = `${u.displayName} ${u.phone || ''} ${u.email || ''} ${u.plan || ''} ${u.id}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const page = paginate(rows, offset, limit);
  return c.json({ ...page, items: page.items.map(publicUser) });
});

adminApp.get('/users/:id', (c) => {
  const user = getDb().users.find((u) => u.id === c.req.param('id'));
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  const db = getDb();
  const periods = periodsForUser(user.id).map((p) => ({
    id: p.id,
    title: p.title,
    currency: p.currency,
    ownerId: p.ownerId,
    createdAt: p.createdAt,
    version: p.version,
  }));
  const sessions = db.sessions
    .filter((s) => s.userId === user.id)
    .map((s) => ({ id: s.id, deviceId: s.deviceId, createdAt: s.createdAt }));
  const friends = db.friends.filter((f) => f.userId === user.id);
  return c.json({ user: publicUser(user), periods, sessions, friends });
});

adminApp.get('/users/:id/notifications', (c) => {
  const user = getDb().users.find((u) => u.id === c.req.param('id'));
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  const items = getDb()
    .notifications.filter((n) => n.userId === user.id)
    .slice()
    .reverse()
    .slice(0, 100);
  return c.json({ items, total: items.length });
});

adminApp.delete('/users/:id/friends/:friendId', (c) => {
  const actor = actorFrom(c)!;
  const id = c.req.param('id');
  const friendId = c.req.param('friendId');
  const row = getDb().friends.find((f) => f.id === friendId && f.userId === id);
  if (!row) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((d) => {
    d.friends = d.friends.filter((f) => !(f.id === friendId && f.userId === id));
  });
  writeAudit(actor, 'friend_delete', 'user', id, `حذف دوست «${row.displayName}»`);
  return c.json({ ok: true });
});

adminApp.patch('/users/:id', async (c) => {
  const actor = actorFrom(c)!;
  const id = c.req.param('id');
  const body = await readBody(c, { displayName: '' });
  const user = getDb().users.find((u) => u.id === id);
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  const displayName = (body.displayName || '').trim();
  if (!displayName) return c.json({ error: 'نام نمایشی لازم است' }, 400);
  mutate((d) => {
    const row = d.users.find((u) => u.id === id);
    if (row) {
      row.displayName = displayName;
      row.prefsUpdatedAt = new Date().toISOString();
    }
  });
  writeAudit(actor, 'user_rename', 'user', id, `تغییر نام به «${displayName}»`);
  const next = getDb().users.find((u) => u.id === id)!;
  return c.json({ user: publicUser(next) });
});

adminApp.post('/users/:id/premium', async (c) => {
  const actor = actorFrom(c)!;
  const id = c.req.param('id');
  const body = await readBody(c, { days: undefined as number | undefined, until: undefined as string | undefined, revoke: false });
  const user = getDb().users.find((u) => u.id === id && !u.deletedAt);
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((d) => {
    const row = d.users.find((u) => u.id === id);
    if (!row) return;
    if (body.revoke) {
      row.plan = 'free';
      row.premiumUntil = undefined;
      return;
    }
    row.plan = 'premium';
    if (body.until) row.premiumUntil = new Date(body.until).toISOString();
    else row.premiumUntil = premiumUntilFromNow(body.days === 365 ? 365 : body.days === 30 ? 30 : 30);
  });
  const next = getDb().users.find((u) => u.id === id)!;
  if (!body.revoke && next.premiumUntil) {
    recordBillingEvent({ userId: id, source: 'admin', until: next.premiumUntil });
  }
  writeAudit(
    actor,
    body.revoke ? 'premium_revoke' : 'premium_grant',
    'user',
    id,
    body.revoke ? 'بازپس‌گیری پریمیوم' : `اعطا تا ${next.premiumUntil}`,
  );
  return c.json({ user: publicUser(next) });
});

adminApp.post('/users/:id/revoke-sessions', (c) => {
  const actor = actorFrom(c)!;
  const id = c.req.param('id');
  const user = getDb().users.find((u) => u.id === id);
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  const keep = bearer(c);
  mutate((d) => {
    d.sessions = d.sessions.filter((s) => s.userId !== id || (actor.id === id && s.token === keep));
  });
  writeAudit(actor, 'revoke_sessions', 'user', id, 'ابطال نشست‌ها');
  return c.json({ ok: true });
});

adminApp.post('/users/:id/delete', (c) => {
  const actor = actorFrom(c)!;
  const id = c.req.param('id');
  if (id === actor.id) return c.json({ error: 'نمی‌توانید حساب خودتان را حذف کنید' }, 400);
  const user = getDb().users.find((u) => u.id === id);
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((db) => {
    const u = db.users.find((x) => x.id === id);
    if (u) {
      u.deletedAt = new Date().toISOString();
      u.phone = undefined;
      u.email = undefined;
      u.googleId = undefined;
      u.passwordHash = undefined;
      u.displayName = 'حساب حذف‌شده';
    }
    db.sessions = db.sessions.filter((s) => s.userId !== id);
  });
  writeAudit(actor, 'user_delete', 'user', id, 'حذف نرم حساب');
  return c.json({ ok: true });
});

adminApp.post('/users/:id/restore', (c) => {
  const actor = actorFrom(c)!;
  const id = c.req.param('id');
  const user = getDb().users.find((u) => u.id === id);
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  if (!user.deletedAt) return c.json({ error: 'این حساب حذف نشده' }, 400);
  if (!user.phone && !user.email && !user.googleId) {
    return c.json({ error: 'بازیابی ممکن نیست؛ اطلاعات تماس پاک شده است' }, 409);
  }
  mutate((d) => {
    const row = d.users.find((u) => u.id === id);
    if (row) row.deletedAt = undefined;
  });
  writeAudit(actor, 'user_restore', 'user', id, 'بازیابی حساب');
  const next = getDb().users.find((u) => u.id === id)!;
  return c.json({ user: publicUser(next) });
});

adminApp.post('/users/:id/ban', (c) => {
  const actor = actorFrom(c)!;
  const id = c.req.param('id');
  if (id === actor.id) return c.json({ error: 'نمی‌توانید حساب خودتان را مسدود کنید' }, 400);
  const user = getDb().users.find((u) => u.id === id && !u.deletedAt);
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((d) => {
    const row = d.users.find((u) => u.id === id);
    if (row) row.bannedAt = new Date().toISOString();
    d.sessions = d.sessions.filter((s) => s.userId !== id);
  });
  writeAudit(actor, 'user_ban', 'user', id, `مسدود کردن «${user.displayName}»`);
  return c.json({ user: publicUser(getDb().users.find((u) => u.id === id)!) });
});

adminApp.post('/users/:id/unban', (c) => {
  const actor = actorFrom(c)!;
  const id = c.req.param('id');
  const user = getDb().users.find((u) => u.id === id);
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  if (!user.bannedAt) return c.json({ error: 'این حساب مسدود نیست' }, 400);
  mutate((d) => {
    const row = d.users.find((u) => u.id === id);
    if (row) row.bannedAt = undefined;
  });
  writeAudit(actor, 'user_unban', 'user', id, `رفع مسدودی «${user.displayName}»`);
  return c.json({ user: publicUser(getDb().users.find((u) => u.id === id)!) });
});

adminApp.post('/users/:id/impersonate', (c) => {
  const actor = actorFrom(c)!;
  const id = c.req.param('id');
  const user = getDb().users.find((u) => u.id === id && !u.deletedAt);
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  if (user.bannedAt) return c.json({ error: 'این حساب مسدود است' }, 400);
  const code = nanoid(16);
  const expiresAt = Date.now() + 2 * 60_000;
  mutate((d) => {
    if (!d.impersonationTickets) d.impersonationTickets = [];
    d.impersonationTickets = d.impersonationTickets.filter((t) => t.expiresAt > Date.now());
    d.impersonationTickets.push({ code, userId: id, actorUserId: actor.id, expiresAt });
  });
  writeAudit(actor, 'impersonate', 'user', id, `ورود به جای «${user.displayName}»`);
  return c.json({
    ok: true,
    code,
    expiresAt,
    appUrl: `${appPublicUrl()}/auth?imp=${encodeURIComponent(code)}`,
  });
});

adminApp.get('/periods', (c) => {
  const { offset, limit, q } = parsePage(c);
  const db = getDb();
  const rows = db.periods
    .filter((p) => {
      if (!q) return true;
      const owner = db.users.find((u) => u.id === p.ownerId);
      const hay = `${p.id} ${p.title} ${p.currency} ${owner?.displayName || ''} ${owner?.phone || ''}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((p) => ({
      ...p,
      ownerName: db.users.find((u) => u.id === p.ownerId)?.displayName,
      memberCount: db.members.filter((m) => m.periodId === p.id).length,
      expenseCount: db.expenses.filter((e) => e.periodId === p.id && !e.deletedAt).length,
    }));
  return c.json(paginate(rows, offset, limit));
});

adminApp.get('/periods/:id', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const period = db.periods.find((p) => p.id === id);
  if (!period) return c.json({ error: 'پیدا نشد' }, 404);
  return c.json({
    period,
    owner: db.users.find((u) => u.id === period.ownerId)
      ? publicUser(db.users.find((u) => u.id === period.ownerId)!)
      : null,
    members: db.members.filter((m) => m.periodId === id),
    expenses: db.expenses.filter((e) => e.periodId === id).map(publicExpense),
    payments: db.payments.filter((p) => p.periodId === id),
    chat: db.chat.filter((m) => m.periodId === id),
    recurring: db.recurring.filter((r) => r.periodId === id),
    activity: (db.activity || []).filter((a) => a.periodId === id),
    invites: db.invites.filter((i) => i.periodId === id),
    attachments: db.attachments.filter((a) => a.periodId === id).map(publicAttachment),
    telegramLinks: (db.telegramLinks || []).filter((l) => l.periodId === id),
  });
});

adminApp.patch('/periods/:id', async (c) => {
  const actor = actorFrom(c)!;
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
  const period = getDb().periods.find((p) => p.id === id);
  if (!period) return c.json({ error: 'پیدا نشد' }, 404);
  if (body.ownerId) {
    const owner = getDb().users.find((u) => u.id === body.ownerId && !u.deletedAt);
    if (!owner) return c.json({ error: 'صاحب دوره پیدا نشد' }, 400);
  }
  mutate((d) => {
    const p = d.periods.find((x) => x.id === id);
    if (!p) return;
    if (body.title?.trim()) p.title = body.title.trim();
    if (body.currency?.trim()) p.currency = body.currency.trim();
    if (body.visibility === 'public' || body.visibility === 'private') p.visibility = body.visibility;
    if (body.kind && PERIOD_KINDS.includes(body.kind)) p.kind = body.kind;
    if (body.template && PERIOD_TEMPLATES.includes(body.template)) p.template = body.template;
    if (body.encrypted === true || body.encrypted === false) p.encrypted = body.encrypted;
    if (body.ownerId) transferPeriodOwner(d, id, body.ownerId);
  });
  bumpLedger(id, actor, `ویرایش مشخصات دوره «${getDb().periods.find((p) => p.id === id)?.title}»`);
  writeAudit(actor, 'period_patch', 'period', id, 'ویرایش دوره');
  return c.json({ period: getDb().periods.find((p) => p.id === id) });
});

adminApp.delete('/periods/:id', (c) => {
  const actor = actorFrom(c)!;
  const id = c.req.param('id');
  const period = getDb().periods.find((p) => p.id === id);
  if (!period) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((d) => {
    d.periods = d.periods.filter((p) => p.id !== id);
    d.members = d.members.filter((m) => m.periodId !== id);
    d.expenses = d.expenses.filter((e) => e.periodId !== id);
    d.payments = d.payments.filter((p) => p.periodId !== id);
    d.chat = d.chat.filter((m) => m.periodId !== id);
    d.invites = d.invites.filter((i) => i.periodId !== id);
    d.attachments = d.attachments.filter((a) => a.periodId !== id);
    d.activity = (d.activity || []).filter((a) => a.periodId !== id);
    d.recurring = d.recurring.filter((r) => r.periodId !== id);
    d.telegramLinks = (d.telegramLinks || []).filter((l) => l.periodId !== id);
  });
  writeAudit(actor, 'period_delete', 'period', id, `حذف دوره «${period.title}» و داده‌های وابسته`);
  return c.json({ ok: true });
});

adminApp.patch('/periods/:id/members/:memberId', async (c) => {
  const actor = actorFrom(c)!;
  const periodId = c.req.param('id');
  const memberId = c.req.param('memberId');
  const body = await readBody(c, {
    displayName: undefined as string | undefined,
    role: undefined as MemberRole | undefined,
    phone: undefined as string | undefined,
    email: undefined as string | undefined,
  });
  const member = getDb().members.find((m) => m.id === memberId && m.periodId === periodId);
  if (!member) return c.json({ error: 'پیدا نشد' }, 404);
  const period = getDb().periods.find((p) => p.id === periodId);
  if (body.role === 'owner' && !member.userId) {
    return c.json({ error: 'صاحب دوره باید حساب کاربری داشته باشد' }, 400);
  }
  if (
    (body.role === 'member' || body.role === 'viewer') &&
    period &&
    member.userId &&
    period.ownerId === member.userId
  ) {
    return c.json({ error: 'ابتدا صاحب دوره را به عضو دیگری منتقل کنید' }, 400);
  }
  mutate((d) => {
    const row = d.members.find((m) => m.id === memberId && m.periodId === periodId) as MemberRecord | undefined;
    if (!row) return;
    if (body.displayName?.trim()) row.displayName = body.displayName.trim();
    if (body.role === 'owner' && row.userId) transferPeriodOwner(d, periodId, row.userId);
    else if (body.role === 'member' || body.role === 'viewer') row.role = body.role;
    if (body.phone !== undefined) row.phone = normalizeIranMobile(body.phone) || body.phone || undefined;
    if (body.email !== undefined) row.email = normalizeEmail(body.email) || body.email || undefined;
  });
  const next = getDb().members.find((m) => m.id === memberId)!;
  bumpLedger(periodId, actor, `ویرایش عضو «${next.displayName}»`, memberId);
  writeAudit(actor, 'member_patch', 'member', memberId, `ویرایش عضو در دوره ${periodId}`);
  return c.json({ member: next });
});

adminApp.delete('/periods/:id/members/:memberId', (c) => {
  const actor = actorFrom(c)!;
  const periodId = c.req.param('id');
  const memberId = c.req.param('memberId');
  const member = getDb().members.find((m) => m.id === memberId && m.periodId === periodId);
  if (!member) return c.json({ error: 'پیدا نشد' }, 404);
  const period = getDb().periods.find((p) => p.id === periodId);
  if (period && member.userId && period.ownerId === member.userId) {
    return c.json({ error: 'صاحب دوره را نمی‌توان حذف کرد' }, 400);
  }
  mutate((d) => {
    d.members = d.members.filter((m) => !(m.id === memberId && m.periodId === periodId));
  });
  bumpLedger(periodId, actor, `حذف عضو «${member.displayName}»`, memberId);
  writeAudit(actor, 'member_delete', 'member', memberId, `حذف عضو از دوره ${periodId}`);
  return c.json({ ok: true });
});

adminApp.patch('/periods/:id/expenses/:expenseId', async (c) => {
  const actor = actorFrom(c)!;
  const periodId = c.req.param('id');
  const expenseId = c.req.param('expenseId');
  const body = await readBody(c, {
    title: undefined as string | undefined,
    amount: undefined as number | undefined,
    note: undefined as string | undefined,
    currency: undefined as string | undefined,
  });
  const expense = getDb().expenses.find((e) => e.id === expenseId && e.periodId === periodId);
  if (!expense) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((d) => {
    const row = d.expenses.find((e) => e.id === expenseId && e.periodId === periodId) as ExpenseRecord | undefined;
    if (!row) return;
    if (body.title?.trim()) row.title = body.title.trim();
    if (typeof body.amount === 'number' && Number.isFinite(body.amount)) row.amount = body.amount;
    if (body.note !== undefined) row.note = body.note;
    if (body.currency?.trim()) row.currency = body.currency.trim();
    row.updatedAt = new Date().toISOString();
    row.version = (row.version || 0) + 1;
  });
  const next = getDb().expenses.find((e) => e.id === expenseId)!;
  bumpLedger(periodId, actor, `ویرایش هزینه «${next.title}»`, expenseId);
  writeAudit(actor, 'expense_patch', 'expense', expenseId, `ویرایش هزینه در دوره ${periodId}`);
  return c.json({ expense: next });
});

adminApp.delete('/periods/:id/expenses/:expenseId', (c) => {
  const actor = actorFrom(c)!;
  const periodId = c.req.param('id');
  const expenseId = c.req.param('expenseId');
  const expense = getDb().expenses.find((e) => e.id === expenseId && e.periodId === periodId);
  if (!expense) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((d) => {
    const row = d.expenses.find((e) => e.id === expenseId && e.periodId === periodId);
    if (row) {
      row.deletedAt = new Date().toISOString();
      row.updatedAt = row.deletedAt;
      row.version = (row.version || 0) + 1;
    }
  });
  bumpLedger(periodId, actor, `حذف هزینه «${expense.title}»`, expenseId);
  writeAudit(actor, 'expense_delete', 'expense', expenseId, `حذف نرم هزینه در دوره ${periodId}`);
  return c.json({ ok: true });
});

adminApp.patch('/periods/:id/payments/:paymentId', async (c) => {
  const actor = actorFrom(c)!;
  const periodId = c.req.param('id');
  const paymentId = c.req.param('paymentId');
  const body = await readBody(c, {
    amount: undefined as number | undefined,
    status: undefined as SettlementStatus | undefined,
    note: undefined as string | undefined,
    kind: undefined as 'settlement' | 'loan' | undefined,
  });
  const payment = getDb().payments.find((p) => p.id === paymentId && p.periodId === periodId);
  if (!payment) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((d) => {
    const row = d.payments.find((p) => p.id === paymentId && p.periodId === periodId) as PaymentRecord | undefined;
    if (!row) return;
    if (typeof body.amount === 'number' && Number.isFinite(body.amount)) row.amount = body.amount;
    if (body.status === 'sent' || body.status === 'pending_confirm' || body.status === 'settled') {
      row.status = body.status;
    }
    if (body.note !== undefined) row.note = body.note;
    if (body.kind === 'settlement' || body.kind === 'loan') row.kind = body.kind;
    row.updatedAt = new Date().toISOString();
    row.version = (row.version || 0) + 1;
  });
  bumpLedger(periodId, actor, 'ویرایش تسویه/قرض', paymentId);
  writeAudit(actor, 'payment_patch', 'payment', paymentId, `ویرایش پرداخت در دوره ${periodId}`);
  return c.json({ payment: getDb().payments.find((p) => p.id === paymentId) });
});

adminApp.delete('/periods/:id/payments/:paymentId', (c) => {
  const actor = actorFrom(c)!;
  const periodId = c.req.param('id');
  const paymentId = c.req.param('paymentId');
  const payment = getDb().payments.find((p) => p.id === paymentId && p.periodId === periodId);
  if (!payment) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((d) => {
    const row = d.payments.find((p) => p.id === paymentId && p.periodId === periodId);
    if (row) {
      row.deletedAt = new Date().toISOString();
      row.updatedAt = row.deletedAt;
      row.version = (row.version || 0) + 1;
    }
  });
  bumpLedger(periodId, actor, 'حذف تسویه/قرض', paymentId);
  writeAudit(actor, 'payment_delete', 'payment', paymentId, `حذف نرم پرداخت در دوره ${periodId}`);
  return c.json({ ok: true });
});

adminApp.delete('/periods/:id/chat/:msgId', (c) => {
  const actor = actorFrom(c)!;
  const periodId = c.req.param('id');
  const msgId = c.req.param('msgId');
  const msg = getDb().chat.find((m) => m.id === msgId && m.periodId === periodId);
  if (!msg) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((d) => {
    d.chat = d.chat.filter((m) => !(m.id === msgId && m.periodId === periodId));
  });
  bumpLedger(periodId, actor, 'حذف پیام چت', msgId);
  writeAudit(actor, 'chat_delete', 'chat', msgId, `حذف پیام در دوره ${periodId}`);
  return c.json({ ok: true });
});

adminApp.patch('/periods/:id/recurring/:rid', async (c) => {
  const actor = actorFrom(c)!;
  const periodId = c.req.param('id');
  const rid = c.req.param('rid');
  const body = await readBody(c, { active: undefined as boolean | undefined });
  const rule = getDb().recurring.find((r) => r.id === rid && r.periodId === periodId);
  if (!rule) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((d) => {
    const row = d.recurring.find((r) => r.id === rid && r.periodId === periodId);
    if (row && (body.active === true || body.active === false)) row.active = body.active;
  });
  const next = getDb().recurring.find((r) => r.id === rid)!;
  bumpLedger(periodId, actor, next.active ? `فعال‌سازی هزینه تکراری «${next.title}»` : `خاموش کردن هزینه تکراری «${next.title}»`, rid);
  writeAudit(actor, 'recurring_patch', 'recurring', rid, `ویرایش تکراری در دوره ${periodId}`);
  return c.json({ recurring: next });
});

adminApp.delete('/periods/:id/recurring/:rid', (c) => {
  const actor = actorFrom(c)!;
  const periodId = c.req.param('id');
  const rid = c.req.param('rid');
  const rule = getDb().recurring.find((r) => r.id === rid && r.periodId === periodId);
  if (!rule) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((d) => {
    d.recurring = d.recurring.filter((r) => !(r.id === rid && r.periodId === periodId));
  });
  bumpLedger(periodId, actor, `حذف هزینه تکراری «${rule.title}»`, rid);
  writeAudit(actor, 'recurring_delete', 'recurring', rid, `حذف تکراری در دوره ${periodId}`);
  return c.json({ ok: true });
});

adminApp.post('/periods/:id/recurring/:rid/run', (c) => {
  const actor = actorFrom(c)!;
  const periodId = c.req.param('id');
  const rid = c.req.param('rid');
  const rule = getDb().recurring.find((r) => r.id === rid && r.periodId === periodId);
  if (!rule) return c.json({ error: 'پیدا نشد' }, 404);
  let expenseId = '';
  mutate((d) => {
    const row = d.recurring.find((r) => r.id === rid && r.periodId === periodId);
    if (!row) return;
    expenseId = nanoid();
    d.expenses.push({
      id: expenseId,
      periodId,
      title: row.title,
      amount: row.amount,
      currency: row.currency,
      payerId: row.payerId,
      splitMode: row.splitMode,
      shares: row.shares,
      tax: { type: 'none', value: 0 },
      service: { type: 'none', value: 0 },
      tip: { type: 'none', value: 0 },
      tags: ['تکراری'],
      fxRate: 1,
      createdAt: new Date().toISOString(),
      occurredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    });
    row.nextAt = nextRecurringAt(new Date().toISOString(), row.cadence || 'days', row.intervalDays);
    bumpPeriodVersion(d, periodId);
  });
  pushActivity(periodId, actor, 'admin_update', `اجرای هزینه تکراری «${rule.title}»`, expenseId);
  notifyPeriod(periodId, actor.id, 'به‌روزرسانی دوره', `اجرای هزینه تکراری «${rule.title}»`);
  writeAudit(actor, 'recurring_run', 'recurring', rid, `اجرای تکراری در دوره ${periodId}`);
  return c.json({ ok: true, expenseId });
});

adminApp.delete('/periods/:id/invites/:token', (c) => {
  const actor = actorFrom(c)!;
  const periodId = c.req.param('id');
  const token = decodeURIComponent(c.req.param('token'));
  const invite = getDb().invites.find((i) => i.token === token && i.periodId === periodId);
  if (!invite) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((d) => {
    d.invites = d.invites.filter((i) => !(i.token === token && i.periodId === periodId));
  });
  bumpLedger(periodId, actor, 'ابطال دعوت', token);
  writeAudit(actor, 'invite_revoke', 'invite', token, `ابطال دعوت دوره ${periodId}`);
  return c.json({ ok: true });
});

adminApp.delete('/periods/:id/attachments/:aid', (c) => {
  const actor = actorFrom(c)!;
  const periodId = c.req.param('id');
  const aid = c.req.param('aid');
  const att = getDb().attachments.find((a) => a.id === aid && a.periodId === periodId);
  if (!att) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((d) => {
    d.attachments = d.attachments.filter((a) => !(a.id === aid && a.periodId === periodId));
    for (const e of d.expenses.filter((x) => x.periodId === periodId && x.attachmentId === aid)) {
      e.attachmentId = undefined;
      e.attachmentDataUrl = undefined;
      e.updatedAt = new Date().toISOString();
      e.version = (e.version || 0) + 1;
    }
  });
  bumpLedger(periodId, actor, 'حذف پیوست', aid);
  writeAudit(actor, 'attachment_delete', 'attachment', aid, `حذف پیوست دوره ${periodId}`);
  return c.json({ ok: true });
});

adminApp.delete('/periods/:id/expenses/:expenseId/attachment', (c) => {
  const actor = actorFrom(c)!;
  const periodId = c.req.param('id');
  const expenseId = c.req.param('expenseId');
  const expense = getDb().expenses.find((e) => e.id === expenseId && e.periodId === periodId);
  if (!expense) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((d) => {
    const row = d.expenses.find((e) => e.id === expenseId && e.periodId === periodId);
    if (!row) return;
    if (row.attachmentId) {
      d.attachments = d.attachments.filter((a) => a.id !== row.attachmentId);
    }
    row.attachmentId = undefined;
    row.attachmentDataUrl = undefined;
    row.updatedAt = new Date().toISOString();
    row.version = (row.version || 0) + 1;
  });
  bumpLedger(periodId, actor, `حذف رسید «${expense.title}»`, expenseId);
  writeAudit(actor, 'expense_attachment_delete', 'expense', expenseId, `حذف رسید هزینه در دوره ${periodId}`);
  return c.json({ ok: true });
});

adminApp.get('/billing/zarinpal-pending', (c) => {
  const { offset, limit } = parsePage(c);
  const rows = [...(getDb().zarinpalPending || [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return c.json(paginate(rows, offset, limit));
});

adminApp.get('/billing/events', (c) => {
  const { offset, limit, q } = parsePage(c);
  const rows = [...(getDb().billingEvents || [])]
    .filter((e) => {
      if (!q) return true;
      const user = getDb().users.find((u) => u.id === e.userId);
      return `${e.id} ${e.userId} ${e.source} ${e.sku || ''} ${user?.displayName || ''} ${user?.phone || ''}`
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return c.json(paginate(rows, offset, limit));
});

adminApp.delete('/billing/zarinpal-pending/:authority', (c) => {
  const actor = actorFrom(c)!;
  const authority = decodeURIComponent(c.req.param('authority'));
  const exists = (getDb().zarinpalPending || []).some((p) => p.authority === authority);
  if (!exists) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((d) => {
    d.zarinpalPending = (d.zarinpalPending || []).filter((p) => p.authority !== authority);
  });
  writeAudit(actor, 'zarinpal_pending_delete', 'billing', authority, 'حذف پرداخت معلق زرین‌پال');
  return c.json({ ok: true });
});

adminApp.get('/billing/sheba-lookups', (c) => {
  const { offset, limit } = parsePage(c);
  const rows = (getDb().shebaLookups || []).map((s) => ({
    identity: s.identity,
    day: s.day,
    count: s.count,
  }));
  return c.json(paginate(rows, offset, limit));
});

adminApp.get('/telegram-links', (c) => {
  const { offset, limit, q } = parsePage(c);
  const db = getDb();
  const rows = (db.telegramLinks || [])
    .filter((l) => {
      if (!q) return true;
      return `${l.chatId} ${l.periodId} ${l.payerMemberId || ''}`.toLowerCase().includes(q);
    })
    .map((l) => ({
      ...l,
      periodTitle: db.periods.find((p) => p.id === l.periodId)?.title,
    }));
  return c.json(paginate(rows, offset, limit));
});

adminApp.delete('/telegram-links/:chatId', (c) => {
  const actor = actorFrom(c)!;
  const chatId = decodeURIComponent(c.req.param('chatId'));
  const exists = (getDb().telegramLinks || []).some((l) => l.chatId === chatId);
  if (!exists) return c.json({ error: 'پیدا نشد' }, 404);
  mutate((d) => {
    d.telegramLinks = (d.telegramLinks || []).filter((l) => l.chatId !== chatId);
  });
  writeAudit(actor, 'telegram_unlink', 'telegram', chatId, 'قطع اتصال تلگرام');
  return c.json({ ok: true });
});

adminApp.get('/audit', (c) => {
  const { offset, limit, q } = parsePage(c);
  const rows = (getDb().adminAudit || []).filter((a) => {
    if (!q) return true;
    return `${a.action} ${a.targetType} ${a.targetId} ${a.summary} ${a.actorPhone || ''}`.toLowerCase().includes(q);
  });
  return c.json(paginate(rows, offset, limit));
});

adminApp.post('/notifications', async (c) => {
  const actor = actorFrom(c)!;
  const body = await readBody(c, {
    userId: undefined as string | undefined,
    all: false,
    title: '',
    body: '',
  });
  const title = (body.title || '').trim();
  const text = (body.body || '').trim();
  if (!title || !text) return c.json({ error: 'عنوان و متن لازم است' }, 400);
  const db = getDb();
  const targets = body.all
    ? db.users.filter((u) => !u.deletedAt).map((u) => u.id)
    : body.userId
      ? db.users.some((u) => u.id === body.userId && !u.deletedAt)
        ? [body.userId]
        : []
      : [];
  if (!targets.length) return c.json({ error: 'گیرنده پیدا نشد' }, 404);
  const createdAt = new Date().toISOString();
  mutate((d) => {
    for (const userId of targets) {
      d.notifications.push({
        id: nanoid(),
        userId,
        title,
        body: text,
        read: false,
        createdAt,
      });
    }
  });
  writeAudit(
    actor,
    body.all ? 'notif_broadcast' : 'notif_send',
    'notification',
    body.all ? 'all' : targets[0],
    body.all ? `نوتیف همگانی به ${targets.length} کاربر` : `نوتیف به کاربر ${targets[0]}`,
  );
  return c.json({ ok: true, sent: targets.length });
});

adminApp.get('/settings', async (c) => {
  const db = getDb();
  const now = Date.now();
  return c.json({
    envAdminPhones: adminPhones(),
    extraAdminPhones: extraAdminPhones(),
    senator: await fetchSenatorAmount(),
    fx: db.fxCache || null,
    sessions: db.sessions.length,
    otpsActive: db.otps.filter((o) => o.expiresAt > now).length,
  });
});

adminApp.patch('/settings', async (c) => {
  const actor = actorFrom(c)!;
  const body = await readBody(c, { extraAdminPhones: undefined as string[] | undefined });
  if (!Array.isArray(body.extraAdminPhones)) return c.json({ error: 'شماره‌ها لازم است' }, 400);
  const phones = [
    ...new Set(
      body.extraAdminPhones
        .map((p) => normalizeIranMobile(String(p)))
        .filter((p): p is string => Boolean(p)),
    ),
  ];
  mutate((d) => {
    if (!d.platformSettings) d.platformSettings = {};
    d.platformSettings.extraAdminPhones = phones;
  });
  writeAudit(actor, 'settings_admin_phones', 'settings', 'platform', `${phones.length} شماره ادمین اضافه`);
  return c.json({ extraAdminPhones: extraAdminPhones() });
});

adminApp.post('/fx/refresh', async (c) => {
  const actor = actorFrom(c)!;
  const fx = await getFxRates({ force: true });
  writeAudit(actor, 'fx_refresh', 'fx', 'cache', `نوسازی نرخ ارز (${fx.source})`);
  return c.json(fx);
});

adminApp.get('/export', (c) => {
  const actor = actorFrom(c)!;
  const db = getDb();
  const dump = {
    ...db,
    users: db.users.map((u) => {
      const { passwordHash: _pw, payoutMethods: _cards, ...rest } = u;
      return rest;
    }),
    otps: db.otps.map((o) => ({ phone: o.phone, expiresAt: o.expiresAt })),
  };
  writeAudit(actor, 'export', 'store', 'json', 'خروجی پشتیبان JSON');
  c.header('Content-Disposition', 'attachment; filename="dongham-export.json"');
  return c.json(dump);
});
