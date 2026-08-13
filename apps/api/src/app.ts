import type { Context, Next } from 'hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { nanoid } from 'nanoid';
import {
  createUser,
  findUserByEmail,
  findUserByPhone,
  hashPassword,
  isOtpMock,
  issueToken,
  loginWithGoogle,
  sendOtp,
  verifyOtp,
  verifyPassword,
  verifyToken,
} from './auth.js';
import { premiumUntilFromNow, verifyBazaarPurchase, verifyMyketPurchase } from './billing.js';
import { getDb, mutate } from './db.js';
import { getFxRates } from './fx.js';
import { handleTelegramUpdate, telegramSend } from './telegram.js';
import type { ActivityRecord, ExpenseRecord, MemberRole, PaymentRecord, PeriodKind, PeriodTemplate, RecurringCadence, RoundTo } from './types.js';
import { zarinpalRequest, zarinpalVerify } from './zarinpal.js';
import { inferCadence, nextRecurringAt } from '@dongham/ledger';

type Variables = {
  userId?: string;
  deviceId?: string;
};

export const app = new Hono<{ Variables: Variables }>();

app.use(
  '*',
  cors({
    origin: (origin) => {
      const allowed = (process.env.CORS_ORIGIN || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!allowed.length) return origin || '*';
      if (origin && allowed.includes(origin)) return origin;
      return allowed[0];
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
    }
  }
  await next();
}

app.use('*', authMiddleware);

function requireUser(c: Context<{ Variables: Variables }>): string | null {
  return c.get('userId') ?? null;
}

function canAccessPeriod(userId: string | null, periodId: string): boolean {
  if (!userId) return false;
  const db = getDb();
  const period = db.periods.find((p) => p.id === periodId);
  if (!period) return false;
  if (period.ownerId === userId) return true;
  return db.members.some((m) => m.periodId === periodId && m.userId === userId);
}

// ——— Auth ———
app.post('/auth/otp/request', async (c) => {
  const { phone } = await c.req.json<{ phone: string }>();
  if (!phone || !/^09\d{9}$/.test(phone)) {
    return c.json({ error: 'شماره موبایل نامعتبر است' }, 400);
  }
  const code = await sendOtp(phone);
  const body: Record<string, unknown> = { ok: true };
  if (isOtpMock()) body.devCode = code;
  return c.json(body);
});

app.post('/auth/otp/verify', async (c) => {
  const { phone, code, displayName, deviceId } = await c.req.json<{
    phone: string;
    code: string;
    displayName?: string;
    deviceId: string;
  }>();
  if (!verifyOtp(phone, code)) return c.json({ error: 'کد نامعتبر است' }, 400);
  let user = findUserByPhone(phone);
  if (!user) {
    user = createUser({ phone, displayName: displayName || `کاربر ${phone.slice(-4)}` });
  }
  const token = await issueToken(user.id, deviceId || nanoid());
  return c.json({ token, user });
});

app.post('/auth/register', async (c) => {
  const { email, password, displayName, deviceId } = await c.req.json<{
    email: string;
    password: string;
    displayName: string;
    deviceId: string;
  }>();
  if (!email || !password || password.length < 6) {
    return c.json({ error: 'ایمیل یا رمز نامعتبر است' }, 400);
  }
  if (findUserByEmail(email)) return c.json({ error: 'این ایمیل قبلاً ثبت شده' }, 409);
  const user = createUser({
    email,
    displayName: displayName || email.split('@')[0],
    passwordHash: await hashPassword(password),
  });
  const token = await issueToken(user.id, deviceId || nanoid());
  return c.json({ token, user });
});

app.post('/auth/login', async (c) => {
  const { email, password, deviceId } = await c.req.json<{
    email: string;
    password: string;
    deviceId: string;
  }>();
  const user = findUserByEmail(email);
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: 'ایمیل یا رمز اشتباه است' }, 401);
  }
  const token = await issueToken(user.id, deviceId || nanoid());
  return c.json({ token, user });
});

