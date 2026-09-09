import type { Context, Next } from 'hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { nanoid } from 'nanoid';
import {
  canAssignMemberRole,
  classifyMemberSearchQuery,
  canManagePeriod,
  canWritePeriod,
  describeSplitError,
  expenseTotal,
  expirePremium,
  inferCadence,
  isPeriodId,
  isPremium,
  migratePeriodIds,
  newPeriodId,
  nextRecurringAt,
  normalizeEmail,
  normalizeIranMobile,
  normalizeOtpCode,
  parseUsername,
  PERIOD_DELETED_MESSAGE,
  periodLifecycleWriteDenial,
  SETTLEMENT_DENIAL_MESSAGE,
  settlementWriteDenial,
  syncedMemberRole,
  USERNAME_ERROR_FA,
  validateShares,
} from '@dongham/ledger';
import { actorMemberIds, canAccessPeriod, periodRole } from './access.js';
import { adminApp, consumeImpersonation } from './admin.js';
import { parseAvatarIds, parseAvatarWrite } from './avatar.js';
import { applyPeriodMedia, parseCoverWrite } from './periodMedia.js';
import {
  applyDisplayNameChange,
  applyUserProfilePatch,
  authSession,
  cloudProfile,
  DisplayNameInvalidError,
  DisplayNameQuotaError,
  parseRequiredDisplayName,
  persistPremiumExpiry,
  publicUser,
  signupDisplayName,
  wipePublicProfile,
} from './profile.js';
import {
  claimListedMemberships,
  createUser,
  EmailOtpRateLimitError,
  findUserByEmail,
  findUserByPhone,
  hashPassword,
  isEmailOtpMock,
  isOtpMock,
  isUserBanned,
  issueToken,
  loginWithGoogle,
  sendEmailOtp,
  sendOtp,
  verifyEmailOtp,
  verifyOtp,
  verifyPassword,
  verifyToken,
  revokeSession,
} from './auth.js';
import { lookupCardSheba, lookupIdentity, quotaFor } from './drapi.js';
import { getFxRates, recurringFxRate } from './fx.js';
import type { ExpenseRecord, MemberRecord, MemberRole, PaymentRecord, PeriodKind, PeriodRecord, PeriodTemplate, RecurringCadence, RoundTo, UserRecord } from './types.js';
import { skuPrices, zarinpalRequest, zarinpalVerify } from './zarinpal.js';
import { appPublicUrl, inviteExpiresAt, isInviteExpired } from './publicUrl.js';
import { deleteSubscription, getVapidPublicKey, upsertSubscription } from './push.js';
import { liveWaitMs, waitForLiveEvents } from './live.js';
import {
  bumpPeriodVersion,
  completePeriod,
  deleteFriend,
  deletePeriodCascade,
  deleteSessionsForUser,
  getAttachment,
  getExpense,
  getInvite,
  getMember,
  getPayment,
  getPeriod,
  getUserById,
  findUserByUsername,
  hasFriendByUserId,
  searchUsers,
  hasPendingPayment,
  insertActivity,
  insertAttachment,
  insertChat,
  insertInvite,
  insertNotification,
  insertPeriod,
  listChat,
  listDueRecurring,
  listFriends,
  listMembers,
  listNotifications,
  listPeriodArchives,
  listPeriodIds,
  listPeriodsForUser,
  ensurePeriodUserStates,
  listPublicPeriodsForProfile,
  listVisibleAvatars,
  loadPeriodSnapshot,
  markNotificationRead,
  notifyPeriodMembers,
  publicProfileStats,
  pushChatToPeriodMembers,
  reopenPeriod,
  restorePeriod,
  setPeriodArchived,
  setPeriodChatMuted,
  setPeriodChatReadAt,
  setPeriodLastSeenAt,
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

async function requireWrite(
  c: Context<{ Variables: Variables }>,
  periodId: string,
  opts?: { allowDeleted?: boolean },
) {
  const userId = requireUser(c);
  if (!userId) return { error: c.json({ error: 'وارد نشده‌اید' }, 401) };
  if (!(await canAccessPeriod(userId, periodId, 'write'))) {
    return { error: c.json({ error: 'اجازه ندارید' }, 403) };
  }
  const role = await periodRole(userId, periodId);
  if (!role || !canWritePeriod(role)) return { error: c.json({ error: 'نقش بیننده اجازهٔ تغییر ندارد' }, 403) };
  const period = await getPeriod(periodId);
  if (!period) return { error: c.json({ error: 'پیدا نشد' }, 404) };
  if (period.deletedAt && !opts?.allowDeleted) {
    return { error: c.json({ error: PERIOD_DELETED_MESSAGE }, 403) };
  }
  return { userId, role, period };
}

async function requireManage(
  c: Context<{ Variables: Variables }>,
  periodId: string,
  opts?: { allowDeleted?: boolean },
) {
  const gate = await requireWrite(c, periodId, opts);
  if ('error' in gate) return gate;
  if (!canManagePeriod(gate.role)) {
    return { error: c.json({ error: 'فقط مالک یا مدیر اجازهٔ این کار را دارد' }, 403) };
  }
  return gate;
}

async function requirePeriodAccess(c: Context<{ Variables: Variables }>, periodId: string) {
  const userId = requireUser(c);
  if (!userId) return { error: c.json({ error: 'وارد نشده‌اید' }, 401) };
  if (!(await canAccessPeriod(userId, periodId))) {
    return { error: c.json({ error: 'اجازه ندارید' }, 403) };
  }
  return { userId };
}

function parseDateOrNow(raw: unknown): Date {
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    if (Number.isFinite(t)) return new Date(t);
  }
  return new Date();
}

function lifecycleWriteError(
  c: Context<{ Variables: Variables }>,
  period: PeriodRecord | undefined,
  role: MemberRole | null | undefined,
  kind: 'expense' | 'other',
) {
  const msg = periodLifecycleWriteDenial({
    deletedAt: period?.deletedAt,
    completedAt: period?.completedAt,
    role,
    kind,
  });
  if (!msg) return null;
  return c.json({ error: msg }, 403);
}

