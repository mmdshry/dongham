import type { Context, Next } from 'hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { nanoid } from 'nanoid';
import {
  inferCadence,
  isPeriodId,
  migratePeriodIds,
  newPeriodId,
  nextRecurringAt,
  normalizeEmail,
  normalizeIranMobile,
  normalizeOtpCode,
  syncedMemberRole,
} from '@dongham/ledger';
import { canAccessPeriod, periodRole } from './access.js';
import { adminApp, consumeImpersonation } from './admin.js';
import { applyUserProfilePatch, authSession, cloudProfile, persistPremiumExpiry, publicUser } from './profile.js';
import {
  claimListedMemberships,
  createUser,
  findUserByEmail,
  findUserByPhone,
  hashPassword,
  isOtpMock,
  isUserBanned,
  issueToken,
  loginWithGoogle,
  sendOtp,
  verifyOtp,
  verifyPassword,
  verifyToken,
  revokeSession,
} from './auth.js';
import { premiumUntilFromNow, recordBillingEvent, verifyBazaarPurchase, verifyMyketPurchase } from './billing.js';
import { lookupCardSheba, lookupIdentity, quotaFor } from './drapi.js';
import { getFxRates } from './fx.js';
import { handleTelegramUpdate, telegramSend } from './telegram.js';
import type { ExpenseRecord, MemberRecord, MemberRole, PaymentRecord, PeriodKind, PeriodRecord, PeriodTemplate, RecurringCadence, RoundTo } from './types.js';
import { zarinpalRequest, zarinpalVerify } from './zarinpal.js';
import { appPublicUrl, inviteExpiresAt, isInviteExpired } from './publicUrl.js';
import {
  bumpPeriodVersion,
  deleteFriend,
  deleteSessionsForUser,
  getAttachment,
  getExpense,
  getInvite,
  getMember,
  getPayment,
  getPeriod,
  getUserById,
  hasPendingPayment,
  insertActivity,
  insertAttachment,
  insertChat,
  insertInvite,
  insertPeriod,
  listChat,
  listDueRecurring,
  listFriends,
  listMembers,
  listNotifications,
  listPeriodIds,
  listPeriodsForUser,
  loadPeriodSnapshot,
  markNotificationRead,
  notifyPeriodMembers,
  updatePeriod,
  updateUser,
  upsertExpense,
  upsertFriend,
  upsertMember,
  upsertPayment,
  upsertRecurring,
} from './repo.js';

type Variables = {
  userId?: string;
  deviceId?: string;
  role?: 'admin' | 'user';
  impersonatedBy?: string;
};

export const app = new Hono<{ Variables: Variables }>();

const defaultCorsOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'https://app.dongham.ir',
  'https://admin.dongham.ir',
  'https://dongham.ir',
  'https://www.dongham.ir',
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