app.post('/auth/google', async (c) => {
  const { idToken, deviceId } = await c.req.json<{ idToken?: string; deviceId?: string }>();
  if (!idToken) return c.json({ error: 'توکن گوگل لازم است' }, 400);
  if (!process.env.GOOGLE_CLIENT_ID) {
    return c.json({ error: 'ورود گوگل پیکربندی نشده' }, 503);
  }
  try {
    const result = await loginWithGoogle(idToken, deviceId || nanoid());
    return c.json(result);
  } catch {
    return c.json({ error: 'ورود گوگل نامعتبر است' }, 401);
  }
});

app.get('/auth/me', (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const user = getDb().users.find((u) => u.id === userId && !u.deletedAt);
  if (!user) return c.json({ error: 'پیدا نشد' }, 404);
  return c.json({ user });
});

app.post('/auth/delete-account', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  mutate((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (u) {
      u.deletedAt = new Date().toISOString();
      u.phone = undefined;
      u.email = undefined;
      u.googleId = undefined;
      u.passwordHash = undefined;
      u.displayName = 'حساب حذف‌شده';
    }
    db.sessions = db.sessions.filter((s) => s.userId !== userId);
  });
  return c.json({ ok: true });
});

// ——— Periods & sync ———
app.get('/periods', (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const db = getDb();
  const memberPeriodIds = new Set(
    db.members.filter((m) => m.userId === userId).map((m) => m.periodId),
  );
  const periods = db.periods.filter((p) => memberPeriodIds.has(p.id) || p.ownerId === userId);
  return c.json({ periods });
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
  }>();
  const id = body.id || nanoid();
  const now = new Date().toISOString();
  const existing = getDb().periods.find((p) => p.id === id);
  if (existing) {
    mutate((db) => {
      const p = db.periods.find((x) => x.id === id)!;
      if (body.title) p.title = body.title;
      if (body.currency) p.currency = body.currency;
      if (body.kind) p.kind = body.kind;
      if (body.template) p.template = body.template;
      if (body.roundTo !== undefined) p.roundTo = body.roundTo;
      if (body.bankerMemberId) p.bankerMemberId = body.bankerMemberId;
      if (body.buildingCharge !== undefined) p.buildingCharge = body.buildingCharge;
      if (body.lunchTurnMemberId) p.lunchTurnMemberId = body.lunchTurnMemberId;
      if (body.encrypted !== undefined) p.encrypted = body.encrypted;
      p.updatedAt = now;
    });
    return c.json({ period: getDb().periods.find((p) => p.id === id) });
  }
  mutate((db) => {
    db.periods.push({
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
    });
    if (body.members?.length) {
      for (const m of body.members) {
        db.members.push({
          id: m.id || nanoid(),
          periodId: id,
          guestKey: m.guestKey,
          userId: m.userId || (m.role === 'owner' ? userId : undefined),
          displayName: m.displayName,
          weightDefault: m.weightDefault ?? 1,
          role: m.role || 'member',
          phone: m.phone,
          isPot: m.isPot,
        });
      }
    } else {
      db.members.push({
        id: nanoid(),
        periodId: id,
        userId,
        displayName: db.users.find((u) => u.id === userId)?.displayName || 'من',
        weightDefault: 1,
        role: 'owner',
      });
    }
  });
  return c.json({ period: getDb().periods.find((p) => p.id === id) });
});

app.get('/periods/:id/snapshot', (c) => {
  const userId = requireUser(c);
  const periodId = c.req.param('id');
  if (!canAccessPeriod(userId, periodId)) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const db = getDb();
  const period = db.periods.find((p) => p.id === periodId);
  if (!period) return c.json({ error: 'پیدا نشد' }, 404);
  return c.json({
    period,
    members: db.members.filter((m) => m.periodId === periodId),
    expenses: db.expenses.filter((e) => e.periodId === periodId && !e.deletedAt),
    payments: db.payments.filter((p) => p.periodId === periodId && !p.deletedAt),
    chat: db.chat.filter((m) => m.periodId === periodId),
    invites: db.invites.filter((i) => i.periodId === periodId),
    recurring: db.recurring.filter((r) => r.periodId === periodId),
    activity: (db.activity || []).filter((a) => a.periodId === periodId),
    version: period.version,
  });
});