function assignedMemberRole(input: {
  actorRole: MemberRole;
  ownerId: string;
  memberUserId?: string;
  requested?: MemberRole;
  current?: MemberRole;
}): MemberRole {
  const next = syncedMemberRole(input.requested, input.memberUserId, input.ownerId);
  if (next === 'owner') return 'owner';
  const current = input.current && input.current !== 'owner' ? input.current : 'member';
  if (next === current) return next;
  if (canAssignMemberRole(input.actorRole, { role: current, isOwner: false }, next)) return next;
  return current;
}

/** Invite tokens are join credentials: only members who may write (owner/manager/member) receive them. */
async function canSeeInvites(userId: string | null, periodId: string): Promise<boolean> {
  if (!userId) return false;
  return canWritePeriod(await periodRole(userId, periodId));
}

function snapshotJson(snap: NonNullable<Awaited<ReturnType<typeof loadPeriodSnapshot>>>, includeInvites: boolean) {
  return {
    period: snap.period,
    members: snap.members,
    expenses: snap.expenses,
    payments: snap.payments,
    chat: snap.chat,
    invites: includeInvites ? snap.invites : [],
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
  if (!local || !otp) return c.json({ error: 'کد نامعتبر است' }, 400);
  let user = await findUserByPhone(local);
  const newName = user ? undefined : signupDisplayName({ displayName, phone: local });
  if (!user && !newName) return c.json({ error: 'نام نمایشی لازم است' }, 400);
  if (!(await verifyOtp(local, otp))) return c.json({ error: 'کد نامعتبر است' }, 400);
  if (!user) {
    user = await createUser({ phone: local, displayName: newName! });
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
    displayName?: string;
    deviceId: string;
  }>();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password || password.length < 6) {
    return c.json({ error: 'ایمیل یا رمز نامعتبر است' }, 400);
  }
  if (await findUserByEmail(normalizedEmail)) return c.json({ error: 'این ایمیل قبلاً ثبت شده' }, 409);
  const name = signupDisplayName({ displayName, email: normalizedEmail });
  if (!name) return c.json({ error: 'نام نمایشی لازم است' }, 400);
  const user = await createUser({
    email: normalizedEmail,
    displayName: name,
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

app.post('/auth/email-otp/request', async (c) => {
  let email: string | undefined;
  try {
    email = (await c.req.json<{ email?: string }>()).email;
  } catch {
    email = undefined;
  }
  const normalized = normalizeEmail(email);
  if (!normalized) return c.json({ error: 'ایمیل نامعتبر است' }, 400);
  try {
    const code = await sendEmailOtp(normalized, 'login');
    const body: Record<string, unknown> = { ok: true };
    if (isEmailOtpMock()) body.devCode = code;
    return c.json(body);
  } catch (e) {
    if (e instanceof EmailOtpRateLimitError) return c.json({ error: e.message }, 429);
    return c.json({ error: e instanceof Error ? e.message : 'ارسال ایمیل ناموفق بود' }, 502);
  }
});

app.post('/auth/email-otp/verify', async (c) => {
  const { email, code, displayName, deviceId } = await c.req.json<{
    email: string;
    code: string;
    displayName?: string;
    deviceId: string;
  }>();
  const normalized = normalizeEmail(email);
  const otp = normalizeOtpCode(code);
  if (!normalized || !otp) return c.json({ error: 'کد نامعتبر است' }, 400);
  let user = await findUserByEmail(normalized);
  const newName = user ? undefined : signupDisplayName({ displayName, email: normalized });
  if (!user && !newName) return c.json({ error: 'نام نمایشی لازم است' }, 400);
  if (!(await verifyEmailOtp(normalized, otp, 'login'))) return c.json({ error: 'کد نامعتبر است' }, 400);
  if (!user) {
    user = await createUser({ email: normalized, displayName: newName! });
  }
  if (isUserBanned(user)) return c.json({ error: 'این حساب مسدود است' }, 403);
  await claimListedMemberships(user);
  const token = await issueToken(user.id, deviceId || nanoid());
  return c.json(await authSession(token, user));
});

app.post('/auth/link/email/request', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  let email: string | undefined;
  try {
    email = (await c.req.json<{ email?: string }>()).email;
  } catch {
    email = undefined;
  }
  const normalized = normalizeEmail(email);
  if (!normalized) return c.json({ error: 'ایمیل نامعتبر است' }, 400);
  const user = await getUserById(userId);
  if (!user || user.deletedAt) return c.json({ error: 'پیدا نشد' }, 404);
  if (user.email) return c.json({ error: 'ایمیل این حساب قبلاً ثبت شده' }, 409);
  const taken = await findUserByEmail(normalized);
  if (taken && taken.id !== userId) return c.json({ error: 'این ایمیل قبلاً برای حساب دیگری ثبت شده' }, 409);
  try {
    const code = await sendEmailOtp(normalized, 'link', userId);
    const body: Record<string, unknown> = { ok: true };
    if (isEmailOtpMock()) body.devCode = code;
    return c.json(body);
  } catch (e) {
    if (e instanceof EmailOtpRateLimitError) return c.json({ error: e.message }, 429);
    return c.json({ error: e instanceof Error ? e.message : 'ارسال ایمیل ناموفق بود' }, 502);
  }
});

app.post('/auth/link/email/verify', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const { email, code } = await c.req.json<{ email: string; code: string }>();
  const normalized = normalizeEmail(email);
  const otp = normalizeOtpCode(code);
  if (!normalized || !otp) return c.json({ error: 'کد نامعتبر است' }, 400);
  const user = await getUserById(userId);
  if (!user || user.deletedAt) return c.json({ error: 'پیدا نشد' }, 404);
  if (user.email) return c.json({ error: 'ایمیل این حساب قبلاً ثبت شده' }, 409);
  const taken = await findUserByEmail(normalized);
  if (taken && taken.id !== userId) return c.json({ error: 'این ایمیل قبلاً برای حساب دیگری ثبت شده' }, 409);
  if (!(await verifyEmailOtp(normalized, otp, 'link', userId))) return c.json({ error: 'کد نامعتبر است' }, 400);
  user.email = normalized;
  await updateUser(user);
  await claimListedMemberships(user);
  await persistPremiumExpiry(user);
  const next = (await getUserById(userId))!;
  return c.json({ user: publicUser(next), profile: cloudProfile(next) });
});

app.post('/auth/link/phone/request', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  let phone: string | undefined;
  try {
    phone = (await c.req.json<{ phone?: string }>()).phone;
  } catch {
    phone = undefined;
  }
  const local = normalizeIranMobile(phone);
  if (!local) return c.json({ error: 'شماره موبایل نامعتبر است' }, 400);
  const user = await getUserById(userId);
  if (!user || user.deletedAt) return c.json({ error: 'پیدا نشد' }, 404);
  if (user.phone) return c.json({ error: 'شماره این حساب قبلاً ثبت شده' }, 409);
  const taken = await findUserByPhone(local);
  if (taken && taken.id !== userId) return c.json({ error: 'این شماره قبلاً برای حساب دیگری ثبت شده' }, 409);
  try {
    const code = await sendOtp(local);
    const body: Record<string, unknown> = { ok: true };
    if (isOtpMock()) body.devCode = code;
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ارسال پیامک ناموفق بود' }, 502);
  }
});