app.use(
  '*',
  cors({
    origin: (origin) => {
      const allowed = [
        ...defaultCorsOrigins,
        ...(process.env.CORS_ORIGIN || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ];
      if (!origin) return allowed[0];
      if (allowed.includes(origin)) return origin;
      return '';
    },
    allowHeaders: ['Content-Type', 'Authorization', 'X-Device-Id'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

app.get('/health', (c) => c.json({ ok: true, service: 'dongham-api' }));

async function authMiddleware(c: Context<{ Variables: Variables }>, next: Next) {
  const header = c.req.header('Authorization');
  if (header?.startsWith('Bearer ')) {
    const payload = await verifyToken(header.slice(7));
    if (payload) {
      c.set('userId', payload.userId);
      c.set('deviceId', payload.deviceId);
      c.set('role', payload.role);
      c.set('impersonatedBy', payload.impersonatedBy);
    }
  }
  await next();
}

app.use('*', authMiddleware);

function requireUser(c: Context<{ Variables: Variables }>): string | null {
  return c.get('userId') ?? null;
}

function periodAccessDenied(c: Context<{ Variables: Variables }>, userId: string | null) {
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  return c.json({ error: 'اجازه ندارید' }, 403);
}

async function requireWrite(c: Context<{ Variables: Variables }>, periodId: string) {
  const userId = requireUser(c);
  if (!userId) return { error: c.json({ error: 'وارد نشده‌اید' }, 401) };
  if (!(await canAccessPeriod(userId, periodId, 'write'))) {
    return { error: c.json({ error: 'اجازه ندارید' }, 403) };
  }
  const role = await periodRole(userId, periodId);
  if (!role || role === 'viewer') return { error: c.json({ error: 'نقش بیننده اجازهٔ تغییر ندارد' }, 403) };
  return { userId, role };
}

function snapshotJson(snap: NonNullable<Awaited<ReturnType<typeof loadPeriodSnapshot>>>) {
  return {
    period: snap.period,
    members: snap.members,
    expenses: snap.expenses,
    payments: snap.payments,
    chat: snap.chat,
    invites: snap.invites,
    recurring: snap.recurring,
    activity: snap.activity,
    version: snap.version,
  };
}

app.route('/admin', adminApp);

async function handleImpersonateConsume(c: Context<{ Variables: Variables }>, code: string | undefined, deviceId: string) {
  if (!code) return c.json({ error: 'کد نامعتبر است' }, 400);
  const result = await consumeImpersonation(code, deviceId);
  if ('error' in result) return c.json({ error: result.error }, result.status);
  return c.json(await authSession(result.token, result.user));
}

app.post('/auth/impersonate/consume', async (c) => {
  let code: string | undefined;
  let deviceId: string | undefined;
  try {
    const body = await c.req.json<{ code?: string; deviceId?: string }>();
    code = body.code;
    deviceId = body.deviceId;
  } catch {
    code = undefined;
  }
  return handleImpersonateConsume(c, code, deviceId || c.req.header('X-Device-Id') || nanoid());
});

app.get('/auth/impersonate/consume', async (c) => {
  return handleImpersonateConsume(c, c.req.query('code'), c.req.header('X-Device-Id') || nanoid());
});

app.post('/auth/otp/request', async (c) => {
  const { phone } = await c.req.json<{ phone: string }>();
  const local = normalizeIranMobile(phone);
  if (!local) return c.json({ error: 'شماره موبایل نامعتبر است' }, 400);
  try {
    const code = await sendOtp(local);
    const body: Record<string, unknown> = { ok: true };
    if (isOtpMock()) body.devCode = code;
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ارسال پیامک ناموفق بود' }, 502);
  }
});

app.post('/auth/otp/verify', async (c) => {
  const { phone, code, displayName, deviceId } = await c.req.json<{
    phone: string;
    code: string;
    displayName?: string;
    deviceId: string;
  }>();
  const local = normalizeIranMobile(phone);
  const otp = normalizeOtpCode(code);
  if (!local || !otp || !(await verifyOtp(local, otp))) return c.json({ error: 'کد نامعتبر است' }, 400);
  let user = await findUserByPhone(local);
  if (!user) {
    user = await createUser({ phone: local, displayName: displayName || `کاربر ${local.slice(-4)}` });
  }
  if (isUserBanned(user)) return c.json({ error: 'این حساب مسدود است' }, 403);
  await claimListedMemberships(user);
  const token = await issueToken(user.id, deviceId || nanoid());
  return c.json(await authSession(token, user));
});

app.post('/auth/register', async (c) => {
  const { email, password, displayName, deviceId } = await c.req.json<{
    email: string;
    password: string;
    displayName: string;
    deviceId: string;
  }>();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password || password.length < 6) {
    return c.json({ error: 'ایمیل یا رمز نامعتبر است' }, 400);
  }
  if (await findUserByEmail(normalizedEmail)) return c.json({ error: 'این ایمیل قبلاً ثبت شده' }, 409);
  const user = await createUser({
    email: normalizedEmail,
    displayName: displayName || normalizedEmail.split('@')[0],
    passwordHash: await hashPassword(password),
  });
  await claimListedMemberships(user);
  const token = await issueToken(user.id, deviceId || nanoid());
  return c.json(await authSession(token, user));
});

app.post('/auth/login', async (c) => {
  const { email, password, deviceId } = await c.req.json<{
    email: string;
    password: string;
    deviceId: string;
  }>();
  const user = await findUserByEmail(email);
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: 'ایمیل یا رمز اشتباه است' }, 401);
  }
  if (isUserBanned(user)) return c.json({ error: 'این حساب مسدود است' }, 403);
  await claimListedMemberships(user);
  const token = await issueToken(user.id, deviceId || nanoid());
  return c.json(await authSession(token, user));
});

app.post('/auth/google', async (c) => {
  const { idToken, deviceId } = await c.req.json<{ idToken?: string; deviceId?: string }>();
  if (!idToken) return c.json({ error: 'توکن گوگل لازم است' }, 400);
  if (!process.env.GOOGLE_CLIENT_ID) {
    return c.json({ error: 'ورود گوگل پیکربندی نشده' }, 503);
  }
  try {
    const result = await loginWithGoogle(idToken, deviceId || nanoid());
    await claimListedMemberships(result.user);
    return c.json(await authSession(result.token, result.user));
  } catch (e) {
    if (e instanceof Error && e.message === 'این حساب مسدود است') {
      return c.json({ error: e.message }, 403);
    }
    return c.json({ error: 'ورود گوگل نامعتبر است' }, 401);
  }
});

app.get('/auth/me', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const user = await getUserById(userId);
  if (!user || user.deletedAt) return c.json({ error: 'پیدا نشد' }, 404);
  await persistPremiumExpiry(user);
  return c.json({ user: publicUser(user), profile: cloudProfile(user) });
});

app.post('/auth/logout', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const header = c.req.header('Authorization');
  if (header?.startsWith('Bearer ')) await revokeSession(header.slice(7));
  return c.json({ ok: true });
});

app.put('/auth/me', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  let body: {
    displayName?: string;
    usePersianDigits?: boolean;
    debtReminders?: boolean;
    calendarMode?: 'jalali' | 'gregorian';
    fxWatchlist?: string[];
    payoutMethods?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'بدنه نامعتبر است' }, 400);
  }
  const next = await applyUserProfilePatch(userId, {
    displayName: body.displayName,
    usePersianDigits: body.usePersianDigits,
    debtReminders: body.debtReminders,
    calendarMode: body.calendarMode,
    fxWatchlist: body.fxWatchlist,
    payoutMethods: Array.isArray(body.payoutMethods) ? body.payoutMethods : undefined,
  });
  if (!next) return c.json({ error: 'پیدا نشد' }, 404);
  return c.json({ user: publicUser(next), profile: cloudProfile(next) });
});