app.post('/periods/:id/sync', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const periodId = c.req.param('id');
  const body = await c.req.json<{
    deviceId: string;
    baseVersion: number;
    ops: {
      entity: 'expense' | 'payment' | 'member' | 'chat' | 'period' | 'activity' | 'recurring';
      action: 'upsert' | 'delete';
      payload: Record<string, unknown>;
    }[];
  }>();

  const db = getDb();
  const period = db.periods.find((p) => p.id === periodId);
  if (!period) return c.json({ error: 'پیدا نشد' }, 404);

  const myRole: MemberRole =
    db.members.find((m) => m.periodId === periodId && m.userId === userId)?.role ||
    (period.ownerId === userId ? 'owner' : 'member');
  if (myRole === 'viewer' && (body.ops || []).length > 0) {
    return c.json({ error: 'نقش بیننده اجازهٔ تغییر ندارد' }, 403);
  }

  mutate((d) => {
    const p = d.periods.find((x) => x.id === periodId)!;
    for (const op of body.ops || []) {
      if (op.entity === 'expense') {
        const payload = op.payload as unknown as ExpenseRecord;
        if (op.action === 'delete') {
          const row = d.expenses.find((e) => e.id === payload.id);
          if (row) row.deletedAt = new Date().toISOString();
        } else {
          const idx = d.expenses.findIndex((e) => e.id === payload.id);
          const next = {
            ...payload,
            periodId,
            version: (payload.version || 0) + 1,
            updatedAt: new Date().toISOString(),
          };
          if (idx >= 0) d.expenses[idx] = { ...d.expenses[idx], ...next };
          else d.expenses.push(next as ExpenseRecord);
        }
      }
      if (op.entity === 'payment') {
        const payload = op.payload as unknown as PaymentRecord;
        if (op.action === 'delete') {
          const row = d.payments.find((e) => e.id === payload.id);
          if (row) row.deletedAt = new Date().toISOString();
        } else {
          const duplicatePending =
            payload.status === 'pending_confirm' &&
            d.payments.some(
              (e) =>
                e.periodId === periodId &&
                !e.deletedAt &&
                e.status === 'pending_confirm' &&
                e.fromMemberId === payload.fromMemberId &&
                e.toMemberId === payload.toMemberId &&
                e.id !== payload.id,
            );
          if (duplicatePending) continue;
          const idx = d.payments.findIndex((e) => e.id === payload.id);
          const next = {
            ...payload,
            periodId,
            version: (payload.version || 0) + 1,
            updatedAt: new Date().toISOString(),
          };
          if (idx >= 0) d.payments[idx] = { ...d.payments[idx], ...next };
          else d.payments.push(next as PaymentRecord);
        }
      }
      if (op.entity === 'member' && op.action === 'upsert') {
        const payload = op.payload as {
          id: string;
          displayName: string;
          guestKey?: string;
          userId?: string;
          phone?: string;
          role?: MemberRole;
          excludeFromNew?: boolean;
          isPot?: boolean;
          cardNumber?: string;
          sheba?: string;
          cardHolderName?: string;
          bankName?: string;
          unitLabel?: string;
          weightDefault?: number;
        };
        const existing = d.members.find((m) => m.id === payload.id);
        if (existing) {
          existing.displayName = payload.displayName;
          if (payload.userId) existing.userId = payload.userId;
          if (payload.phone !== undefined) existing.phone = payload.phone;
          if (payload.role) existing.role = payload.role;
          if (payload.excludeFromNew !== undefined) existing.excludeFromNew = payload.excludeFromNew;
          if (payload.isPot !== undefined) existing.isPot = payload.isPot;
          if (payload.cardNumber !== undefined) existing.cardNumber = payload.cardNumber;
          if (payload.sheba !== undefined) existing.sheba = payload.sheba;
          if (payload.cardHolderName !== undefined) existing.cardHolderName = payload.cardHolderName;
          if (payload.bankName !== undefined) existing.bankName = payload.bankName;
          if (payload.unitLabel !== undefined) existing.unitLabel = payload.unitLabel;
          if (payload.weightDefault !== undefined) existing.weightDefault = payload.weightDefault;
        } else {
          d.members.push({
            id: payload.id,
            periodId,
            displayName: payload.displayName,
            guestKey: payload.guestKey,
            userId: payload.userId,
            weightDefault: payload.weightDefault ?? 1,
            role: payload.role || 'member',
            phone: payload.phone,
            excludeFromNew: payload.excludeFromNew,
            isPot: payload.isPot,
            cardNumber: payload.cardNumber,
            sheba: payload.sheba,
            cardHolderName: payload.cardHolderName,
            bankName: payload.bankName,
            unitLabel: payload.unitLabel,
          });
        }
      }
      if (op.entity === 'chat' && op.action === 'upsert') {
        const payload = op.payload as {
          id: string;
          senderMemberId: string;
          body: string;
          expenseId?: string;
          createdAt?: string;
        };
        if (!d.chat.find((m) => m.id === payload.id)) {
          d.chat.push({
            id: payload.id,
            periodId,
            senderMemberId: payload.senderMemberId,
            body: payload.body,
            expenseId: payload.expenseId,
            createdAt: payload.createdAt || new Date().toISOString(),
          });
        }
      }
      if (op.entity === 'period' && op.action === 'upsert') {
        const payload = op.payload as {
          title?: string;
          currency?: string;
          kind?: PeriodKind;
          template?: PeriodTemplate;
          roundTo?: RoundTo;
          bankerMemberId?: string;
          buildingCharge?: number;
          lunchTurnMemberId?: string;
          encrypted?: boolean;
        };
        if (payload.title) p.title = payload.title;
        if (payload.currency) p.currency = payload.currency;
        if (payload.kind) p.kind = payload.kind;
        if (payload.template) p.template = payload.template;
        if (payload.roundTo !== undefined) p.roundTo = payload.roundTo;
        if (payload.bankerMemberId) p.bankerMemberId = payload.bankerMemberId;
        if (payload.buildingCharge !== undefined) p.buildingCharge = payload.buildingCharge;
        if (payload.lunchTurnMemberId) p.lunchTurnMemberId = payload.lunchTurnMemberId;
        if (payload.encrypted !== undefined) p.encrypted = payload.encrypted;
      }
      if (op.entity === 'activity' && op.action === 'upsert') {
        if (!d.activity) d.activity = [];
        const payload = op.payload as unknown as ActivityRecord;
        if (!d.activity.find((a) => a.id === payload.id)) {
          d.activity.push({
            id: payload.id,
            periodId,
            actorName: payload.actorName,
            action: payload.action,
            summary: payload.summary,
            createdAt: payload.createdAt || new Date().toISOString(),
          });
        }
      }
      if (op.entity === 'recurring' && op.action === 'upsert') {
        const payload = op.payload as {
          id: string;
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
        };
        const cadence = payload.cadence || inferCadence(payload.intervalDays);
        const row = {
          id: payload.id,
          periodId,
          title: payload.title,
          amount: payload.amount,
          currency: payload.currency,
          payerId: payload.payerId,
          splitMode: payload.splitMode,
          shares: payload.shares,
          intervalDays: payload.intervalDays,
          cadence,
          nextAt: payload.nextAt || nextRecurringAt(new Date().toISOString(), cadence, payload.intervalDays),
          active: payload.active !== false,
        };
        const idx = d.recurring.findIndex((r) => r.id === payload.id);
        if (idx >= 0) d.recurring[idx] = row;
        else d.recurring.push(row);
      }
    }
    p.version += 1;
    p.updatedAt = new Date().toISOString();

    // Notify other members
    for (const m of d.members.filter((x) => x.periodId === periodId && x.userId && x.userId !== userId)) {
      d.notifications.push({
        id: nanoid(),
        userId: m.userId!,
        title: 'به‌روزرسانی دوره',
        body: `دوره «${p.title}» به‌روز شد`,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
  });

  const snap = getDb();
  return c.json({
    version: snap.periods.find((p) => p.id === periodId)!.version,
    expenses: snap.expenses.filter((e) => e.periodId === periodId && !e.deletedAt),
    payments: snap.payments.filter((p) => p.periodId === periodId && !p.deletedAt),
    members: snap.members.filter((m) => m.periodId === periodId),
    chat: snap.chat.filter((m) => m.periodId === periodId),
    activity: (snap.activity || []).filter((a) => a.periodId === periodId),
    recurring: snap.recurring.filter((r) => r.periodId === periodId),
    period: snap.periods.find((p) => p.id === periodId),
  });
});

// ——— Invites ———
app.post('/periods/:id/invites', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const periodId = c.req.param('id');
  const token = nanoid(12);
  mutate((db) => {
    db.invites.push({
      token,
      periodId,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    });
  });
  return c.json({ token, url: `/i/${token}` });
});

app.get('/invites/:token', (c) => {
  const token = c.req.param('token');
  const invite = getDb().invites.find((i) => i.token === token);
  if (!invite) return c.json({ error: 'پیدا نشد' }, 404);
  const period = getDb().periods.find((p) => p.id === invite.periodId);
  const members = getDb().members.filter((m) => m.periodId === invite.periodId);
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
  const invite = getDb().invites.find((i) => i.token === token);
  if (!invite) return c.json({ error: 'پیدا نشد' }, 404);
  const existing = getDb().members.find(
    (m) =>
      m.periodId === invite.periodId &&
      (m.userId === userId || (guestKey && m.guestKey === guestKey)),
  );
  if (existing) return c.json({ memberId: existing.id, periodId: invite.periodId });
  const memberId = nanoid();
  mutate((db) => {
    db.members.push({
      id: memberId,
      periodId: invite.periodId,
      userId,
      guestKey,
      displayName: displayName || 'مهمان',
      weightDefault: 1,
      role: 'member',
    });
  });
  return c.json({ memberId, periodId: invite.periodId });
});

// ——— Friends ———
app.get('/friends', (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  return c.json({ friends: getDb().friends.filter((f) => f.userId === userId) });
});

app.post('/friends', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const { displayName, phone, friendUserId } = await c.req.json<{
    displayName: string;
    phone?: string;
    friendUserId?: string;
  }>();
  const friend = {
    id: nanoid(),
    userId,
    displayName,
    phone,
    friendUserId,
  };
  mutate((db) => db.friends.push(friend));
  return c.json({ friend });
});