app.post('/auth/link/phone/verify', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const { phone, code } = await c.req.json<{ phone: string; code: string }>();
  const local = normalizeIranMobile(phone);
  const otp = normalizeOtpCode(code);
  if (!local || !otp) return c.json({ error: 'کد نامعتبر است' }, 400);
  const user = await getUserById(userId);
  if (!user || user.deletedAt) return c.json({ error: 'پیدا نشد' }, 404);
  if (user.phone) return c.json({ error: 'شماره این حساب قبلاً ثبت شده' }, 409);
  const taken = await findUserByPhone(local);
  if (taken && taken.id !== userId) return c.json({ error: 'این شماره قبلاً برای حساب دیگری ثبت شده' }, 409);
  if (!(await verifyOtp(local, otp))) return c.json({ error: 'کد نامعتبر است' }, 400);
  user.phone = local;
  await updateUser(user);
  await claimListedMemberships(user);
  await persistPremiumExpiry(user);
  const next = (await getUserById(userId))!;
  return c.json({ user: publicUser(next), profile: cloudProfile(next) });
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
    usePersianDigits?: boolean;
    debtReminders?: boolean;
    calendarMode?: 'jalali' | 'gregorian';
    autoSync?: boolean;
    fxWatchlist?: string[];
    payoutMethods?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'بدنه نامعتبر است' }, 400);
  }
  const next = await applyUserProfilePatch(userId, {
    usePersianDigits: body.usePersianDigits,
    debtReminders: body.debtReminders,
    calendarMode: body.calendarMode,
    autoSync: body.autoSync,
    fxWatchlist: body.fxWatchlist,
    payoutMethods: Array.isArray(body.payoutMethods) ? body.payoutMethods : undefined,
  });
  if (!next) return c.json({ error: 'پیدا نشد' }, 404);
  return c.json({ user: publicUser(next), profile: cloudProfile(next) });
});

app.put('/auth/me/display-name', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  let body: { displayName?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'بدنه نامعتبر است' }, 400);
  }
  try {
    const next = await applyDisplayNameChange(userId, body.displayName);
    if (!next) return c.json({ error: 'پیدا نشد' }, 404);
    return c.json({ user: publicUser(next), profile: cloudProfile(next) });
  } catch (e) {
    if (e instanceof DisplayNameInvalidError) return c.json({ error: e.message }, 400);
    if (e instanceof DisplayNameQuotaError) {
      return c.json(
        {
          error: e.message,
          displayNameChangesUsed: e.quota.used,
          displayNameChangesRemaining: e.quota.remaining,
          displayNameChangesLimit: e.quota.limit,
        },
        429,
      );
    }
    throw e;
  }
});

app.post('/auth/me/avatar', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  let body: { mime?: unknown; dataBase64?: unknown; avatarPreset?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'بدنه نامعتبر است' }, 400);
  }
  const parsed = parseAvatarWrite(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const user = await getUserById(userId);
  if (!user || user.deletedAt) return c.json({ error: 'پیدا نشد' }, 404);
  if (parsed.kind === 'preset') {
    user.avatarPreset = parsed.preset;
    user.avatarDataUrl = undefined;
  } else {
    user.avatarDataUrl = parsed.dataUrl;
    user.avatarPreset = undefined;
  }
  user.avatarUpdatedAt = new Date().toISOString();
  await updateUser(user);
  const next = (await getUserById(userId))!;
  return c.json({ user: publicUser(next), profile: cloudProfile(next) });
});

app.delete('/auth/me/avatar', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const user = await getUserById(userId);
  if (!user || user.deletedAt) return c.json({ error: 'پیدا نشد' }, 404);
  user.avatarDataUrl = undefined;
  user.avatarPreset = undefined;
  user.avatarUpdatedAt = undefined;
  await updateUser(user);
  const next = (await getUserById(userId))!;
  return c.json({ user: publicUser(next), profile: cloudProfile(next) });
});

app.get('/auth/username/available', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const parsed = parseUsername(c.req.query('u'));
  if (!parsed.ok) {
    return c.json({ available: false, reason: parsed.reason, error: USERNAME_ERROR_FA[parsed.reason] });
  }
  const taken = await findUserByUsername(parsed.username);
  const available = !taken || taken.id === userId;
  return c.json({
    available,
    username: parsed.username,
    reason: available ? undefined : 'taken',
    error: available ? undefined : 'این یوزرنیم قبلاً گرفته شده',
  });
});

app.put('/auth/me/username', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  let body: { username?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'بدنه نامعتبر است' }, 400);
  }
  const user = await getUserById(userId);
  if (!user || user.deletedAt) return c.json({ error: 'پیدا نشد' }, 404);
  const raw = typeof body.username === 'string' ? body.username : '';
  if (!raw.trim()) {
    user.username = undefined;
    await updateUser(user);
    const next = (await getUserById(userId))!;
    return c.json({ user: publicUser(next), profile: cloudProfile(next) });
  }
  const parsed = parseUsername(raw);
  if (!parsed.ok) return c.json({ error: USERNAME_ERROR_FA[parsed.reason] }, 400);
  const taken = await findUserByUsername(parsed.username);
  if (taken && taken.id !== userId) return c.json({ error: 'این یوزرنیم قبلاً گرفته شده' }, 409);
  user.username = parsed.username;
  await updateUser(user);
  const next = (await getUserById(userId))!;
  return c.json({ user: publicUser(next), profile: cloudProfile(next) });
});