app.post('/auth/delete-account', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const u = await getUserById(userId);
  if (u) {
    u.deletedAt = new Date().toISOString();
    u.phone = undefined;
    u.email = undefined;
    u.googleId = undefined;
    u.passwordHash = undefined;
    u.displayName = 'حساب حذف‌شده';
    u.payoutMethods = undefined;
    u.fxWatchlist = undefined;
    u.prefsUpdatedAt = undefined;
    await updateUser(u);
  }
  await deleteSessionsForUser(userId);
  return c.json({ ok: true });
});

app.get('/periods', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const user = await getUserById(userId);
  const periods = await listPeriodsForUser(userId, user?.phone, user?.email);
  return c.json({
    periods: periods.map((p) => ({
      id: p.id,
      title: p.title,
      currency: p.currency,
      version: p.version,
      updatedAt: p.updatedAt,
      visibility: p.visibility || 'private',
    })),
  });
});

app.post('/periods', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const body = await c.req.json<{
    id?: string;
    title: string;
    currency?: string;
    members?: {
      id: string;
      displayName: string;
      guestKey?: string;
      phone?: string;
      email?: string;
      userId?: string;
      role?: MemberRole;
      isPot?: boolean;
      weightDefault?: number;
    }[];
    kind?: PeriodKind;
    template?: PeriodTemplate;
    roundTo?: RoundTo;
    bankerMemberId?: string;
    buildingCharge?: number;
    lunchTurnMemberId?: string;
    encrypted?: boolean;
    visibility?: 'private' | 'public';
  }>();
  const taken = await listPeriodIds();
  let id = body.id;
  if (id && !isPeriodId(id)) {
    const mapped = await migratePeriodIds([...taken, id]);
    id = mapped.get(id) || newPeriodId(taken);
  }
  if (!id) id = newPeriodId(taken);
  const now = new Date().toISOString();
  const existing = await getPeriod(id);
  if (existing) {
    if (existing.ownerId !== userId) return c.json({ error: 'اجازه ندارید' }, 403);
    if (body.title) existing.title = body.title;
    if (body.currency) existing.currency = body.currency;
    if (body.kind) existing.kind = body.kind;
    if (body.template) existing.template = body.template;
    if (body.roundTo !== undefined) existing.roundTo = body.roundTo;
    if (body.bankerMemberId) existing.bankerMemberId = body.bankerMemberId;
    if (body.buildingCharge !== undefined) existing.buildingCharge = body.buildingCharge;
    if (body.lunchTurnMemberId) existing.lunchTurnMemberId = body.lunchTurnMemberId;
    if (body.encrypted !== undefined) existing.encrypted = body.encrypted;
    if (body.visibility === 'public' || body.visibility === 'private') existing.visibility = body.visibility;
    existing.updatedAt = now;
    await updatePeriod(existing);
    if (body.members?.length) {
      for (const m of body.members) {
        if (!m.id || !m.displayName) continue;
        await upsertMember({
          id: m.id,
          periodId: id,
          guestKey: m.guestKey,
          userId: m.userId,
          displayName: m.displayName,
          weightDefault: m.weightDefault ?? 1,
          role: syncedMemberRole(m.role, m.userId, userId),
          phone: normalizeIranMobile(m.phone) || m.phone,
          email: normalizeEmail(m.email) || m.email,
          isPot: m.isPot,
          excludeFromNew: m.excludeFromNew,
          cardNumber: m.cardNumber,
          sheba: m.sheba,
          cardHolderName: m.cardHolderName,
          bankName: m.bankName,
          unitLabel: m.unitLabel,
        });
      }
    }
    await bumpPeriodVersion(id);
    return c.json({ period: await getPeriod(id) });
  }
  const period: PeriodRecord = {
    id,
    title: body.title,
    currency: body.currency || 'IRT',
    ownerId: userId,
    createdAt: now,
    updatedAt: now,
    version: 1,
    kind: body.kind || 'split',
    template: body.template || 'custom',
    roundTo: body.roundTo ?? 0,
    bankerMemberId: body.bankerMemberId,
    buildingCharge: body.buildingCharge,
    lunchTurnMemberId: body.lunchTurnMemberId,
    encrypted: body.encrypted,
    visibility: body.visibility === 'public' ? 'public' : 'private',
  };
  await insertPeriod(period);
  if (body.members?.length) {
    let ownerAssigned = false;
    for (const m of body.members) {
      let memberUserId = m.userId;
      if (!memberUserId && m.role === 'owner' && !ownerAssigned) {
        memberUserId = userId;
        ownerAssigned = true;
      } else if (memberUserId === userId) {
        ownerAssigned = true;
      }
      await upsertMember({
        id: m.id || nanoid(),
        periodId: id,
        guestKey: m.guestKey,
        userId: memberUserId,
        displayName: m.displayName,
        weightDefault: m.weightDefault ?? 1,
        role: syncedMemberRole(m.role, memberUserId, userId),
        phone: normalizeIranMobile(m.phone) || m.phone,
        email: normalizeEmail(m.email) || m.email,
        isPot: m.isPot,
      });
    }
  } else {
    const user = await getUserById(userId);
    await upsertMember({
      id: `own-${id}`,
      periodId: id,
      userId,
      displayName: user?.displayName || 'من',
      weightDefault: 1,
      role: 'owner',
    });
  }
  return c.json({ period: await getPeriod(id) });
});