// ——— Attachments ———
app.post('/attachments', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const { periodId, mime, dataBase64 } = await c.req.json<{
    periodId: string;
    mime: string;
    dataBase64: string;
  }>();
  if (!canAccessPeriod(userId, periodId)) return c.json({ error: 'وارد نشده‌اید' }, 401);
  if (!dataBase64 || dataBase64.length > 2_500_000) {
    return c.json({ error: 'فایل نامعتبر یا خیلی بزرگ است' }, 400);
  }
  const id = nanoid();
  mutate((db) => {
    db.attachments.push({
      id,
      periodId,
      mime,
      dataBase64,
      createdAt: new Date().toISOString(),
    });
  });
  return c.json({ id });
});

app.get('/attachments/:id', (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const row = getDb().attachments.find((a) => a.id === c.req.param('id'));
  if (!row) return c.json({ error: 'پیدا نشد' }, 404);
  if (!canAccessPeriod(userId, row.periodId)) return c.json({ error: 'وارد نشده‌اید' }, 401);
  return c.json(row);
});

// ——— Notifications ———
app.get('/notifications', (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  return c.json({
    notifications: getDb().notifications.filter((n) => n.userId === userId).slice(-50).reverse(),
  });
});

app.post('/notifications/:id/read', (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  mutate((db) => {
    const n = db.notifications.find((x) => x.id === c.req.param('id') && x.userId === userId);
    if (n) n.read = true;
  });
  return c.json({ ok: true });
});

