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
    const body = (await json(snap)) as { expenses: { title: string }[] };
    expect(body.expenses.some((e) => e.title === 'ناهار')).toBe(true);

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
});