app.get('/periods/:id/snapshot', async (c) => {
  const userId = requireUser(c);
  const periodId = c.req.param('id');
  const period = await getPeriod(periodId);
  if (!period || !(await canAccessPeriod(userId, periodId, 'read'))) return c.json({ error: 'پیدا نشد' }, 404);
  const snap = await loadPeriodSnapshot(periodId);
  return c.json(snap ? snapshotJson(snap) : { error: 'پیدا نشد' });
});

app.post('/periods/:id/sync', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const periodId = c.req.param('id');
  const body = await c.req.json<{
    deviceId?: string;
    baseVersion?: number;
    ops?: unknown[];
  }>().catch(() => ({ ops: [] as unknown[] }));

  const period = await getPeriod(periodId);
  if (!period || !(await canAccessPeriod(userId, periodId, 'read'))) return c.json({ error: 'پیدا نشد' }, 404);

  if ((body.ops || []).length) {
    return c.json({ error: 'از مسیر REST استفاده کنید', code: 'use_rest' }, 410);
  }

  const snap = await loadPeriodSnapshot(periodId);
  if (!snap) return c.json({ error: 'پیدا نشد' }, 404);
  return c.json({
    version: snap.version,
    expenses: snap.expenses,
    payments: snap.payments,
    members: snap.members,
    chat: snap.chat,
    activity: snap.activity,
    recurring: snap.recurring,
    period: snap.period,
    invites: snap.invites,
  });
});

async function writeExpenseFromBody(periodId: string, body: Partial<ExpenseRecord> & { id?: string }) {
  const prev = body.id ? await getExpense(body.id) : undefined;
  const now = new Date().toISOString();
  const expense: ExpenseRecord = {
    id: body.id || nanoid(),
    periodId,
    title: body.title || prev?.title || 'هزینه',
    amount: body.amount ?? prev?.amount ?? 0,
    currency: body.currency || prev?.currency || 'IRT',
    payerId: body.payerId || prev?.payerId || '',
    payers: body.payers || prev?.payers,
    splitMode: body.splitMode || prev?.splitMode || 'equal',
    shares: body.shares || prev?.shares || [],
    tax: body.tax || prev?.tax || { type: 'none', value: 0 },
    service: body.service || prev?.service || { type: 'none', value: 0 },
    tip: body.tip || prev?.tip || { type: 'none', value: 0 },
    tags: body.tags || prev?.tags || [],
    note: body.note !== undefined ? body.note : prev?.note,
    attachmentId: body.attachmentId !== undefined ? body.attachmentId : prev?.attachmentId,
    attachmentDataUrl: body.attachmentDataUrl !== undefined ? body.attachmentDataUrl : prev?.attachmentDataUrl,
    fxRate: body.fxRate ?? prev?.fxRate ?? 1,
    createdAt: prev?.createdAt || body.createdAt || now,
    occurredAt: body.occurredAt || prev?.occurredAt || now,
    updatedAt: now,
    deletedAt: body.deletedAt || prev?.deletedAt,
    clientId: body.clientId || prev?.clientId,
    version: (prev?.version || body.version || 0) + 1,
  };
  await upsertExpense(expense);
  return expense;
}

app.post('/periods/:id/expenses', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const body = await c.req.json<Partial<ExpenseRecord>>();
  const expense = await writeExpenseFromBody(periodId, body);
  await insertActivity({
    id: nanoid(),
    periodId,
    actorName: (await getUserById(gate.userId))?.displayName || 'کاربر',
    action: 'expense.upsert',
    summary: `ثبت هزینه «${expense.title}»`,
    createdAt: expense.updatedAt,
    entityId: expense.id,
  });
  const period = await getPeriod(periodId);
  return c.json({ expense, version: period?.version ?? 0 });
});

app.patch('/periods/:id/expenses/:expenseId', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const prev = await getExpense(c.req.param('expenseId'));
  if (!prev || prev.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  const body = await c.req.json<Partial<ExpenseRecord>>();
  const expense = await writeExpenseFromBody(periodId, { ...prev, ...body, id: prev.id });
  const period = await getPeriod(periodId);
  return c.json({ expense, version: period?.version ?? 0 });
});

app.delete('/periods/:id/expenses/:expenseId', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const prev = await getExpense(c.req.param('expenseId'));
  if (!prev || prev.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  const now = new Date().toISOString();
  prev.deletedAt = now;
  prev.updatedAt = now;
  prev.version = (prev.version || 0) + 1;
  await upsertExpense(prev);
  const period = await getPeriod(periodId);
  return c.json({ ok: true, expense: prev, version: period?.version ?? 0 });
});