app.put('/auth/me/cover', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  let body: { mime?: unknown; dataBase64?: unknown; coverPreset?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'بدنه نامعتبر است' }, 400);
  }
  const parsed = parseCoverWrite(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const user = await getUserById(userId);
  if (!user || user.deletedAt) return c.json({ error: 'پیدا نشد' }, 404);
  if (parsed.kind === 'preset') {
    user.profileCoverPreset = parsed.preset;
    user.profileCoverDataUrl = undefined;
  } else {
    user.profileCoverDataUrl = parsed.dataUrl;
    user.profileCoverPreset = undefined;
  }
  await updateUser(user);
  const next = (await getUserById(userId))!;
  return c.json({ user: publicUser(next), profile: cloudProfile(next) });
});

app.delete('/auth/me/cover', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const user = await getUserById(userId);
  if (!user || user.deletedAt) return c.json({ error: 'پیدا نشد' }, 404);
  user.profileCoverPreset = undefined;
  user.profileCoverDataUrl = undefined;
  await updateUser(user);
  const next = (await getUserById(userId))!;
  return c.json({ user: publicUser(next), profile: cloudProfile(next) });
});

app.get('/u/:username', async (c) => {
  const parsed = parseUsername(c.req.param('username'));
  if (!parsed.ok) return c.json({ error: 'پیدا نشد' }, 404);
  const user = await findUserByUsername(parsed.username);
  if (!user || user.deletedAt || isUserBanned(user)) return c.json({ error: 'پیدا نشد' }, 404);
  expirePremium(user);
  const [stats, publicPeriods] = await Promise.all([
    publicProfileStats(user.id),
    listPublicPeriodsForProfile(user.id),
  ]);
  const body: {
    username: string;
    displayName: string;
    avatarPreset: string | null;
    avatarDataUrl: string | null;
    coverPreset: string | null;
    coverDataUrl: string | null;
    periodCount: number;
    comemberCount: number;
    createdAt: string;
    isPremium: boolean;
    publicPeriods: typeof publicPeriods;
    viewer?: { isSelf: boolean; isFriend: boolean };
  } = {
    username: parsed.username,
    displayName: user.displayName,
    avatarPreset: user.avatarPreset || null,
    avatarDataUrl: user.avatarDataUrl || null,
    coverPreset: user.profileCoverPreset || null,
    coverDataUrl: user.profileCoverDataUrl || null,
    periodCount: stats.periodCount,
    comemberCount: stats.comemberCount,
    createdAt: user.createdAt,
    isPremium: isPremium(user),
    publicPeriods,
  };
  const viewerId = requireUser(c);
  if (viewerId) {
    body.viewer = {
      isSelf: viewerId === user.id,
      isFriend: await hasFriendByUserId(viewerId, user.id),
    };
  }
  return c.json(body);
});

app.get('/users/lookup', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const parsed = parseUsername(c.req.query('username'));
  if (!parsed.ok) return c.json({ error: USERNAME_ERROR_FA[parsed.reason] }, 400);
  const user = await findUserByUsername(parsed.username);
  if (!user || user.deletedAt || isUserBanned(user)) return c.json({ error: 'پیدا نشد' }, 404);
  return c.json({
    userId: user.id,
    displayName: user.displayName,
    username: user.username,
    hasAvatar: Boolean(user.hasAvatar || user.avatarDataUrl || user.avatarPreset),
    avatarPreset: user.avatarPreset || undefined,
  });
});

app.get('/users/search', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const classified = classifyMemberSearchQuery(c.req.query('q') ?? '');
  if (classified.kind === 'too_short') {
    return c.json({ error: 'حداقل ۳ کاراکتر وارد کنید' }, 400);
  }
  const users = await searchUsers(c.req.query('q') ?? '', userId);
  return c.json({ users });
});

