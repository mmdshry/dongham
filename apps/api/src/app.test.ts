import { describe, expect, it, beforeEach } from 'vitest';
import { app } from './app.js';
import { resetDb } from './db.js';

async function json(res: Response) {
  return res.json();
}

describe('api auth & sync', () => {
  beforeEach(() => resetDb());

  it('health', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('otp flow and period sync', async () => {
    const req = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09121234567' }),
    });
    const { devCode } = (await json(req)) as { devCode: string };
    expect(devCode).toMatch(/^\d{6}$/);

    const verify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '09121234567',
        code: devCode,
        displayName: 'علی',
        deviceId: 'dev1',
      }),
    });
    const { token, user } = (await json(verify)) as { token: string; user: { id: string } };
    expect(token).toBeTruthy();

    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: 'سفر شمال', currency: 'IRR' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };

    const inviteRes = await app.request(`/periods/${period.id}/invites`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const { token: inviteToken } = (await json(inviteRes)) as { token: string };
    expect(inviteToken).toBeTruthy();

    const syncRes = await app.request(`/periods/${period.id}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        deviceId: 'dev1',
        baseVersion: 1,
        ops: [
          {
            entity: 'expense',
            action: 'upsert',
            payload: {
              id: 'exp1',
              title: 'ناهار',
              amount: 300000,
              currency: 'IRR',
              payerId: user.id,
              splitMode: 'equal',
              shares: [{ memberId: user.id, value: 1 }],
              tax: { type: 'none', value: 0 },
              tags: [],
              fxRate: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              version: 0,
            },
          },
        ],
      }),
    });
    expect(syncRes.status).toBe(200);
    const snap = (await json(syncRes)) as { expenses: unknown[] };
    expect(snap.expenses.length).toBe(1);
  });

  it('returns fx rates with source and missing', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    try {
      const res = await app.request('/fx');
      expect(res.status).toBe(200);
      const body = (await json(res)) as { rates: Record<string, number>; source: string; missing: string[] };
      expect(typeof body.source).toBe('string');
      expect(Array.isArray(body.missing)).toBe(true);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('rejects invalid google token', async () => {
    const prev = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
    const res = await app.request('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'not-a-real-jwt', deviceId: 'd1' }),
    });
    expect(res.status).toBe(401);
    if (prev === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = prev;
  });

  it('rejects viewer mutations and accepts bazaar dev token', async () => {
    const req = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09120000000' }),
    });
    const { devCode } = (await json(req)) as { devCode: string };
    const verify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09120000000', code: devCode, displayName: 'مالک', deviceId: 'd1' }),
    });
    const { token, user } = (await json(verify)) as { token: string; user: { id: string } };

    const req2 = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09121111111' }),
    });
    const { devCode: code2 } = (await json(req2)) as { devCode: string };
    const verify2 = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09121111111', code: code2, displayName: 'بیننده', deviceId: 'd2' }),
    });
    const { token: token2, user: user2 } = (await json(verify2)) as { token: string; user: { id: string } };

    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'خانه', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };

    await app.request(`/periods/${period.id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: 'd1',
        baseVersion: 1,
        ops: [
          {
            entity: 'member',
            action: 'upsert',
            payload: { id: 'viewer-m', displayName: 'بیننده', userId: user2.id, role: 'viewer' },
          },
        ],
      }),
    });

    const denied = await app.request(`/periods/${period.id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` },
      body: JSON.stringify({
        deviceId: 'd2',
        baseVersion: 2,
        ops: [
          {
            entity: 'expense',
            action: 'upsert',
            payload: {
              id: 'x',
              title: 'ممنوع',
              amount: 1,
              currency: 'IRT',
              payerId: user.id,
              splitMode: 'equal',
              shares: [{ memberId: user.id, value: 1 }],
              tax: { type: 'none', value: 0 },
              tags: [],
              fxRate: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              version: 0,
            },
          },
        ],
      }),
    });
    expect(denied.status).toBe(403);

    const bill = await app.request('/billing/bazaar/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sku: 'premium_monthly', purchaseToken: 'dev-test' }),
    });
    expect(bill.status).toBe(200);
    const billed = (await json(bill)) as { user: { plan: string } };
    expect(billed.user.plan).toBe('premium');
  });

  it('accepts zarinpal and myket dev billing', async () => {
    const req = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09123333333' }),
    });
    const { devCode } = (await json(req)) as { devCode: string };
    const verify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09123333333', code: devCode, displayName: 'وب', deviceId: 'w1' }),
    });
    const { token } = (await json(verify)) as { token: string };

    const reqPay = await app.request('/billing/zarinpal/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sku: 'premium_yearly' }),
    });
    expect(reqPay.status).toBe(200);
    const { authority } = (await json(reqPay)) as { authority: string };
    expect(authority.startsWith('dev-')).toBe(true);

    const ver = await app.request('/billing/zarinpal/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ authority, status: 'OK' }),
    });
    expect(ver.status).toBe(200);

    const myket = await app.request('/billing/myket/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sku: 'premium_monthly', purchaseToken: 'dev-myket' }),
    });
    expect(myket.status).toBe(200);
  });

  it('telegram bot links period and parses expense', async () => {
    const req = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09124444444' }),
    });
    const { devCode } = (await json(req)) as { devCode: string };
    const verify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09124444444', code: devCode, displayName: 'علی', deviceId: 'tg1' }),
    });
    const { token } = (await json(verify)) as { token: string };
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'گروه تلگرام', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };
    const inviteRes = await app.request(`/periods/${period.id}/invites`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const { token: inviteToken } = (await json(inviteRes)) as { token: string };

    const start = await app.request('/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { chat: { id: 99, type: 'group' }, text: '/start' } }),
    });
    expect(start.status).toBe(200);

    await app.request('/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { chat: { id: 99, type: 'group' }, text: `/link ${inviteToken}` } }),
    });

    const exp = await app.request('/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { chat: { id: 99, type: 'group' }, text: 'علی ناهار ۵۰۰۰۰۰' } }),
    });
    expect(exp.status).toBe(200);
    const snap = await app.request(`/periods/${period.id}/snapshot`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await json(snap)) as { expenses: { title: string }[]; version: number };
    expect(body.expenses.some((e) => e.title === 'ناهار')).toBe(true);
    expect(body.version).toBe(2);

    const { handleTelegramUpdate } = await import('./telegram.js');
    const bal = await handleTelegramUpdate({
      message: { chat: { id: 99, type: 'group' }, text: '/balance' },
    });
    expect(bal.reply).toMatch(/طلبکار|بدهکار|تسویه/);
  });

  it('ignores duplicate pending_confirm payments for the same from-to pair', async () => {
    const req = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09125555555' }),
    });
    const { devCode } = (await json(req)) as { devCode: string };
    const verify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09125555555', code: devCode, displayName: 'هادی', deviceId: 'pay1' }),
    });
    const { token } = (await json(verify)) as { token: string };
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'تسویه', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };

    const pendingPayload = {
      periodId: period.id,
      fromMemberId: 'hadi',
      toMemberId: 'vahid',
      amount: 1000,
      currency: 'IRT',
      kind: 'settlement',
      fxRate: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 0,
      status: 'pending_confirm',
    };

    const first = await app.request(`/periods/${period.id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: 'pay1',
        baseVersion: 1,
        ops: [{ entity: 'payment', action: 'upsert', payload: { ...pendingPayload, id: 'pay-a' } }],
      }),
    });
    expect(first.status).toBe(200);

    const second = await app.request(`/periods/${period.id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: 'pay1',
        baseVersion: 2,
        ops: [{ entity: 'payment', action: 'upsert', payload: { ...pendingPayload, id: 'pay-b' } }],
      }),
    });
    expect(second.status).toBe(200);
    const dupBody = (await json(second)) as { payments: { id: string }[] };
    expect(dupBody.payments.map((p) => p.id)).toEqual(['pay-a']);

    const otherEdge = await app.request(`/periods/${period.id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: 'pay1',
        baseVersion: 3,
        ops: [
          {
            entity: 'payment',
            action: 'upsert',
            payload: { ...pendingPayload, id: 'pay-c', toMemberId: 'sara' },
          },
        ],
      }),
    });
    expect(otherEdge.status).toBe(200);
    const otherBody = (await json(otherEdge)) as { payments: { id: string }[] };
    expect(otherBody.payments.map((p) => p.id).sort()).toEqual(['pay-a', 'pay-c']);
  });

  it('accepts persian digits for otp and claims listed memberships', async () => {
    const ownerReq = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '۰۹۱۲۱۱۱۱۱۱۱' }),
    });
    const { devCode: ownerCode } = (await json(ownerReq)) as { devCode: string };
    const ownerVerify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '۰۹۱۲۱۱۱۱۱۱۱',
        code: ownerCode.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]),
        displayName: 'مالک',
        deviceId: 'own1',
      }),
    });
    const { token } = (await json(ownerVerify)) as { token: string };
    expect(token).toBeTruthy();

    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: 'سفر دوستان',
        currency: 'IRT',
        members: [
          { id: 'm-owner', displayName: 'مالک', role: 'owner' },
          { id: 'm-sara', displayName: 'سارا', phone: '۰۹۱۲۲۲۲۲۲۲۲' },
        ],
      }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };
    expect(period.id).toBeTruthy();

    const saraReq = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09122222222' }),
    });
    const { devCode: saraCode } = (await json(saraReq)) as { devCode: string };
    const saraVerify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '09122222222',
        code: saraCode,
        displayName: 'سارا',
        deviceId: 'sara1',
      }),
    });
    const { token: saraToken } = (await json(saraVerify)) as { token: string };
    const listed = await app.request('/periods', {
      headers: { Authorization: `Bearer ${saraToken}` },
    });
    const { periods } = (await json(listed)) as { periods: { id: string }[] };
    expect(periods.map((p) => p.id)).toContain(period.id);
  });

  it('uses short period ids, hides private snapshots, and allows public read', async () => {
    const req = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09120001111' }),
    });
    const { devCode } = (await json(req)) as { devCode: string };
    const verify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '09120001111',
        code: devCode,
        displayName: 'مالک',
        deviceId: 'd-vis',
      }),
    });
    const { token } = (await json(verify)) as { token: string };
    const privateRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'خصوصی', visibility: 'private' }),
    });
    const { period } = (await json(privateRes)) as { period: { id: string; visibility: string } };
    expect(period.id).toMatch(/^[0-9A-Za-z]{3}-[0-9A-Za-z]{3}$/);
    expect(period.visibility).toBe('private');
    expect((await app.request(`/periods/${period.id}/snapshot`)).status).toBe(404);
    const flipped = period.id.replace(/[A-Za-z]/g, (ch) =>
      ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase(),
    );
    if (flipped !== period.id) {
      expect(
        (
          await app.request(`/periods/${flipped}/snapshot`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).status,
      ).toBe(404);
    }
    const publicRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'عمومی', visibility: 'public' }),
    });
    const { period: pub } = (await json(publicRes)) as { period: { id: string } };
    expect((await app.request(`/periods/${pub.id}/snapshot`)).status).toBe(200);
  });

  it('keeps friend ids on create and supports edit/delete', async () => {
    const req = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09120002222' }),
    });
    const { devCode } = (await json(req)) as { devCode: string };
    const verify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '09120002222',
        code: devCode,
        displayName: 'میزبان',
        deviceId: 'd-fr',
      }),
    });
    const { token } = (await json(verify)) as { token: string };
    const created = await app.request('/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: 'friend-1', displayName: 'هادی', phone: '09120000000' }),
    });
    const { friend } = (await json(created)) as { friend: { id: string; displayName: string } };
    expect(friend.id).toBe('friend-1');
    const updated = await app.request('/friends/friend-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: 'هادی ویرایش' }),
    });
    expect(updated.status).toBe(200);
    const listed = await app.request('/friends', { headers: { Authorization: `Bearer ${token}` } });
    const { friends } = (await json(listed)) as { friends: { displayName: string }[] };
    expect(friends[0]?.displayName).toBe('هادی ویرایش');
    const removed = await app.request('/friends/friend-1', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(removed.status).toBe(200);
  });

  it('rejects duplicate friend phone or email', async () => {
    const req = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09120003333' }),
    });
    const { devCode } = (await json(req)) as { devCode: string };
    const verify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '09120003333',
        code: devCode,
        displayName: 'میزبان',
        deviceId: 'd-fr-dup',
      }),
    });
    const { token } = (await json(verify)) as { token: string };
    const first = await app.request('/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: 'friend-a', displayName: 'هادی', phone: '09121111111', email: 'a@ex.com' }),
    });
    expect(first.status).toBe(200);
    const dupPhone = await app.request('/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: 'علی', phone: '+989121111111' }),
    });
    expect(dupPhone.status).toBe(409);
    const other = await app.request('/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: 'friend-b', displayName: 'سارا', phone: '09122222222' }),
    });
    expect(other.status).toBe(200);
    const dupEmail = await app.request('/friends/friend-b', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: 'سارا', email: 'A@ex.com' }),
    });
    expect(dupEmail.status).toBe(409);
  });

  it('accepts a valid jwt after sessions are lost', async () => {
    const req = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09120004444' }),
    });
    const { devCode } = (await json(req)) as { devCode: string };
    const verify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '09120004444',
        code: devCode,
        displayName: 'میزبان',
        deviceId: 'd-heal',
      }),
    });
    const { token } = (await json(verify)) as { token: string };
    const { mutate } = await import('./db.js');
    mutate((d) => {
      d.sessions = [];
    });
    const listed = await app.request('/friends', { headers: { Authorization: `Bearer ${token}` } });
    expect(listed.status).toBe(200);
  });
});

async function signup(phone: string, displayName: string, deviceId: string) {
  const req = await app.request('/auth/otp/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const { devCode } = (await json(req)) as { devCode: string };
  const verify = await app.request('/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: devCode, displayName, deviceId }),
  });
  return json(verify) as Promise<{ token: string; user: { id: string } }>;
}

function expenseOp(id: string, title: string, extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    entity: 'expense' as const,
    action: 'upsert' as const,
    payload: {
      id,
      title,
      amount: 1000,
      currency: 'IRT',
      payerId: 'payer',
      splitMode: 'equal',
      shares: [{ memberId: 'payer', value: 1 }],
      tax: { type: 'none', value: 0 },
      tags: [],
      fxRate: 1,
      createdAt: now,
      updatedAt: now,
      version: 0,
      ...extra,
    },
  };
}

describe('period conflict and tombstones', () => {
  beforeEach(() => resetDb());

  it('returns 409 with snapshot when baseVersion is stale, then accepts retry', async () => {
    const { token } = await signup('09120001001', 'مالک', 'dev-a');
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'تداخل', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string; version: number } };
    expect(period.version).toBe(1);

    const first = await app.request(`/periods/${period.id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: 'dev-a',
        baseVersion: 1,
        ops: [expenseOp('exp-server', 'از دستگاه دیگر')],
      }),
    });
    expect(first.status).toBe(200);
    const firstBody = (await json(first)) as { version: number };
    expect(firstBody.version).toBe(2);

    const conflicted = await app.request(`/periods/${period.id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: 'dev-b',
        baseVersion: 1,
        ops: [expenseOp('exp-local', 'تغییر لوکال')],
      }),
    });
    expect(conflicted.status).toBe(409);
    const conflictBody = (await json(conflicted)) as {
      serverVersion: number;
      snapshot: { expenses: { id: string }[]; version: number };
    };
    expect(conflictBody.serverVersion).toBe(2);
    expect(conflictBody.snapshot.expenses.map((e) => e.id)).toContain('exp-server');
    expect(conflictBody.snapshot.expenses.map((e) => e.id)).not.toContain('exp-local');

    const retry = await app.request(`/periods/${period.id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: 'dev-b',
        baseVersion: conflictBody.serverVersion,
        ops: [expenseOp('exp-local', 'تغییر لوکال')],
      }),
    });
    expect(retry.status).toBe(200);
    const retryBody = (await json(retry)) as { version: number; expenses: { id: string }[] };
    expect(retryBody.version).toBe(3);
    expect(retryBody.expenses.map((e) => e.id).sort()).toEqual(['exp-local', 'exp-server']);
  });

  it('includes soft-deleted expenses in snapshots', async () => {
    const { token } = await signup('09120001002', 'مالک', 'dev-del');
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'حذف', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };

    await app.request(`/periods/${period.id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: 'dev-del',
        baseVersion: 1,
        ops: [expenseOp('exp-gone', 'حذف می‌شود')],
      }),
    });

    const del = await app.request(`/periods/${period.id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: 'dev-del',
        baseVersion: 2,
        ops: [{ entity: 'expense', action: 'delete', payload: { id: 'exp-gone' } }],
      }),
    });
    expect(del.status).toBe(200);
    const delBody = (await json(del)) as { expenses: { id: string; deletedAt?: string }[] };
    const deleted = delBody.expenses.find((e) => e.id === 'exp-gone');
    expect(deleted?.deletedAt).toBeTruthy();

    const snap = await app.request(`/periods/${period.id}/snapshot`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const snapBody = (await json(snap)) as { expenses: { id: string; deletedAt?: string }[] };
    expect(snapBody.expenses.find((e) => e.id === 'exp-gone')?.deletedAt).toBeTruthy();
  });

  it('bumps period version on invite join and recurring run', async () => {
    const { token } = await signup('09120001003', 'مالک', 'dev-own');
    const { token: guestToken } = await signup('09120001004', 'مهمان', 'dev-guest');
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'دعوت', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string; version: number } };
    expect(period.version).toBe(1);

    const inviteRes = await app.request(`/periods/${period.id}/invites`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const { token: inviteToken } = (await json(inviteRes)) as { token: string };

    const join = await app.request(`/invites/${inviteToken}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guestToken}` },
      body: JSON.stringify({ displayName: 'مهمان' }),
    });
    expect(join.status).toBe(200);

    const afterJoin = await app.request(`/periods/${period.id}/snapshot`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const joinSnap = (await json(afterJoin)) as { version: number };
    expect(joinSnap.version).toBe(2);

    const rule = await app.request(`/periods/${period.id}/recurring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: 'شارژ',
        amount: 100,
        currency: 'IRT',
        payerId: 'payer',
        splitMode: 'equal',
        shares: [{ memberId: 'payer', value: 1 }],
        intervalDays: 30,
      }),
    });
    expect(rule.status).toBe(200);
    const afterRule = await app.request(`/periods/${period.id}/snapshot`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ruleSnap = (await json(afterRule)) as { version: number; recurring: { id: string }[] };
    expect(ruleSnap.version).toBe(3);

    const { mutate } = await import('./db.js');
    mutate((d) => {
      const row = d.recurring.find((r) => r.periodId === period.id);
      if (row) row.nextAt = new Date(Date.now() - 1000).toISOString();
    });

    const run = await app.request(`/periods/${period.id}/recurring/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(run.status).toBe(200);
    const runBody = (await json(run)) as { created: string[] };
    expect(runBody.created.length).toBe(1);

    const afterRun = await app.request(`/periods/${period.id}/snapshot`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const runSnap = (await json(afterRun)) as { version: number };
    expect(runSnap.version).toBe(4);
  });
});