async function writePaymentFromBody(periodId: string, body: Partial<PaymentRecord> & { id?: string }) {
  const prev = body.id ? await getPayment(body.id) : undefined;
  if ((body.status || prev?.status) === 'pending_confirm') {
    const from = body.fromMemberId || prev?.fromMemberId;
    const to = body.toMemberId || prev?.toMemberId;
    if (from && to && (await hasPendingPayment(periodId, from, to, body.id || prev?.id))) {
      return { duplicate: true as const };
    }
  }
  const now = new Date().toISOString();
  const payment: PaymentRecord = {
    id: body.id || nanoid(),
    periodId,
    fromMemberId: body.fromMemberId || prev?.fromMemberId || '',
    toMemberId: body.toMemberId || prev?.toMemberId || '',
    amount: body.amount ?? prev?.amount ?? 0,
    currency: body.currency || prev?.currency || 'IRT',
    kind: body.kind || prev?.kind || 'settlement',
    note: body.note !== undefined ? body.note : prev?.note,
    fxRate: body.fxRate ?? prev?.fxRate ?? 1,
    createdAt: prev?.createdAt || body.createdAt || now,
    updatedAt: now,
    deletedAt: body.deletedAt || prev?.deletedAt,
    version: (prev?.version || body.version || 0) + 1,
    status: body.status || prev?.status || 'settled',
    receiptDataUrl: body.receiptDataUrl !== undefined ? body.receiptDataUrl : prev?.receiptDataUrl,
    indexAsset: body.indexAsset || prev?.indexAsset,
    indexRateAtCreate: body.indexRateAtCreate ?? prev?.indexRateAtCreate,
  };
  await upsertPayment(payment);
  return { payment };
}

app.post('/periods/:id/payments', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const body = await c.req.json<Partial<PaymentRecord>>();
  const result = await writePaymentFromBody(periodId, body);
  if ('duplicate' in result) return c.json({ error: 'پرداخت در انتظار تأیید از قبل وجود دارد' }, 409);
  await insertActivity({
    id: nanoid(),
    periodId,
    actorName: (await getUserById(gate.userId))?.displayName || 'کاربر',
    action: 'payment.upsert',
    summary: result.payment.kind === 'loan' ? 'ثبت قرض' : 'ثبت تسویه',
    createdAt: result.payment.updatedAt,
    entityId: result.payment.id,
  });
  const period = await getPeriod(periodId);
  return c.json({ ...result, version: period?.version ?? 0 });
});

app.patch('/periods/:id/payments/:paymentId', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const prev = await getPayment(c.req.param('paymentId'));
  if (!prev || prev.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  const body = await c.req.json<Partial<PaymentRecord>>();
  const result = await writePaymentFromBody(periodId, { ...prev, ...body, id: prev.id });
  if ('duplicate' in result) return c.json({ error: 'پرداخت در انتظار تأیید از قبل وجود دارد' }, 409);
  const period = await getPeriod(periodId);
  return c.json({ ...result, version: period?.version ?? 0 });
});

app.delete('/periods/:id/payments/:paymentId', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const prev = await getPayment(c.req.param('paymentId'));
  if (!prev || prev.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  const now = new Date().toISOString();
  prev.deletedAt = now;
  prev.updatedAt = now;
  prev.version = (prev.version || 0) + 1;
  await upsertPayment(prev);
  const period = await getPeriod(periodId);
  return c.json({ ok: true, payment: prev, version: period?.version ?? 0 });
});

app.post('/periods/:id/members', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const period = await getPeriod(periodId);
  if (!period) return c.json({ error: 'پیدا نشد' }, 404);
  const body = await c.req.json<Partial<MemberRecord>>();
  const member: MemberRecord = {
    id: body.id || nanoid(),
    periodId,
    displayName: body.displayName || 'عضو',
    guestKey: body.guestKey,
    userId: body.userId,
    weightDefault: body.weightDefault ?? 1,
    role: syncedMemberRole(body.role, body.userId, period.ownerId),
    phone: normalizeIranMobile(body.phone) || body.phone,
    email: normalizeEmail(body.email) || body.email,
    excludeFromNew: body.excludeFromNew,
    isPot: body.isPot,
    cardNumber: body.cardNumber,
    sheba: body.sheba,
    cardHolderName: body.cardHolderName,
    bankName: body.bankName,
    unitLabel: body.unitLabel,
  };
  await upsertMember(member);
  const version = await bumpPeriodVersion(periodId);
  return c.json({ member, version });
});