// ——— Recurring ———
app.post('/periods/:id/recurring', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const periodId = c.req.param('id');
  const body = await c.req.json<{
    title: string;
    amount: number;
    currency: string;
    payerId: string;
    splitMode: ExpenseRecord['splitMode'];
    shares: ExpenseRecord['shares'];
    intervalDays: number;
    cadence?: RecurringCadence;
  }>();
  const id = nanoid();
  const cadence = body.cadence || inferCadence(body.intervalDays);
  const nextAt = nextRecurringAt(new Date().toISOString(), cadence, body.intervalDays);
  mutate((db) => {
    db.recurring.push({
      id,
      periodId,
      ...body,
      cadence,
      nextAt,
      active: true,
    });
  });
  return c.json({ id, nextAt });
});

app.post('/periods/:id/recurring/run', (c) => {
  const userId = requireUser(c);
  const periodId = c.req.param('id');
  if (!canAccessPeriod(userId, periodId)) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const created: string[] = [];
  mutate((db) => {
    const now = Date.now();
    for (const rule of db.recurring.filter((r) => r.periodId === periodId && r.active)) {
      if (new Date(rule.nextAt).getTime() > now) continue;
      const expenseId = nanoid();
      db.expenses.push({
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
        createdAt: new Date().toISOString(),
        occurredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      });
      rule.nextAt = nextRecurringAt(new Date().toISOString(), rule.cadence || 'days', rule.intervalDays);
      created.push(expenseId);
    }
  });
  return c.json({ created });
});