app.get('/avatars', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const ids = parseAvatarIds(c.req.query('ids'));
  const avatars = await listVisibleAvatars(userId, ids);
  return c.json({ avatars });
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
    wipePublicProfile(u);
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
  const archived = await listPeriodArchives(userId);
  const state = await ensurePeriodUserStates(
    userId,
    periods.map((p) => p.id),
  );
  return c.json({
    periods: periods.map((p) => {
      const row = state.get(p.id);
      return {
        id: p.id,
        title: p.title,
        currency: p.currency,
        version: p.version,
        updatedAt: p.updatedAt,
        visibility: p.visibility || 'private',
        deletedAt: p.deletedAt || null,
        completedAt: p.completedAt || null,
        archivedAt: archived.get(p.id) || null,
        chatMutedAt: row?.chatMutedAt || null,
        chatLastReadAt: row?.chatLastReadAt || null,
        lastSeenAt: row?.lastSeenAt || null,
      };
    }),
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
      excludeFromNew?: boolean;
      cardNumber?: string;
      sheba?: string;
      cardHolderName?: string;
      bankName?: string;
      unitLabel?: string;
    }[];
    kind?: PeriodKind;
    template?: PeriodTemplate;
    roundTo?: RoundTo;
    bankerMemberId?: string;
    buildingCharge?: number;
    lunchTurnMemberId?: string;
    encrypted?: boolean;
    visibility?: 'private' | 'public';
    coverPreset?: string | null;
    coverDataUrl?: string | null;
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
    const actorRole = await periodRole(userId, id);
    if (!actorRole || !canManagePeriod(actorRole)) return c.json({ error: 'اجازه ندارید' }, 403);
    const blocked = lifecycleWriteError(c, existing, actorRole, 'other');
    if (blocked) return blocked;
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
    const mediaError = applyPeriodMedia(existing, body);
    if (mediaError) return c.json({ error: mediaError }, 400);
    existing.updatedAt = now;
    await updatePeriod(existing);
    if (body.members?.length) {
      const existingMembers = await listMembers(id);
      for (const m of body.members) {
        if (!m.id || !m.displayName) continue;
        const prev = existingMembers.find((row) => row.id === m.id);
        await upsertMember({
          id: m.id,
          periodId: id,
          guestKey: m.guestKey,
          userId: m.userId,
          displayName: m.displayName,
          weightDefault: m.weightDefault ?? 1,
          role: assignedMemberRole({
            actorRole,
            ownerId: existing.ownerId,
            memberUserId: m.userId,
            requested: m.role,
            current: prev?.role,
          }),
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
  const mediaError = applyPeriodMedia(period, body);
  if (mediaError) return c.json({ error: mediaError }, 400);
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
      // Same field set as the update branch: the first cloud push must not drop cards/SHEBA/units.
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
        excludeFromNew: m.excludeFromNew,
        cardNumber: m.cardNumber,
        sheba: m.sheba,
        cardHolderName: m.cardHolderName,
        bankName: m.bankName,
        unitLabel: m.unitLabel,
      });
    }
  } else {
    const user = await getUserById(userId);
    await upsertMember({
      id: `own-${id}`,
      periodId: id,
      userId,
      displayName: user?.displayName || 'کاربر',
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
  if (!snap) return c.json({ error: 'پیدا نشد' }, 404);
  return c.json(snapshotJson(snap, await canSeeInvites(userId, periodId)));
});

app.post('/periods/:id/complete', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireManage(c, periodId);
  if ('error' in gate) return gate.error;
  if (gate.period.completedAt) {
    return c.json({ period: gate.period, version: gate.period.version });
  }
  const period = await completePeriod(periodId, gate.userId);
  const actor = await getUserById(gate.userId);
  await insertActivity({
    id: nanoid(),
    periodId,
    actorName: actor?.displayName || 'کاربر',
    action: 'period.complete',
    summary: `دوره «${period?.title || ''}» به اتمام رسید`,
    createdAt: new Date().toISOString(),
  });
  await notifyPeriodMembers(periodId, gate.userId, 'اتمام دوره', `دوره «${period?.title || ''}» به اتمام رسید`);
  return c.json({ period, version: period?.version ?? 0 });
});

app.post('/periods/:id/archive', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const archivedAt = await setPeriodArchived(gate.userId, periodId, true);
  return c.json({ ok: true, archivedAt });
});

app.post('/periods/:id/unarchive', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  await setPeriodArchived(gate.userId, periodId, false);
  return c.json({ ok: true, archivedAt: null });
});

app.post('/periods/:id/chat/mute', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requirePeriodAccess(c, periodId);
  if ('error' in gate) return gate.error;
  const chatMutedAt = await setPeriodChatMuted(gate.userId, periodId, true);
  return c.json({ ok: true, chatMutedAt });
});

app.post('/periods/:id/chat/unmute', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requirePeriodAccess(c, periodId);
  if ('error' in gate) return gate.error;
  await setPeriodChatMuted(gate.userId, periodId, false);
  return c.json({ ok: true, chatMutedAt: null });
});

app.post('/periods/:id/chat/read', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requirePeriodAccess(c, periodId);
  if ('error' in gate) return gate.error;
  let lastReadAt: unknown;
  try {
    lastReadAt = ((await c.req.json()) as { lastReadAt?: unknown }).lastReadAt;
  } catch {
    lastReadAt = undefined;
  }
  const at = await setPeriodChatReadAt(gate.userId, periodId, parseDateOrNow(lastReadAt));
  return c.json({ ok: true, chatLastReadAt: at });
});

app.post('/periods/:id/seen', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requirePeriodAccess(c, periodId);
  if ('error' in gate) return gate.error;
  let lastSeenAt: unknown;
  try {
    lastSeenAt = ((await c.req.json()) as { lastSeenAt?: unknown }).lastSeenAt;
  } catch {
    lastSeenAt = undefined;
  }
  const at = await setPeriodLastSeenAt(gate.userId, periodId, parseDateOrNow(lastSeenAt));
  return c.json({ ok: true, lastSeenAt: at });
});

app.delete('/periods/:id', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireManage(c, periodId);
  if ('error' in gate) return gate.error;
  await deletePeriodCascade(periodId, gate.userId);
  const period = await getPeriod(periodId);
  const actor = await getUserById(gate.userId);
  await insertActivity({
    id: nanoid(),
    periodId,
    actorName: actor?.displayName || 'کاربر',
    action: 'period.delete',
    summary: `دوره «${gate.period.title}» حذف شد`,
    createdAt: new Date().toISOString(),
  });
  await notifyPeriodMembers(periodId, gate.userId, 'حذف دوره', `دوره «${gate.period.title}» حذف شد`);
  return c.json({ period, version: period?.version ?? 0 });
});

app.post('/periods/:id/restore', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireManage(c, periodId, { allowDeleted: true });
  if ('error' in gate) return gate.error;
  const period = await restorePeriod(periodId);
  const actor = await getUserById(gate.userId);
  await insertActivity({
    id: nanoid(),
    periodId,
    actorName: actor?.displayName || 'کاربر',
    action: 'period.restore',
    summary: `دوره «${period?.title || gate.period.title}» بازیابی شد`,
    createdAt: new Date().toISOString(),
  });
  await notifyPeriodMembers(periodId, gate.userId, 'بازیابی دوره', `دوره «${period?.title || ''}» بازیابی شد`);
  return c.json({ period, version: period?.version ?? 0 });
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
  return c.json(snapshotJson(snap, await canSeeInvites(userId, periodId)));
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
  // Same check the app runs before save; a stored mismatch would make computeShares throw on every read.
  if (!expense.deletedAt) {
    const check = validateShares(expense.splitMode, expenseTotal(expense), expense.shares);
    if (!check.ok) return { error: describeSplitError(check.error) };
  }
  await upsertExpense(expense);
  return { expense };
}