app.patch('/periods/:id/members/:memberId', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const period = await getPeriod(periodId);
  const existing = await getMember(c.req.param('memberId'));
  if (!period || !existing || existing.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  const body = await c.req.json<Partial<MemberRecord>>();
  if (body.displayName) existing.displayName = body.displayName;
  if (body.userId) existing.userId = body.userId;
  if (body.phone !== undefined) existing.phone = normalizeIranMobile(body.phone) || body.phone;
  if (body.email !== undefined) existing.email = normalizeEmail(body.email) || body.email;
  if (body.role) existing.role = syncedMemberRole(body.role, existing.userId, period.ownerId);
  if (body.excludeFromNew !== undefined) existing.excludeFromNew = body.excludeFromNew;
  if (body.isPot !== undefined) existing.isPot = body.isPot;
  if (body.cardNumber !== undefined) existing.cardNumber = body.cardNumber;
  if (body.sheba !== undefined) existing.sheba = body.sheba;
  if (body.cardHolderName !== undefined) existing.cardHolderName = body.cardHolderName;
  if (body.bankName !== undefined) existing.bankName = body.bankName;
  if (body.unitLabel !== undefined) existing.unitLabel = body.unitLabel;
  if (body.weightDefault !== undefined) existing.weightDefault = body.weightDefault;
  await upsertMember(existing);
  const version = await bumpPeriodVersion(periodId);
  return c.json({ member: existing, version });
});

app.post('/periods/:id/invites', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const periodId = c.req.param('id');
  if (!(await canAccessPeriod(userId, periodId, 'write')) || (await periodRole(userId, periodId)) === 'viewer') {
    return c.json({ error: 'اجازه ندارید' }, 403);
  }
  const token = nanoid(12);
  const expiresAt = inviteExpiresAt();
  await insertInvite({
    token,
    periodId,
    createdBy: userId,
    createdAt: new Date().toISOString(),
    expiresAt,
  });
  return c.json({ token, url: `/i/${token}`, expiresAt });
});

app.get('/invites/:token', async (c) => {
  const token = c.req.param('token');
  const invite = await getInvite(token);
  if (!invite || isInviteExpired(invite)) return c.json({ error: 'پیدا نشد' }, 404);
  const period = await getPeriod(invite.periodId);
  const members = await listMembers(invite.periodId);
  return c.json({ invite, period, members });
});

app.post('/invites/:token/join', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const token = c.req.param('token');
  const { displayName, guestKey } = await c.req.json<{
    displayName: string;
    guestKey?: string;
  }>();
  const invite = await getInvite(token);
  if (!invite || isInviteExpired(invite)) return c.json({ error: 'پیدا نشد' }, 404);
  const user = await getUserById(userId);
  if (!user || user.deletedAt) return c.json({ error: 'پیدا نشد' }, 404);
  const phone = normalizeIranMobile(user.phone);
  const email = normalizeEmail(user.email);
  const members = await listMembers(invite.periodId);
  const existing = members.find((m) => {
    if (m.userId === userId || (guestKey && m.guestKey === guestKey)) return true;
    if (phone && normalizeIranMobile(m.phone) === phone) return true;
    if (email && normalizeEmail(m.email) === email) return true;
    return false;
  });
  if (existing) {
    existing.userId = userId;
    if (guestKey) existing.guestKey = guestKey;
    await upsertMember(existing);
    const version = await bumpPeriodVersion(invite.periodId);
    return c.json({ memberId: existing.id, periodId: invite.periodId, version });
  }
  const memberId = nanoid();
  await upsertMember({
    id: memberId,
    periodId: invite.periodId,
    userId,
    guestKey,
    displayName: displayName || user.displayName || 'مهمان',
    weightDefault: 1,
    role: 'member',
    phone: phone || undefined,
    email: email || undefined,
  });
  const version = await bumpPeriodVersion(invite.periodId);
  return c.json({ memberId, periodId: invite.periodId, version });
});

async function friendContactTaken(
  userId: string,
  input: { phone?: string; email?: string },
  excludeId?: string,
): Promise<'phone' | 'email' | null> {
  const nPhone = normalizeIranMobile(input.phone);
  const nEmail = normalizeEmail(input.email);
  for (const f of await listFriends(userId)) {
    if (excludeId && f.id === excludeId) continue;
    if (nPhone && normalizeIranMobile(f.phone) === nPhone) return 'phone';
    if (nEmail && normalizeEmail(f.email) === nEmail) return 'email';
  }
  return null;
}

function friendTakenError(taken: 'phone' | 'email') {
  return taken === 'phone' ? 'این شماره قبلاً برای دوست دیگری ثبت شده' : 'این ایمیل قبلاً برای دوست دیگری ثبت شده';
}

app.get('/friends', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  return c.json({ friends: await listFriends(userId) });
});

app.post('/friends', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const { id, displayName, phone, email, friendUserId } = await c.req.json<{
    id?: string;
    displayName: string;
    phone?: string;
    email?: string;
    friendUserId?: string;
  }>();
  const friend = {
    id: id || nanoid(),
    userId,
    displayName,
    phone: normalizeIranMobile(phone) || phone,
    email: normalizeEmail(email) || email,
    friendUserId,
  };
  const taken = await friendContactTaken(userId, friend, friend.id);
  if (taken) return c.json({ error: friendTakenError(taken) }, 409);
  await upsertFriend(friend);
  return c.json({ friend });
});

app.put('/friends/:id', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const id = c.req.param('id');
  const { displayName, phone, email, friendUserId } = await c.req.json<{
    displayName: string;
    phone?: string;
    email?: string;
    friendUserId?: string;
  }>();
  const existing = (await listFriends(userId)).find((f) => f.id === id);
  if (!existing) return c.json({ error: 'پیدا نشد' }, 404);
  const taken = await friendContactTaken(userId, { phone, email }, id);
  if (taken) return c.json({ error: friendTakenError(taken) }, 409);
  const friend = {
    ...existing,
    displayName,
    phone: normalizeIranMobile(phone) || phone,
    email: normalizeEmail(email) || email,
    friendUserId: friendUserId !== undefined ? friendUserId : existing.friendUserId,
  };
  await upsertFriend(friend);
  return c.json({ friend });
});