// ——— Chat ———
app.get('/periods/:id/chat', (c) => {
  const userId = requireUser(c);
  const periodId = c.req.param('id');
  if (!canAccessPeriod(userId, periodId)) return c.json({ error: 'وارد نشده‌اید' }, 401);
  return c.json({
    messages: getDb().chat.filter((m) => m.periodId === periodId),
  });
});

app.post('/periods/:id/chat', async (c) => {
  const userId = requireUser(c);
  const periodId = c.req.param('id');
  if (!canAccessPeriod(userId, periodId)) return c.json({ error: 'وارد نشده‌اید' }, 401);
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
  mutate((db) => db.chat.push(msg));
  return c.json({ message: msg });
});

app.get('/fx', async (c) => {
  const data = await getFxRates();
  return c.json(data);
});

app.post('/billing/bazaar/verify', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const { sku, purchaseToken } = await c.req.json<{ sku?: string; purchaseToken?: string }>();
  if (!sku || !purchaseToken) return c.json({ error: 'sku و توکن لازم است' }, 400);
  const result = await verifyBazaarPurchase({ sku, purchaseToken });
  if (!result.ok) return c.json({ error: result.error || 'تأیید نشد' }, 400);
  const until = premiumUntilFromNow(sku.includes('year') ? 365 : 30);
  mutate((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (u) {
      u.plan = 'premium';
      u.premiumUntil = until;
    }
  });
  const user = getDb().users.find((x) => x.id === userId);
  return c.json({ ok: true, user });
});

app.post('/billing/myket/verify', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const { sku, purchaseToken } = await c.req.json<{ sku?: string; purchaseToken?: string }>();
  if (!sku || !purchaseToken) return c.json({ error: 'sku و توکن لازم است' }, 400);
  const result = await verifyMyketPurchase({ sku, purchaseToken });
  if (!result.ok) return c.json({ error: result.error || 'تأیید نشد' }, 400);
  const until = premiumUntilFromNow(sku.includes('year') ? 365 : 30);
  mutate((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (u) {
      u.plan = 'premium';
      u.premiumUntil = until;
    }
  });
  const user = getDb().users.find((x) => x.id === userId);
  return c.json({ ok: true, user });
});

app.post('/billing/zarinpal/request', async (c) => {
  const userId = requireUser(c);
  if (!userId) return c.json({ error: 'وارد نشده‌اید' }, 401);
  const { sku } = await c.req.json<{ sku?: string }>();
  const chosen = sku || 'premium_monthly';
  try {
    const appUrl = process.env.APP_PUBLIC_URL || 'http://localhost:5173';
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
  const user = getDb().users.find((x) => x.id === userId);
  return c.json({ ok: true, user });
});

app.post('/telegram/webhook', async (c) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && c.req.header('X-Telegram-Bot-Api-Secret-Token') !== secret) {
    return c.json({ error: 'forbidden' }, 403);
  }
  const update = await c.req.json();
  const result = await handleTelegramUpdate(update);
  if (result.reply && update?.message?.chat?.id) {
    await telegramSend(update.message.chat.id, result.reply);
  }
  return c.json({ ok: true });
});

export default app;