app.post('/periods/:id/expenses', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const blocked = lifecycleWriteError(c, gate.period, gate.role, 'expense');
  if (blocked) return blocked;
  const body = await c.req.json<Partial<ExpenseRecord>>();
  const isNew = !(body.id && (await getExpense(body.id)));
  const written = await writeExpenseFromBody(periodId, body);
  if ('error' in written) return c.json({ error: written.error }, 400);
  const { expense } = written;
  if (isNew && !expense.deletedAt && gate.period.completedAt) {
    await reopenPeriod(periodId);
  }
  await insertActivity({
    id: nanoid(),
    periodId,
    actorName: (await getUserById(gate.userId))?.displayName || 'کاربر',
    action: 'expense.upsert',
    summary: `ثبت هزینه «${expense.title}»`,
    createdAt: expense.updatedAt,
    entityId: expense.id,
  });
  if (isNew) {
    await notifyPeriodMembers(periodId, gate.userId, 'هزینه جدید', `ثبت هزینه «${expense.title}»`);
  }
  const period = await getPeriod(periodId);
  return c.json({ expense, version: period?.version ?? 0 });
});

app.patch('/periods/:id/expenses/:expenseId', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const blocked = lifecycleWriteError(c, gate.period, gate.role, 'other');
  if (blocked) return blocked;
  const prev = await getExpense(c.req.param('expenseId'));
  if (!prev || prev.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  const body = await c.req.json<Partial<ExpenseRecord>>();
  const written = await writeExpenseFromBody(periodId, { ...prev, ...body, id: prev.id });
  if ('error' in written) return c.json({ error: written.error }, 400);
  const period = await getPeriod(periodId);
  return c.json({ expense: written.expense, version: period?.version ?? 0 });
});