app.delete('/friends/:id', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const id = c.req.param('id');
  const existing = (await listFriends(userId)).find((f) => f.id === id);
  if (!existing) return c.json({ error: 'پیدا نشد' }, 404);
  await deleteFriend(id, userId);
  return c.json({ ok: true });
});

app.post('/attachments', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const { periodId, mime, dataBase64 } = await c.req.json<{
    periodId: string;
    mime: string;
    dataBase64: string;
  }>();
  if (!(await canAccessPeriod(userId, periodId, 'write'))) return periodAccessDenied(c, userId);
  if (!dataBase64 || dataBase64.length > 2_500_000) {
    return c.json({ error: 'فایل نامعتبر یا خیلی بزرگ است' }, 400);
  }
  const id = nanoid();
  await insertAttachment({
    id,
    periodId,
    mime,
    dataBase64,
    createdAt: new Date().toISOString(),
  });
  const period = await getPeriod(periodId);
  return c.json({ id, version: period?.version ?? 0 });
});

app.get('/attachments/:id', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const row = await getAttachment(c.req.param('id'));
  if (!row) return c.json({ error: 'پیدا نشد' }, 404);
  if (!(await canAccessPeriod(userId, row.periodId))) return periodAccessDenied(c, userId);
  return c.json(row);
});

app.get('/notifications', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  return c.json({ notifications: await listNotifications(userId) });
});

app.post('/notifications/:id/read', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  await markNotificationRead(c.req.param('id'), userId);
  return c.json({ ok: true });
});

app.post('/periods/:id/recurring', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const periodId = c.req.param('id');
  if (!(await canAccessPeriod(userId, periodId, 'write')) || (await periodRole(userId, periodId)) === 'viewer') {
    return c.json({ error: 'اجازه ندارید' }, 403);
  }
  const body = await c.req.json<{
    id?: string;
    title: string;
    amount: number;
    currency: string;
    payerId: string;
    splitMode: ExpenseRecord['splitMode'];
    shares: ExpenseRecord['shares'];
    intervalDays: number;
    cadence?: RecurringCadence;
  }>();
  const id = body.id || nanoid();
  const cadence = body.cadence || inferCadence(body.intervalDays);
  const nextAt = nextRecurringAt(new Date().toISOString(), cadence, body.intervalDays);
  await upsertRecurring({
    id,
    periodId,
    ...body,
    cadence,
    nextAt,
    active: true,
  });
  const period = await getPeriod(periodId);
  return c.json({ id, nextAt, version: period?.version ?? 0 });
});

app.post('/periods/:id/recurring/run', async (c) => {
  const userId = requireUser(c);
  const periodId = c.req.param('id');
  if (!(await canAccessPeriod(userId, periodId, 'write'))) return periodAccessDenied(c, userId);
  const created: string[] = [];
  const due = await listDueRecurring(periodId);
  for (const rule of due) {
    const expenseId = nanoid();
    const now = new Date().toISOString();
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
      fxRate: 1,
      createdAt: now,
      occurredAt: now,
      updatedAt: now,
      version: 1,
    }, { bump: false });
    rule.nextAt = nextRecurringAt(now, rule.cadence || 'days', rule.intervalDays);
    await upsertRecurring(rule, { bump: false });
    created.push(expenseId);
  }
  if (created.length) await bumpPeriodVersion(periodId);
  const period = await getPeriod(periodId);
  return c.json({ created, version: period?.version ?? 0 });
});

app.get('/periods/:id/chat', async (c) => {
  const userId = requireUser(c);
  const periodId = c.req.param('id');
  if (!(await canAccessPeriod(userId, periodId))) return periodAccessDenied(c, userId);
  return c.json({ chat: await listChat(periodId) });
});

app.post('/periods/:id/chat', async (c) => {
  const userId = requireUser(c);
  const periodId = c.req.param('id');
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  if (!(await canAccessPeriod(userId, periodId, 'write')) || (await periodRole(userId, periodId)) === 'viewer') {
    return c.json({ error: 'اجازه ندارید' }, 403);
  }
  const { id, senderMemberId, body, expenseId } = await c.req.json<{
    id?: string;
    senderMemberId: string;
    body: string;
    expenseId?: string;
  }>();
  const msg = {
    id: id || nanoid(),
    periodId,
    senderMemberId,
    body,
    expenseId,
    createdAt: new Date().toISOString(),
  };
  await insertChat(msg);
  const period = await getPeriod(periodId);
  return c.json({ message: msg, chat: msg, version: period?.version ?? 0 });
});

