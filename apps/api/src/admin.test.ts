import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { app } from './app.js';
import { resetAdminRateLimits } from './admin.js';
import { getDb, initStore, mutate, resetDb } from './db.js';

async function json(res: Response) {
  return res.json();
}

async function adminLogin(phone = '09190755375') {
  const req = await app.request('/admin/auth/otp/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const body = (await json(req)) as { devCode?: string; error?: string };
  expect(req.status).toBe(200);
  expect(body.devCode).toMatch(/^\d{6}$/);
  const verify = await app.request('/admin/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: body.devCode, deviceId: 'admin-dev' }),
  });
  expect(verify.status).toBe(200);
  return json(verify) as Promise<{ token: string; user: { id: string; phone?: string } }>;
}

async function userLogin(phone: string) {
  const req = await app.request('/auth/otp/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const { devCode } = (await json(req)) as { devCode: string };
  const verify = await app.request('/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: devCode, displayName: 'کاربر', deviceId: 'user-dev' }),
  });
  return json(verify) as Promise<{ token: string; user: { id: string } }>;
}

describe('admin panel api', () => {
  beforeAll(async () => {
    await initStore();
  });

  beforeEach(async () => {
    await resetDb();
    resetAdminRateLimits();
    process.env.ADMIN_PHONES = '09190755375,09306057083';
  });

  it('rejects otp for a non-allowlisted phone', async () => {
    const res = await app.request('/admin/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09121234567' }),
    });
    expect(res.status).toBe(400);
    const body = (await json(res)) as { error?: string; devCode?: string };
    expect(body.devCode).toBeUndefined();
    expect(body.error).toBeTruthy();
  });

  it('rejects a regular 30d JWT on /admin/users', async () => {
    const { token } = await userLogin('09121234567');
    const res = await app.request('/admin/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it('lets an admin JWT list users and grant premium', async () => {
    const { token: userToken, user } = await userLogin('09120000000');
    expect(userToken).toBeTruthy();
    const { token } = await adminLogin();
    const list = await app.request('/admin/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(list.status).toBe(200);
    const listed = (await json(list)) as { total: number; items: { id: string }[] };
    expect(listed.total).toBeGreaterThanOrEqual(2);

    const prem = await app.request(`/admin/users/${user.id}/premium`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: 30 }),
    });
    expect(prem.status).toBe(200);
    const premBody = (await json(prem)) as { user: { plan: string; premiumUntil?: string } };
    expect(premBody.user.plan).toBe('premium');
    expect(premBody.user.premiumUntil).toBeTruthy();
  });

  it('bumps period version when admin edits an expense', async () => {
    const { token: userToken, user } = await userLogin('09121111111');
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'سفر', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string; version: number } };
    const memberId = (await getDb()).members.find((m) => m.periodId === period.id)?.id || user.id;

    const expRes = await app.request(`/periods/${period.id}/expenses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'exp-admin-1',
        title: 'ناهار',
        amount: 100000,
        currency: 'IRT',
        payerId: memberId,
        splitMode: 'equal',
        shares: [{ memberId, value: 1 }],
        tax: { type: 'none', value: 0 },
        tags: [],
        fxRate: 1,
        createdAt: new Date().toISOString(),
      }),
    });
    expect(expRes.status).toBe(200);
    const afterSync = (await json(expRes)) as { version: number };
    const before = afterSync.version;

    const { token: adminToken } = await adminLogin();
    const patch = await app.request(`/admin/periods/${period.id}/expenses/exp-admin-1`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'شام', amount: 150000 }),
    });
    expect(patch.status).toBe(200);
    const afterPatch = await getDb();
    const periodRow = afterPatch.periods.find((p) => p.id === period.id);
    expect(periodRow?.version).toBeGreaterThan(before);
    const expense = afterPatch.expenses.find((e) => e.id === 'exp-admin-1');
    expect(expense?.title).toBe('شام');
    expect(expense?.amount).toBe(150000);
  });

  it('issues a one-time impersonation code', async () => {
    const { user } = await userLogin('09123333333');
    const { token: adminToken } = await adminLogin();
    const imp = await app.request(`/admin/users/${user.id}/impersonate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(imp.status).toBe(200);
    const { code, appUrl } = (await json(imp)) as { code: string; appUrl: string };
    expect(code).toBeTruthy();
    expect(appUrl).toContain(code);

    const first = await app.request('/auth/impersonate/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, deviceId: 'imp-dev' }),
    });
    expect(first.status).toBe(200);
    const firstBody = (await json(first)) as { token: string; user: { id: string } };
    expect(firstBody.user.id).toBe(user.id);
    expect(firstBody.token).toBeTruthy();

    await mutate((d) => {
      const row = (d.impersonationTickets || []).find((t) => t.code === code);
      if (row) row.consumedAt = Date.now() - 20_000;
    });

    const second = await app.request('/auth/impersonate/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, deviceId: 'imp-dev-2' }),
    });
    expect(second.status).toBe(400);
  });

  it('does not treat an admin phone user JWT as an admin session', async () => {
    const { token } = await userLogin('09190755375');
    const res = await app.request('/admin/stats', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it('deletes a period and related ledger rows', async () => {
    const { token: userToken, user } = await userLogin('09124444444');
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'حذف‌شو', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };
    const memberId = (await getDb()).members.find((m) => m.periodId === period.id)?.id || user.id;
    await mutate((d) => {
      d.chat.push({
        id: 'chat-del-1',
        periodId: period.id,
        senderMemberId: memberId,
        body: 'سلام',
        createdAt: new Date().toISOString(),
      });
      d.invites.push({
        token: 'inv-del-1',
        periodId: period.id,
        createdBy: user.id,
        createdAt: new Date().toISOString(),
      });
      d.attachments.push({
        id: 'att-del-1',
        periodId: period.id,
        mime: 'image/png',
        dataBase64: 'xxxx',
        createdAt: new Date().toISOString(),
      });
      d.recurring.push({
        id: 'rec-del-1',
        periodId: period.id,
        title: 'آب',
        amount: 1000,
        currency: 'IRT',
        payerId: memberId,
        splitMode: 'equal',
        shares: [{ memberId, value: 1 }],
        intervalDays: 30,
        nextAt: new Date().toISOString(),
        active: true,
      });
    });

    const { token: adminToken } = await adminLogin();
    const del = await app.request(`/admin/periods/${period.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(del.status).toBe(200);
    const afterDel = await getDb();
    expect(afterDel.periods.find((p) => p.id === period.id)).toBeUndefined();
    expect(afterDel.members.some((m) => m.periodId === period.id)).toBe(false);
    expect(afterDel.chat.some((c) => c.periodId === period.id)).toBe(false);
    expect(afterDel.invites.some((i) => i.periodId === period.id)).toBe(false);
    expect(afterDel.attachments.some((a) => a.periodId === period.id)).toBe(false);
    expect(afterDel.recurring.some((r) => r.periodId === period.id)).toBe(false);
  });

  it('bans a user and rejects their JWT', async () => {
    const { token: userToken, user } = await userLogin('09125555555');
    const { token: adminToken } = await adminLogin();
    const ban = await app.request(`/admin/users/${user.id}/ban`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(ban.status).toBe(200);
    const banned = (await json(ban)) as { user: { bannedAt?: string } };
    expect(banned.user.bannedAt).toBeTruthy();
    const me = await app.request('/auth/me', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(me.status).toBe(401);
  }, 20_000);

  it('records a billingEvent after admin premium grant', async () => {
    const { user } = await userLogin('09126666666');
    const { token } = await adminLogin();
    const prem = await app.request(`/admin/users/${user.id}/premium`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: 30 }),
    });
    expect(prem.status).toBe(200);
    const events = (await getDb()).billingEvents || [];
    expect(events.some((e) => e.userId === user.id && e.source === 'admin')).toBe(true);
  });

  it('export omits passwordHash and otp codes', async () => {
    const { user } = await userLogin('09129990000');
    await mutate((d) => {
      const row = d.users.find((u) => u.id === user.id);
      if (row) {
        row.passwordHash = 'secret-hash';
        row.payoutMethods = [{ id: 'x', cardNumber: '6037991111111112' }];
      }
      d.otps.push({ phone: '09129990000', code: '654321', expiresAt: Date.now() + 60_000 });
    });
    const { token } = await adminLogin();
    const res = await app.request('/admin/export', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const packed = (await json(res)) as {
      format: string;
      version: number;
      kind: string;
      payload: {
        users: { passwordHash?: string }[];
        otps: { code?: string; phone: string }[];
      };
    };
    expect(packed.format).toBe('dongham');
    expect(packed.version).toBe(3);
    expect(packed.kind).toBe('server');
    const dump = packed.payload;
    expect(dump.users.every((u) => u.passwordHash === undefined)).toBe(true);
    expect(dump.otps.some((o) => o.phone === '09129990000')).toBe(true);
    expect(dump.otps.every((o) => o.code === undefined)).toBe(true);
    expect(JSON.stringify(dump)).not.toContain('654321');
    expect(JSON.stringify(dump)).not.toContain('6037991111111112');
    expect(dump.users.every((u) => !('payoutMethods' in u))).toBe(true);
    expect(JSON.stringify(dump)).not.toContain('secret-hash');
  });

  it('broadcasts a notification to all users', async () => {
    await userLogin('09127777777');
    await userLogin('09128888888');
    const { token } = await adminLogin();
    const res = await app.request('/admin/notifications', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true, title: 'اعلام', body: 'متن همگانی' }),
    });
    expect(res.status).toBe(200);
    const body = (await json(res)) as { sent: number };
    const afterNotif = await getDb();
    const active = afterNotif.users.filter((u) => !u.deletedAt).length;
    expect(body.sent).toBe(active);
    expect(afterNotif.notifications.filter((n) => n.title === 'اعلام').length).toBe(active);
  });

  it('keeps period.ownerId and member.role in sync', async () => {
    const { token: ownerToken, user: owner } = await userLogin('09120101010');
    const { token: memberToken, user: other } = await userLogin('09120101011');
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'مالک', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };
    await mutate((d) => {
      const m = d.members.find((row) => row.periodId === period.id);
      if (m) m.userId = owner.id;
      d.members.push({
        id: 'm-other',
        periodId: period.id,
        displayName: 'عضو',
        userId: other.id,
        role: 'member',
        weightDefault: 1,
      });
    });
    const { token: adminToken } = await adminLogin();
    const patch = await app.request(`/admin/periods/${period.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId: other.id }),
    });
    expect(patch.status).toBe(200);
    const storedDb = await getDb();
    const stored = storedDb.periods.find((p) => p.id === period.id);
    expect(stored?.ownerId).toBe(other.id);
    expect(storedDb.members.find((m) => m.userId === other.id && m.periodId === period.id)?.role).toBe('owner');
    expect(storedDb.members.find((m) => m.userId === owner.id && m.periodId === period.id)?.role).toBe('member');
    void memberToken;
  });
});