app.delete('/periods/:id/expenses/:expenseId', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const blocked = lifecycleWriteError(c, gate.period, gate.role, 'other');
  if (blocked) return blocked;
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

/** Same debtor/creditor/manager rules the app enforces locally (`@dongham/ledger` settlement). */
async function settlementDenied(
  c: Context<{ Variables: Variables }>,
  gate: { userId: string; role: MemberRole },
  periodId: string,
  next: Partial<PaymentRecord>,
  prev?: PaymentRecord | null,
) {
  const actor = { memberIds: await actorMemberIds(gate.userId, periodId), role: gate.role };
  const denial = settlementWriteDenial(
    actor,
    {
      kind: next.kind || prev?.kind,
      status: next.status || prev?.status,
      fromMemberId: next.fromMemberId || prev?.fromMemberId || '',
      toMemberId: next.toMemberId || prev?.toMemberId || '',
    },
    prev ? { kind: prev.kind, status: prev.status, fromMemberId: prev.fromMemberId, toMemberId: prev.toMemberId } : null,
  );
  return denial ? c.json({ error: SETTLEMENT_DENIAL_MESSAGE[denial], code: denial }, 403) : null;
}

app.post('/periods/:id/payments', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const blocked = lifecycleWriteError(c, gate.period, gate.role, 'other');
  if (blocked) return blocked;
  const body = await c.req.json<Partial<PaymentRecord>>();
  const prev = body.id ? await getPayment(body.id) : undefined;
  const isNew = !prev;
  if (prev && prev.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  const denied = await settlementDenied(c, gate, periodId, body, prev);
  if (denied) return denied;
  const result = await writePaymentFromBody(periodId, body);
  if ('duplicate' in result) return c.json({ error: 'پرداخت در انتظار تأیید از قبل وجود دارد' }, 409);
  const summary = result.payment.kind === 'loan' ? 'ثبت قرض' : 'ثبت تسویه';
  await insertActivity({
    id: nanoid(),
    periodId,
    actorName: (await getUserById(gate.userId))?.displayName || 'کاربر',
    action: 'payment.upsert',
    summary,
    createdAt: result.payment.updatedAt,
    entityId: result.payment.id,
  });
  if (isNew) {
    await notifyPeriodMembers(periodId, gate.userId, summary, summary);
  }
  const period = await getPeriod(periodId);
  return c.json({ ...result, version: period?.version ?? 0 });
});

app.patch('/periods/:id/payments/:paymentId', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const blocked = lifecycleWriteError(c, gate.period, gate.role, 'other');
  if (blocked) return blocked;
  const prev = await getPayment(c.req.param('paymentId'));
  if (!prev || prev.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  const body = await c.req.json<Partial<PaymentRecord>>();
  const denied = await settlementDenied(c, gate, periodId, body, prev);
  if (denied) return denied;
  const result = await writePaymentFromBody(periodId, { ...prev, ...body, id: prev.id });
  if ('duplicate' in result) return c.json({ error: 'پرداخت در انتظار تأیید از قبل وجود دارد' }, 409);
  const period = await getPeriod(periodId);
  return c.json({ ...result, version: period?.version ?? 0 });
});

app.delete('/periods/:id/payments/:paymentId', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const blocked = lifecycleWriteError(c, gate.period, gate.role, 'other');
  if (blocked) return blocked;
  const prev = await getPayment(c.req.param('paymentId'));
  if (!prev || prev.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  const denied = await settlementDenied(c, gate, periodId, {}, prev);
  if (denied) return denied;
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
  const gate = await requireManage(c, periodId);
  if ('error' in gate) return gate.error;
  const blocked = lifecycleWriteError(c, gate.period, gate.role, 'other');
  if (blocked) return blocked;
  const period = await getPeriod(periodId);
  if (!period) return c.json({ error: 'پیدا نشد' }, 404);
  const body = await c.req.json<Partial<MemberRecord> & { username?: string }>();
  let linked: UserRecord | undefined;
  if (body.username) {
    const parsed = parseUsername(body.username);
    if (!parsed.ok) return c.json({ error: USERNAME_ERROR_FA[parsed.reason] }, 400);
    const found = await findUserByUsername(parsed.username);
    if (!found || found.deletedAt || isUserBanned(found)) return c.json({ error: 'پیدا نشد' }, 404);
    const existing = await listMembers(periodId);
    if (existing.some((m) => m.userId === found.id)) {
      return c.json({ error: 'این فرد از قبل در دوره است' }, 409);
    }
    linked = found;
  }
  const memberUserId = linked?.id || body.userId;
  const role = assignedMemberRole({
    actorRole: gate.role,
    ownerId: period.ownerId,
    memberUserId,
    requested: body.role,
  });
  const member: MemberRecord = {
    id: body.id || nanoid(),
    periodId,
    displayName: linked?.displayName || body.displayName || 'عضو',
    guestKey: body.guestKey,
    userId: memberUserId,
    weightDefault: body.weightDefault ?? 1,
    role,
    phone: normalizeIranMobile(linked?.phone || body.phone) || linked?.phone || body.phone,
    email: normalizeEmail(linked?.email || body.email) || linked?.email || body.email,
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
  if (linked) {
    await notifyPeriodMembers(periodId, gate.userId, 'عضو جدید', `${member.displayName} به دوره اضافه شد`);
  }
  return c.json({ member, version });
});

app.patch('/periods/:id/members/:memberId', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const blocked = lifecycleWriteError(c, gate.period, gate.role, 'other');
  if (blocked) return blocked;
  const period = await getPeriod(periodId);
  const existing = await getMember(c.req.param('memberId'));
  if (!period || !existing || existing.periodId !== periodId) return c.json({ error: 'پیدا نشد' }, 404);
  const body = await c.req.json<Partial<MemberRecord>>();
  const mine = await actorMemberIds(gate.userId, periodId);
  const isSelf = mine.includes(existing.id);
  const manage = canManagePeriod(gate.role);
  if (!manage && !isSelf) {
    return c.json({ error: 'اجازه ندارید' }, 403);
  }
  if (body.role && body.role !== existing.role) {
    if (!manage) {
      return c.json({ error: 'فقط مالک یا مدیر اجازهٔ این کار را دارد' }, 403);
    }
    const targetIsOwner = Boolean(existing.userId && existing.userId === period.ownerId) || existing.role === 'owner';
    if (
      body.role !== existing.role &&
      !canAssignMemberRole(gate.role, { role: existing.role, isOwner: targetIsOwner }, body.role)
    ) {
      return c.json({ error: 'اجازه ندارید' }, 403);
    }
    existing.role = syncedMemberRole(body.role, existing.userId, period.ownerId);
  }
  if (!manage) {
    if (body.isPot !== undefined && Boolean(body.isPot) !== Boolean(existing.isPot)) {
      return c.json({ error: 'اجازه ندارید' }, 403);
    }
    if (body.userId && body.userId !== gate.userId) {
      return c.json({ error: 'اجازه ندارید' }, 403);
    }
  }
  if (body.displayName) existing.displayName = body.displayName;
  if (body.userId) existing.userId = body.userId;
  if (body.phone !== undefined) existing.phone = normalizeIranMobile(body.phone) || body.phone;
  if (body.email !== undefined) existing.email = normalizeEmail(body.email) || body.email;
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
  const periodId = c.req.param('id');
  const gate = await requireManage(c, periodId);
  if ('error' in gate) return gate.error;
  const blocked = lifecycleWriteError(c, gate.period, gate.role, 'other');
  if (blocked) return blocked;
  const userId = gate.userId;
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
  if (!period || period.deletedAt) return c.json({ error: 'پیدا نشد' }, 404);
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
  const joinPeriod = await getPeriod(invite.periodId);
  if (!joinPeriod || joinPeriod.deletedAt) return c.json({ error: PERIOD_DELETED_MESSAGE }, 404);
  const user = await getUserById(userId);
  if (!user || user.deletedAt) return c.json({ error: 'پیدا نشد' }, 404);
  const phone = normalizeIranMobile(user.phone);
  const email = normalizeEmail(user.email);
  const members = await listMembers(invite.periodId);
  const matches = (m: MemberRecord) => {
    if (guestKey && m.guestKey === guestKey) return true;
    if (phone && normalizeIranMobile(m.phone) === phone) return true;
    if (email && normalizeEmail(m.email) === email) return true;
    return false;
  };
  // Already linked to this account wins; otherwise only an unclaimed seat may be taken.
  const existing = members.find((m) => m.userId === userId) || members.find((m) => !m.userId && matches(m));
  if (!existing) {
    const claimedByOther = members.find((m) => m.userId && m.userId !== userId && matches(m));
    if (claimedByOther) return c.json({ error: 'این جایگاه قبلاً به حساب دیگری وصل شده است' }, 409);
  }
  if (existing) {
    existing.userId = userId;
    if (guestKey) existing.guestKey = guestKey;
    await upsertMember(existing);
    const version = await bumpPeriodVersion(invite.periodId);
    return c.json({ memberId: existing.id, periodId: invite.periodId, version });
  }
  const memberName = parseRequiredDisplayName(displayName) || parseRequiredDisplayName(user.displayName);
  if (!memberName) return c.json({ error: 'نام نمایشی لازم است' }, 400);
  const memberId = nanoid();
  await upsertMember({
    id: memberId,
    periodId: invite.periodId,
    userId,
    guestKey,
    displayName: memberName,
    weightDefault: 1,
    role: 'member',
    phone: phone || undefined,
    email: email || undefined,
  });
  await notifyPeriodMembers(invite.periodId, userId, 'عضو جدید', `${memberName} به دوره پیوست`);
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
  if (friendUserId && friendUserId === userId) {
    return c.json({ error: 'نمی‌توانید خودتان را اضافه کنید' }, 400);
  }
  if (friendUserId && (await hasFriendByUserId(userId, friendUserId))) {
    return c.json({ error: 'این فرد از قبل در دوستام است' }, 409);
  }
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
  const nextFriendUserId = friendUserId !== undefined ? friendUserId : existing.friendUserId;
  if (nextFriendUserId && nextFriendUserId === userId) {
    return c.json({ error: 'نمی‌توانید خودتان را اضافه کنید' }, 400);
  }
  if (nextFriendUserId && nextFriendUserId !== existing.friendUserId && (await hasFriendByUserId(userId, nextFriendUserId))) {
    return c.json({ error: 'این فرد از قبل در دوستام است' }, 409);
  }
  const friend = {
    ...existing,
    displayName,
    phone: normalizeIranMobile(phone) || phone,
    email: normalizeEmail(email) || email,
    friendUserId: nextFriendUserId,
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
  const { periodId, mime, dataBase64 } = await c.req.json<{
    periodId: string;
    mime: string;
    dataBase64: string;
  }>();
  if (!periodId) return c.json({ error: 'دوره مشخص نیست' }, 400);
  // Same gate as expenses/payments/chat: members write, viewers do not.
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const attachBlocked = lifecycleWriteError(c, gate.period, gate.role, 'expense');
  if (attachBlocked) return attachBlocked;
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

app.get('/live', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const events = await waitForLiveEvents(userId, liveWaitMs(c.req.query('wait')), c.req.raw.signal);
  return c.json({ events });
});

app.post('/notifications/:id/read', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  await markNotificationRead(c.req.param('id'), userId);
  return c.json({ ok: true });
});

app.get('/push/vapid', (c) => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) return c.json({ error: 'پوش فعال نیست' }, 503);
  return c.json({ publicKey });
});