app.post('/periods/:id/activity', async (c) => {
  const userId = requireUser(c);
  const periodId = c.req.param('id');
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  if (!(await canAccessPeriod(userId, periodId, 'write')) || (await periodRole(userId, periodId)) === 'viewer') {
    return c.json({ error: 'اجازه ندارید' }, 403);
  }
  const body = await c.req.json<{
    id?: string;
    actorName?: string;
    action: string;
    summary: string;
    entityId?: string;
    createdAt?: string;
  }>();
  const row = {
    id: body.id || nanoid(),
    periodId,
    actorName: body.actorName || (await getUserById(userId))?.displayName || 'کاربر',
    action: body.action,
    summary: body.summary,
    createdAt: body.createdAt || new Date().toISOString(),
    entityId: body.entityId,
  };
  await insertActivity(row);
  const period = await getPeriod(periodId);
  return c.json({ activity: row, version: period?.version ?? 0 });
});

app.get('/fx', async (c) => {
  return c.json(await getFxRates());
});

app.get('/payout/sheba-quota', async (c) => {
  const identity = lookupIdentity(c.get('userId'), c.req.header('X-Device-Id'));
  if (!identity) return c.json({ error: 'شناسه دستگاه لازم است' }, 400);
  return c.json(await quotaFor(identity));
});

app.post('/payout/card-to-sheba', async (c) => {
  const identity = lookupIdentity(c.get('userId'), c.req.header('X-Device-Id'));
  if (!identity) return c.json({ error: 'شناسه دستگاه لازم است' }, 400);
  const { cardNumber } = await c.req.json<{ cardNumber?: string }>();
  const digits = String(cardNumber || '').replace(/\D/g, '');
  if (!/^\d{16}$/.test(digits)) return c.json({ error: 'شماره کارت نامعتبر است' }, 400);
  try {
    const { result, remaining, cached } = await lookupCardSheba(identity, digits);
    return c.json({ ...result, remaining, cached });
  } catch (e) {
    const status = (e && typeof e === 'object' && 'status' in e && Number((e as { status: number }).status) === 429
      ? 429
      : 502) as 429 | 502;
    return c.json(
      { error: e instanceof Error ? e.message : 'استعلام شبا ناموفق بود', remaining: (await quotaFor(identity)).remaining },
      status,
    );
  }
});

app.post('/billing/bazaar/verify', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const { sku, purchaseToken } = await c.req.json<{ sku?: string; purchaseToken?: string }>();
  if (!sku || !purchaseToken) return c.json({ error: 'sku و توکن لازم است' }, 400);
  const result = await verifyBazaarPurchase({ sku, purchaseToken });
  if (!result.ok) return c.json({ error: result.error || 'تأیید نشد' }, 400);
  const until = premiumUntilFromNow(sku.includes('year') ? 365 : 30);
  const u = await getUserById(userId);
  if (u) {
    u.plan = 'premium';
    u.premiumUntil = until;
    await updateUser(u);
  }
  await recordBillingEvent({ userId, source: 'bazaar', sku, until });
  const user = await getUserById(userId);
  return c.json({ ok: true, user: user ? publicUser(user) : undefined });
});

app.post('/billing/myket/verify', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const { sku, purchaseToken } = await c.req.json<{ sku?: string; purchaseToken?: string }>();
  if (!sku || !purchaseToken) return c.json({ error: 'sku و توکن لازم است' }, 400);
  const result = await verifyMyketPurchase({ sku, purchaseToken });
  if (!result.ok) return c.json({ error: result.error || 'تأیید نشد' }, 400);
  const until = premiumUntilFromNow(sku.includes('year') ? 365 : 30);
  const u = await getUserById(userId);
  if (u) {
    u.plan = 'premium';
    u.premiumUntil = until;
    await updateUser(u);
  }
  await recordBillingEvent({ userId, source: 'myket', sku, until });
  const user = await getUserById(userId);
  return c.json({ ok: true, user: user ? publicUser(user) : undefined });
});

app.post('/billing/zarinpal/request', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const { sku } = await c.req.json<{ sku?: string }>();
  const chosen = sku || 'premium_monthly';
  try {
    const appUrl = appPublicUrl();
    const result = await zarinpalRequest({
      userId,
      sku: chosen,
      callbackUrl: `${appUrl}/more`,
    });
    return c.json(result);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'خطای درگاه' }, 400);
  }
});

app.post('/billing/zarinpal/verify', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const { authority, status } = await c.req.json<{ authority?: string; status?: string }>();
  if (!authority) return c.json({ error: 'authority لازم است' }, 400);
  const result = await zarinpalVerify({ authority, status: status || 'OK' });
  if (!result.ok) return c.json({ error: result.error || 'تأیید نشد' }, 400);
  if (result.userId && result.userId !== userId) return c.json({ error: 'تراکنش متعلق به این حساب نیست' }, 403);
  const user = await getUserById(userId);
  return c.json({ ok: true, user: user ? publicUser(user) : undefined });
});

app.post('/telegram/webhook', async (c) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && c.req.header('X-Telegram-Bot-Api-Secret-Token') !== secret) {
    return c.json({ error: 'دسترسی ندارید' }, 403);
  }
  const update = await c.req.json();
  const result = await handleTelegramUpdate(update);
  if (result.reply && update?.message?.chat?.id) {
    await telegramSend(update.message.chat.id, result.reply);
  }
  return c.json({ ok: true });
});

export default app;