app.post('/push/subscribe', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  if (!getVapidPublicKey()) return c.json({ error: 'پوش فعال نیست' }, 503);
  const body = await c.req.json<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>();
  const endpoint = (body.endpoint || '').trim();
  const p256dh = (body.keys?.p256dh || '').trim();
  const auth = (body.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) return c.json({ error: 'سابسکریپشن نامعتبر است' }, 400);
  if (endpoint.length > 768) return c.json({ error: 'سابسکریپشن نامعتبر است' }, 400);
  await upsertSubscription({
    userId,
    endpoint,
    p256dh,
    auth,
    userAgent: c.req.header('User-Agent')?.slice(0, 255),
  });
  return c.json({ ok: true });
});

app.delete('/push/subscribe', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const fromQuery = c.req.query('endpoint');
  let endpoint = (fromQuery || '').trim();
  if (!endpoint) {
    const body = await c.req.json<{ endpoint?: string }>().catch(() => ({ endpoint: '' }));
    endpoint = (body.endpoint || '').trim();
  }
  if (!endpoint) return c.json({ error: 'سابسکریپشن نامعتبر است' }, 400);
  await deleteSubscription(endpoint, userId);
  return c.json({ ok: true });
});

app.post('/push/test', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  await insertNotification({
    userId,
    title: 'دونگ‌هام',
    body: 'نوتیفیکیشن آزمایشی',
    forceDisplay: true,
  });
  return c.json({ ok: true, push: Boolean(getVapidPublicKey()) });
});

app.post('/periods/:id/recurring', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const blocked = lifecycleWriteError(c, gate.period, gate.role, 'other');
  if (blocked) return blocked;
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
    nextAt?: string;
    active?: boolean;
  }>();
  const id = body.id || nanoid();
  const cadence = body.cadence || inferCadence(body.intervalDays);
  // Last write wins for the client's own schedule: a rule that just ran (or was paused) must not be
  // re-armed or re-activated by the sync upsert. Missing fields fall back to the old behaviour.
  const clientNextAt = body.nextAt && !Number.isNaN(Date.parse(body.nextAt)) ? new Date(body.nextAt).toISOString() : undefined;
  const nextAt = clientNextAt ?? nextRecurringAt(new Date().toISOString(), cadence, body.intervalDays);
  const active = typeof body.active === 'boolean' ? body.active : true;
  await upsertRecurring({
    id,
    periodId,
    title: body.title,
    amount: body.amount,
    currency: body.currency,
    payerId: body.payerId,
    splitMode: body.splitMode,
    shares: body.shares,
    intervalDays: body.intervalDays,
    cadence,
    nextAt,
    active,
  });
  const period = await getPeriod(periodId);
  return c.json({ id, nextAt, active, version: period?.version ?? 0 });
});

app.post('/periods/:id/recurring/run', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const blocked = lifecycleWriteError(c, gate.period, gate.role, 'expense');
  if (blocked) return blocked;
  const created: string[] = [];
  const due = await listDueRecurring(periodId);
  const period0 = due.length ? await getPeriod(periodId) : null;
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
      fxRate: await recurringFxRate(rule.currency, period0?.currency),
      createdAt: now,
      occurredAt: now,
      updatedAt: now,
      version: 1,
    }, { bump: false });
    rule.nextAt = nextRecurringAt(now, rule.cadence || 'days', rule.intervalDays);
    await upsertRecurring(rule, { bump: false });
    created.push(expenseId);
  }
  if (created.length) {
    await bumpPeriodVersion(periodId);
    if (gate.period.completedAt) await reopenPeriod(periodId);
  }
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
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const blocked = lifecycleWriteError(c, gate.period, gate.role, 'other');
  if (blocked) return blocked;
  const { id, senderMemberId, body, expenseId } = await c.req.json<{
    id?: string;
    senderMemberId: string;
    body: string;
    expenseId?: string;
  }>();
  const allowed = await actorMemberIds(gate.userId, periodId);
  if (senderMemberId && allowed.length && !allowed.includes(senderMemberId)) {
    return c.json({ error: 'فرستنده نامعتبر است' }, 403);
  }
  const sender = (senderMemberId && allowed.includes(senderMemberId) ? senderMemberId : allowed[0]) || '';
  if (!sender) return c.json({ error: 'جایگاه شما در این دوره پیدا نشد' }, 403);
  const msg = {
    id: id || nanoid(),
    periodId,
    senderMemberId: sender,
    body,
    expenseId,
    createdAt: new Date().toISOString(),
  };
  const inserted = await insertChat(msg);
  if (inserted) {
    await pushChatToPeriodMembers({
      periodId,
      exceptUserId: gate.userId,
      senderMemberId: sender,
      periodTitle: gate.period.title || '',
    });
  }
  const period = await getPeriod(periodId);
  return c.json({ message: msg, chat: msg, version: period?.version ?? 0 });
});

app.post('/periods/:id/activity', async (c) => {
  const periodId = c.req.param('id');
  const gate = await requireWrite(c, periodId);
  if ('error' in gate) return gate.error;
  const userId = gate.userId;
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
  const version = await bumpPeriodVersion(periodId);
  return c.json({ activity: row, version });
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

app.get('/billing/plans', (c) => c.json({ plans: skuPrices() }));

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

export default app;
