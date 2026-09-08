import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { app } from './app.js';
import { getDb, initStore, mutate, resetDb } from './db.js';

async function json(res: Response) {
  return res.json();
}

describe('api auth & sync', () => {
  beforeAll(async () => {
    await initStore();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it('health', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('requires a real display name for new otp and email users', async () => {
    const otpReq = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09120000001' }),
    });
    const { devCode } = (await json(otpReq)) as { devCode: string };
    const missing = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09120000001', code: devCode, deviceId: 'need-name' }),
    });
    expect(missing.status).toBe(400);
    const placeholder = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '09120000001',
        code: devCode,
        displayName: 'من',
        deviceId: 'need-name',
      }),
    });
    expect(placeholder.status).toBe(400);
    const email = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'noname@example.com',
        password: 'secret1',
        displayName: '  ',
        deviceId: 'mail-need-name',
      }),
    });
    expect(email.status).toBe(400);
  });

  it('lets an existing otp user log in without sending a display name', async () => {
    const firstReq = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09120000002' }),
    });
    const { devCode: firstCode } = (await json(firstReq)) as { devCode: string };
    const created = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '09120000002',
        code: firstCode,
        displayName: 'محمد',
        deviceId: 'exist-1',
      }),
    });
    expect(created.status).toBe(200);
    const secondReq = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09120000002' }),
    });
    const { devCode: secondCode } = (await json(secondReq)) as { devCode: string };
    const login = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09120000002', code: secondCode, deviceId: 'exist-2' }),
    });
    expect(login.status).toBe(200);
    const body = (await json(login)) as { user: { displayName: string } };
    expect(body.user.displayName).toBe('محمد');
  });

  it('email otp signs up a new user and logs the same mailbox in again', async () => {
    const req = await app.request('/auth/email-otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'otp-new@example.com' }),
    });
    expect(req.status).toBe(200);
    const { devCode } = (await json(req)) as { devCode: string };
    expect(devCode).toMatch(/^\d{6}$/);
    const missing = await app.request('/auth/email-otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'otp-new@example.com', code: devCode, deviceId: 'mail-otp-1' }),
    });
    expect(missing.status).toBe(400);
    const created = await app.request('/auth/email-otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'otp-new@example.com',
        code: devCode,
        displayName: 'مینا',
        deviceId: 'mail-otp-1',
      }),
    });
    expect(created.status).toBe(200);
    const createdBody = (await json(created)) as { user: { email?: string; displayName: string } };
    expect(createdBody.user.email).toBe('otp-new@example.com');
    expect(createdBody.user.displayName).toBe('مینا');

    const again = await app.request('/auth/email-otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'OTP-new@example.com' }),
    });
    const { devCode: second } = (await json(again)) as { devCode: string };
    const login = await app.request('/auth/email-otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'OTP-new@example.com', code: second, deviceId: 'mail-otp-2' }),
    });
    expect(login.status).toBe(200);
    expect(((await json(login)) as { user: { displayName: string } }).user.displayName).toBe('مینا');
  });

  it('links email onto a phone account and phone onto an email account', async () => {
    const phoneReq = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09123330001' }),
    });
    const { devCode: sms } = (await json(phoneReq)) as { devCode: string };
    const phoneLogin = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '09123330001',
        code: sms,
        displayName: 'علی',
        deviceId: 'link-phone-1',
      }),
    });
    const phoneSession = (await json(phoneLogin)) as { token: string; user: { phone?: string; email?: string } };
    expect(phoneSession.user.phone).toBe('09123330001');
    expect(phoneSession.user.email).toBeUndefined();

    const emailLinkReq = await app.request('/auth/link/email/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${phoneSession.token}` },
      body: JSON.stringify({ email: 'ali-link@example.com' }),
    });
    expect(emailLinkReq.status).toBe(200);
    const { devCode: emailCode } = (await json(emailLinkReq)) as { devCode: string };
    const emailLink = await app.request('/auth/link/email/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${phoneSession.token}` },
      body: JSON.stringify({ email: 'ali-link@example.com', code: emailCode }),
    });
    expect(emailLink.status).toBe(200);
    const linkedEmail = (await json(emailLink)) as { user: { phone?: string; email?: string } };
    expect(linkedEmail.user.phone).toBe('09123330001');
    expect(linkedEmail.user.email).toBe('ali-link@example.com');

    const emailOtpReq = await app.request('/auth/email-otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ali-link@example.com' }),
    });
    const { devCode: emailLoginCode } = (await json(emailOtpReq)) as { devCode: string };
    const emailLogin = await app.request('/auth/email-otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ali-link@example.com', code: emailLoginCode, deviceId: 'link-mail-login' }),
    });
    expect(emailLogin.status).toBe(200);
    expect(((await json(emailLogin)) as { user: { phone?: string } }).user.phone).toBe('09123330001');

    const register = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'sara-link@example.com',
        password: 'secret1',
        displayName: 'سارا',
        deviceId: 'link-mail-1',
      }),
    });
    const mailSession = (await json(register)) as { token: string };
    const phoneLinkReq = await app.request('/auth/link/phone/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mailSession.token}` },
      body: JSON.stringify({ phone: '09123330002' }),
    });
    expect(phoneLinkReq.status).toBe(200);
    const { devCode: phoneCode } = (await json(phoneLinkReq)) as { devCode: string };
    const phoneLink = await app.request('/auth/link/phone/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mailSession.token}` },
      body: JSON.stringify({ phone: '09123330002', code: phoneCode }),
    });
    expect(phoneLink.status).toBe(200);
    expect(((await json(phoneLink)) as { user: { phone?: string; email?: string } }).user.phone).toBe('09123330002');

    const smsLoginReq = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09123330002' }),
    });
    const { devCode: smsLogin } = (await json(smsLoginReq)) as { devCode: string };
    const smsLoginRes = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09123330002', code: smsLogin, deviceId: 'link-sms-login' }),
    });
    expect(smsLoginRes.status).toBe(200);
    expect(((await json(smsLoginRes)) as { user: { email?: string } }).user.email).toBe('sara-link@example.com');
  });

  it('rejects linking an identity that already belongs to another account', async () => {
    const mail = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'taken@example.com',
        password: 'secret1',
        displayName: 'صاحب ایمیل',
        deviceId: 'taken-mail',
      }),
    });
    expect(mail.status).toBe(200);

    const phoneReq = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09123330003' }),
    });
    const { devCode } = (await json(phoneReq)) as { devCode: string };
    const phoneLogin = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '09123330003',
        code: devCode,
        displayName: 'صاحب شماره',
        deviceId: 'taken-phone',
      }),
    });
    const { token } = (await json(phoneLogin)) as { token: string };
    const conflict = await app.request('/auth/link/email/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: 'taken@example.com' }),
    });
    expect(conflict.status).toBe(409);

    const mailSession = (await json(mail)) as { token: string };
    const phoneConflict = await app.request('/auth/link/phone/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mailSession.token}` },
      body: JSON.stringify({ phone: '09123330003' }),
    });
    expect(phoneConflict.status).toBe(409);
  });

  it('rejects identity link routes without a session', async () => {
    const email = await app.request('/auth/link/email/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'no-auth@example.com' }),
    });
    expect(email.status).toBe(401);
    const phone = await app.request('/auth/link/phone/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09123330009' }),
    });
    expect(phone.status).toBe(401);
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

    const expRes = await app.request(`/periods/${period.id}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
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
      }),
    });
    expect(expRes.status).toBe(200);
    const pull = await app.request(`/periods/${period.id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ deviceId: 'dev1' }),
    });
    expect(pull.status).toBe(200);
    const snap = (await json(pull)) as { expenses: unknown[] };
    expect(snap.expenses.length).toBe(1);

    const rejected = await app.request(`/periods/${period.id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: 'dev1',
        ops: [{ entity: 'expense', action: 'upsert', payload: { id: 'x' } }],
      }),
    });
    expect(rejected.status).toBe(410);
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

  it('rejects viewer mutations', async () => {
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

    await app.request(`/periods/${period.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: 'viewer-m', displayName: 'بیننده', userId: user2.id, role: 'viewer' }),
    });

    const denied = await app.request(`/periods/${period.id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` },
      body: JSON.stringify({
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
      }),
    });
    expect(denied.status).toBe(403);

    // Attachments and recurring/run share the same write gate as expenses.
    const deniedAttachment = await app.request('/attachments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` },
      body: JSON.stringify({ periodId: period.id, mime: 'image/png', dataBase64: 'aGk=' }),
    });
    expect(deniedAttachment.status).toBe(403);
    const deniedRun = await app.request(`/periods/${period.id}/recurring/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` },
    });
    expect(deniedRun.status).toBe(403);
    // Public-period snapshot must not hand invite tokens to non-members.
    await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: period.id, title: 'خانه', currency: 'IRT', visibility: 'public' }),
    });
    await app.request(`/periods/${period.id}/invites`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const ownerSnap = (await json(
      await app.request(`/periods/${period.id}/snapshot`, { headers: { Authorization: `Bearer ${token}` } }),
    )) as { invites: unknown[] };
    expect(ownerSnap.invites.length).toBe(1);
    const anonSnap = (await json(await app.request(`/periods/${period.id}/snapshot`))) as { invites: unknown[] };
    expect(anonSnap.invites).toEqual([]);
    const viewerSnap = (await json(
      await app.request(`/periods/${period.id}/snapshot`, { headers: { Authorization: `Bearer ${token2}` } }),
    )) as { invites: unknown[] };
    expect(viewerSnap.invites).toEqual([]);
  });

  it('accepts zarinpal billing', async () => {
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
  });

  it('does not expose a telegram webhook', async () => {
    const res = await app.request('/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { chat: { id: 99 }, text: '/start' } }),
    });
    expect(res.status).toBe(404);
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
    // «پرداختم» (pending_confirm) may only be claimed by the debtor, so the caller must own seat `hadi`.
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: 'تسویه',
        currency: 'IRT',
        members: [
          { id: 'hadi', displayName: 'هادی', role: 'owner' },
          { id: 'vahid', displayName: 'وحید', role: 'member' },
          { id: 'sara', displayName: 'سارا', role: 'member' },
        ],
      }),
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

    const first = await app.request(`/periods/${period.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...pendingPayload, id: 'pay-a' }),
    });
    expect(first.status).toBe(200);

    const second = await app.request(`/periods/${period.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...pendingPayload, id: 'pay-b' }),
    });
    expect(second.status).toBe(409);

    const otherEdge = await app.request(`/periods/${period.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...pendingPayload, id: 'pay-c', toMemberId: 'sara' }),
    });
    expect(otherEdge.status).toBe(200);
    const snap = await app.request(`/periods/${period.id}/snapshot`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const otherBody = (await json(snap)) as { payments: { id: string }[] };
    expect(otherBody.payments.map((p) => p.id).sort()).toEqual(['pay-a', 'pay-c']);

    // Server enforces the same debtor/creditor rules as the app.
    const vahidReq = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09125555556' }),
    });
    const { devCode: vahidCode } = (await json(vahidReq)) as { devCode: string };
    const vahidVerify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09125555556', code: vahidCode, displayName: 'وحید', deviceId: 'pay2' }),
    });
    const { token: vahidToken, user: vahidUser } = (await json(vahidVerify)) as { token: string; user: { id: string } };
    await app.request(`/periods/${period.id}/members/vahid`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId: vahidUser.id }),
    });
    // Vahid (creditor) cannot claim «پرداختم» on Hadi's behalf.
    const notDebtor = await app.request(`/periods/${period.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vahidToken}` },
      body: JSON.stringify({ ...pendingPayload, id: 'pay-d', toMemberId: 'sara' }),
    });
    expect(notDebtor.status).toBe(403);
    // Nor record a settled payment on the debtor's behalf (only debtor / owner / manager may).
    const notDebtorSettled = await app.request(`/periods/${period.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vahidToken}` },
      body: JSON.stringify({ ...pendingPayload, id: 'pay-e', status: 'settled' }),
    });
    expect(notDebtorSettled.status).toBe(403);
    // Vahid (creditor) confirms Hadi's pending payment.
    const confirm = await app.request(`/periods/${period.id}/payments/pay-a`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vahidToken}` },
      body: JSON.stringify({ status: 'settled' }),
    });
    expect(confirm.status).toBe(200);
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

  it('rejects a jwt after the session is revoked', async () => {
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
    await mutate((d) => {
      d.sessions = [];
    });
    const listed = await app.request('/friends', { headers: { Authorization: `Bearer ${token}` } });
    expect(listed.status).toBe(401);
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

function expensePayload(id: string, title: string, extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
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
  };
}

describe('period conflict and tombstones', () => {
  beforeAll(async () => {
    await initStore();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it('rejects write ops on /sync with 410 and last-write-wins via REST', async () => {
    const { token } = await signup('09120001001', 'مالک', 'dev-a');
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'تداخل', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string; version: number } };
    expect(period.version).toBe(1);

    const first = await app.request(`/periods/${period.id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(expensePayload('exp-server', 'از دستگاه دیگر')),
    });
    expect(first.status).toBe(200);
    const firstBody = (await json(first)) as { version: number };
    expect(firstBody.version).toBe(2);

    const rejected = await app.request(`/periods/${period.id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: 'dev-b',
        baseVersion: 1,
        ops: [{ entity: 'expense', action: 'upsert', payload: expensePayload('exp-local', 'تغییر لوکال') }],
      }),
    });
    expect(rejected.status).toBe(410);

    const second = await app.request(`/periods/${period.id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(expensePayload('exp-local', 'تغییر لوکال')),
    });
    expect(second.status).toBe(200);
    const retryBody = (await json(second)) as { version: number };
    expect(retryBody.version).toBe(3);

    const snap = await app.request(`/periods/${period.id}/snapshot`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const snapBody = (await json(snap)) as { expenses: { id: string }[] };
    expect(snapBody.expenses.map((e) => e.id).sort()).toEqual(['exp-local', 'exp-server']);
  });

  it('includes soft-deleted expenses in snapshots', async () => {
    const { token } = await signup('09120001002', 'مالک', 'dev-del');
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'حذف', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };

    const created = await app.request(`/periods/${period.id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(expensePayload('exp-gone', 'حذف می‌شود')),
    });
    expect(created.status).toBe(200);

    const del = await app.request(`/periods/${period.id}/expenses/exp-gone`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(del.status).toBe(200);
    const delBody = (await json(del)) as { expense: { id: string; deletedAt?: string } };
    expect(delBody.expense.deletedAt).toBeTruthy();

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

    await mutate((d) => {
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

    // A client upsert that carries its own schedule/state wins (paused rule stays paused, nextAt kept).
    const pausedAt = new Date(Date.now() + 5 * 86400_000).toISOString();
    const paused = await app.request(`/periods/${period.id}/recurring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id: ruleSnap.recurring[0].id,
        title: 'شارژ',
        amount: 100,
        currency: 'IRT',
        payerId: 'payer',
        splitMode: 'equal',
        shares: [{ memberId: 'payer', value: 1 }],
        intervalDays: 30,
        nextAt: pausedAt,
        active: false,
      }),
    });
    expect(paused.status).toBe(200);
    const pausedBody = (await json(paused)) as { nextAt: string; active: boolean };
    expect(pausedBody.active).toBe(false);
    expect(pausedBody.nextAt).toBe(pausedAt);
  });

  it('syncs profile prefs and payout methods on /auth/me', async () => {
    const req = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09123334444' }),
    });
    const { devCode } = (await json(req)) as { devCode: string };
    const verify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09123334444', code: devCode, displayName: 'سارا', deviceId: 'dev-p' }),
    });
    const session = (await json(verify)) as {
      token: string;
      user: { id: string; passwordHash?: string };
      profile: { usePersianDigits: boolean; payoutMethods: { cardNumber: string }[]; autoSync?: boolean };
    };
    expect(session.user.passwordHash).toBeUndefined();
    expect(session.profile.payoutMethods).toBeUndefined();
    expect(session.profile.autoSync).toBe(true);

    const put = await app.request('/auth/me', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        displayName: 'سارا ک.',
        usePersianDigits: false,
        debtReminders: false,
        calendarMode: 'gregorian',
        autoSync: false,
        fxWatchlist: ['USD', 'EUR', 'IRT'],
        payoutMethods: [
          {
            id: 'card1',
            cardNumber: '6037991111111112',
            sheba: 'IR060170000000000000000000',
            cardHolderName: 'سارا',
            bankName: 'ملی',
            isDefault: true,
          },
        ],
      }),
    });
    expect(put.status).toBe(200);
    const saved = (await json(put)) as {
      user: { displayName: string };
      profile: {
        usePersianDigits: boolean;
        debtReminders: boolean;
        calendarMode: string;
        autoSync: boolean;
        fxWatchlist: string[];
        payoutMethods: { cardNumber: string; sheba?: string }[];
        prefsUpdatedAt?: string;
      };
    };
    expect(saved.user.displayName).toBe('سارا ک.');
    expect(saved.profile.usePersianDigits).toBe(false);
    expect(saved.profile.debtReminders).toBe(false);
    expect(saved.profile.calendarMode).toBe('gregorian');
    expect(saved.profile.autoSync).toBe(false);
    expect(saved.profile.fxWatchlist).toEqual(['USD', 'EUR']);
    expect(saved.profile.payoutMethods[0]?.cardNumber).toBe('6037991111111112');
    expect(saved.profile.prefsUpdatedAt).toBeTruthy();

    const me = await app.request('/auth/me', {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const body = (await json(me)) as {
      user: { passwordHash?: string; payoutMethods?: unknown };
      profile: { payoutMethods: { cardNumber: string }[] };
    };
    expect(me.status).toBe(200);
    expect(body.user.passwordHash).toBeUndefined();
    expect(body.user.payoutMethods).toBeUndefined();
    expect(body.profile.payoutMethods[0]?.cardNumber).toBe('6037991111111112');

    const prefsOnly = await app.request('/auth/me', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ usePersianDigits: true }),
    });
    const prefsBody = (await json(prefsOnly)) as { profile: { payoutMethods: { cardNumber: string }[] } };
    expect(prefsBody.profile.payoutMethods[0]?.cardNumber).toBe('6037991111111112');
  });

  it('revokes the session on logout', async () => {
    const req = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09120001111' }),
    });
    const { devCode } = (await json(req)) as { devCode: string };
    const verify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09120001111', code: devCode, displayName: 'خروج', deviceId: 'logout-dev' }),
    });
    const { token } = (await json(verify)) as { token: string };
    const out = await app.request('/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(out.status).toBe(200);
    const me = await app.request('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    expect(me.status).toBe(401);
    expect((await getDb()).sessions.some((s) => s.token === token)).toBe(false);
  });

  it('downgrades expired premium on /auth/me', async () => {
    const req = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09120002222' }),
    });
    const { devCode } = (await json(req)) as { devCode: string };
    const verify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09120002222', code: devCode, displayName: 'منقضی', deviceId: 'exp-dev' }),
    });
    const session = (await json(verify)) as { token: string; user: { id: string } };
    await mutate((d) => {
      const row = d.users.find((u) => u.id === session.user.id);
      if (row) {
        row.plan = 'premium';
        row.premiumUntil = '2020-01-01T00:00:00.000Z';
      }
    });
    const me = await app.request('/auth/me', { headers: { Authorization: `Bearer ${session.token}` } });
    const body = (await json(me)) as { user: { plan: string }; profile: { plan: string } };
    expect(me.status).toBe(200);
    expect(body.user.plan).toBe('free');
    expect(body.profile.plan).toBe('free');
    expect((await getDb()).users.find((u) => u.id === session.user.id)?.plan).toBe('free');
  });

  it('rejects otp verify and password login for banned users', async () => {
    const req = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09123334444' }),
    });
    const { devCode } = (await json(req)) as { devCode: string };
    const verify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '09123334444',
        code: devCode,
        displayName: 'مسدود',
        deviceId: 'ban-dev',
      }),
    });
    const { user } = (await json(verify)) as { user: { id: string } };
    await mutate((d) => {
      const row = d.users.find((u) => u.id === user.id);
      if (row) row.bannedAt = new Date().toISOString();
    });
    const again = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09123334444' }),
    });
    const { devCode: code2 } = (await json(again)) as { devCode: string };
    const blocked = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09123334444', code: code2, displayName: 'مسدود', deviceId: 'ban-dev-2' }),
    });
    expect(blocked.status).toBe(403);

    const emailUser = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'banned@example.com',
        password: 'secret1',
        displayName: 'ایمیل',
        deviceId: 'ban-mail',
      }),
    });
    const registered = (await json(emailUser)) as { user: { id: string } };
    await mutate((d) => {
      const row = d.users.find((u) => u.id === registered.user.id);
      if (row) row.bannedAt = new Date().toISOString();
    });
    const login = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'banned@example.com', password: 'secret1', deviceId: 'ban-mail-2' }),
    });
    expect(login.status).toBe(403);
  });

  it('does not let REST member create promote a member to owner', async () => {
    const req = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09125556666' }),
    });
    const { devCode } = (await json(req)) as { devCode: string };
    const verify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09125556666', code: devCode, displayName: 'مالک', deviceId: 'own-dev' }),
    });
    const { token, user } = (await json(verify)) as { token: string; user: { id: string } };
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'مالکیت', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string; ownerId: string; version: number } };
    const created = await app.request(`/periods/${period.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: 'intruder', displayName: 'مهمان', role: 'owner', userId: 'someone-else' }),
    });
    expect(created.status).toBe(200);
    const body = (await json(created)) as { member: { id: string; role: string } };
    expect(body.member.role).toBe('member');
    const snap = await app.request(`/periods/${period.id}/snapshot`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const snapBody = (await json(snap)) as { members: { id: string; role: string }[]; invites?: unknown[] };
    expect(snapBody.members.find((m) => m.id === 'intruder')?.role).toBe('member');
    expect((await getDb()).periods.find((p) => p.id === period.id)?.ownerId).toBe(user.id);
    expect(Array.isArray(snapBody.invites)).toBe(true);
  });

  it('returns chat from GET /periods/:id/chat and 403 for forbidden attachments', async () => {
    const req = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09127778888' }),
    });
    const { devCode } = (await json(req)) as { devCode: string };
    const verify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09127778888', code: devCode, displayName: 'چت', deviceId: 'chat-dev' }),
    });
    const { token } = (await json(verify)) as { token: string };
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'چت', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };
    const member = (await getDb()).members.find((m) => m.periodId === period.id)!;
    await app.request(`/periods/${period.id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ senderMemberId: member.id, body: 'سلام' }),
    });
    const chatRes = await app.request(`/periods/${period.id}/chat`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const chatBody = (await json(chatRes)) as { chat: { body: string }[]; messages?: unknown };
    expect(chatRes.status).toBe(200);
    expect(chatBody.chat[0]?.body).toBe('سلام');
    expect(chatBody.messages).toBeUndefined();

    const otherReq = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09127779999' }),
    });
    const { devCode: otherCode } = (await json(otherReq)) as { devCode: string };
    const otherVerify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09127779999', code: otherCode, displayName: 'غریبه', deviceId: 'chat-other' }),
    });
    const { token: otherToken } = (await json(otherVerify)) as { token: string };
    const att = await app.request('/attachments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otherToken}` },
      body: JSON.stringify({ periodId: period.id, mime: 'text/plain', dataBase64: 'QQ==' }),
    });
    expect(att.status).toBe(403);
  });

  it('uploads a small avatar, hides it from strangers, and clears it on delete', async () => {
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const login = async (phone: string, name: string, deviceId: string) => {
      const req = await app.request('/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const { devCode } = (await json(req)) as { devCode: string };
      const verify = await app.request('/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: devCode, displayName: name, deviceId }),
      });
      return json(verify) as Promise<{ token: string; user: { id: string } }>;
    };

    const owner = await login('09121110001', 'آواتار', 'av-owner');
    const badMime = await app.request('/auth/me/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ mime: 'image/gif', dataBase64: png }),
    });
    expect(badMime.status).toBe(400);

    const tooBig = await app.request('/auth/me/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ mime: 'image/png', dataBase64: 'A'.repeat(110_001) }),
    });
    expect(tooBig.status).toBe(400);

    const uploaded = await app.request('/auth/me/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ mime: 'image/png', dataBase64: png }),
    });
    expect(uploaded.status).toBe(200);
    const uploadedBody = (await json(uploaded)) as {
      user: { hasAvatar?: boolean };
      profile: { avatarDataUrl?: string };
    };
    expect(uploadedBody.user.hasAvatar).toBe(true);
    expect(uploadedBody.profile.avatarDataUrl).toContain(png);

    const prefs = await app.request('/auth/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ usePersianDigits: true }),
    });
    const prefsBody = (await json(prefs)) as { profile: { avatarDataUrl?: string } };
    expect(prefsBody.profile.avatarDataUrl).toContain(png);

    const stranger = await login('09121110002', 'غریبه', 'av-stranger');
    const hidden = await app.request(`/avatars?ids=${owner.user.id}`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    const hiddenBody = (await json(hidden)) as { avatars: { userId: string }[] };
    expect(hidden.status).toBe(200);
    expect(hiddenBody.avatars).toEqual([]);

    const selfAv = await app.request(`/avatars?ids=${owner.user.id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const selfBody = (await json(selfAv)) as { avatars: { userId: string; dataUrl: string }[] };
    expect(selfBody.avatars[0]?.userId).toBe(owner.user.id);
    expect(selfBody.avatars[0]?.dataUrl).toContain(png);

    const mate = await login('09121110003', 'هم‌دوره', 'av-mate');
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ title: 'آواتار دوره', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };
    await app.request(`/periods/${period.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ id: 'mate-1', displayName: 'هم‌دوره', userId: mate.user.id }),
    });
    const mateSee = await app.request(`/avatars?ids=${owner.user.id}`, {
      headers: { Authorization: `Bearer ${mate.token}` },
    });
    const mateBody = (await json(mateSee)) as { avatars: { userId: string }[] };
    expect(mateBody.avatars[0]?.userId).toBe(owner.user.id);

    const pal = await login('09121110004', 'دوست', 'av-pal');
    await app.request('/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pal.token}` },
      body: JSON.stringify({ id: 'f-av', displayName: 'آواتار', friendUserId: owner.user.id }),
    });
    const palSee = await app.request(`/avatars?ids=${owner.user.id}`, {
      headers: { Authorization: `Bearer ${pal.token}` },
    });
    const palBody = (await json(palSee)) as { avatars: { userId: string }[] };
    expect(palBody.avatars[0]?.userId).toBe(owner.user.id);

    const removed = await app.request('/auth/me/avatar', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(removed.status).toBe(200);
    const after = await app.request('/auth/me', { headers: { Authorization: `Bearer ${owner.token}` } });
    const afterBody = (await json(after)) as { profile: { avatarDataUrl?: string }; user: { hasAvatar?: boolean } };
    expect(afterBody.profile.avatarDataUrl).toBeUndefined();
    expect(afterBody.user.hasAvatar).toBe(false);

    const uploadedAgain = await app.request('/auth/me/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ mime: 'image/png', dataBase64: png }),
    });
    expect(uploadedAgain.status).toBe(200);
    const gone = await app.request('/auth/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(gone.status).toBe(200);
    const stored = (await getDb()).users.find((u) => u.id === owner.user.id);
    expect(stored?.avatarDataUrl).toBeFalsy();
    expect(stored?.avatarPreset).toBeFalsy();
  });

  it('stores a catalog avatar preset without a blob and rejects mixed payloads', async () => {
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const req = await app.request('/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09121110011' }),
    });
    const { devCode } = (await json(req)) as { devCode: string };
    const verify = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09121110011', code: devCode, displayName: 'آماده', deviceId: 'av-preset' }),
    });
    const { token, user } = (await json(verify)) as { token: string; user: { id: string } };

    const mixed = await app.request('/auth/me/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ avatarPreset: 'male-03', mime: 'image/png', dataBase64: png }),
    });
    expect(mixed.status).toBe(400);

    const bad = await app.request('/auth/me/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ avatarPreset: 'robot-01' }),
    });
    expect(bad.status).toBe(400);

    const saved = await app.request('/auth/me/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ avatarPreset: 'female-07' }),
    });
    expect(saved.status).toBe(200);
    const savedBody = (await json(saved)) as {
      user: { hasAvatar?: boolean };
      profile: { avatarPreset?: string; avatarDataUrl?: string };
    };
    expect(savedBody.user.hasAvatar).toBe(true);
    expect(savedBody.profile.avatarPreset).toBe('female-07');
    expect(savedBody.profile.avatarDataUrl).toBeUndefined();

    const listed = await app.request(`/avatars?ids=${user.id}`, { headers: { Authorization: `Bearer ${token}` } });
    const listedBody = (await json(listed)) as { avatars: { userId: string; preset?: string; dataUrl?: string }[] };
    expect(listedBody.avatars[0]?.preset).toBe('female-07');
    expect(listedBody.avatars[0]?.dataUrl).toBeUndefined();

    const upload = await app.request('/auth/me/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mime: 'image/png', dataBase64: png }),
    });
    expect(upload.status).toBe(200);
    const uploadBody = (await json(upload)) as { profile: { avatarPreset?: string; avatarDataUrl?: string } };
    expect(uploadBody.profile.avatarPreset).toBeUndefined();
    expect(uploadBody.profile.avatarDataUrl).toContain(png);
  });

  it('stores period cover presets and rejects oversized cover data', async () => {
    const { token } = await signup('09121118888', 'ورزشی', 'media-owner');
    const created = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: 'فیتنس',
        coverPreset: 'fitness',
      }),
    });
    expect(created.status).toBe(200);
    const { period } = (await json(created)) as {
      period: { id: string; coverPreset?: string };
    };
    expect(period.coverPreset).toBe('fitness');

    const tooBig = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id: period.id,
        title: 'فیتنس',
        coverDataUrl: `data:image/png;base64,${'A'.repeat(110_001)}`,
      }),
    });
    expect(tooBig.status).toBe(400);

    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const withPhoto = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id: period.id,
        title: 'فیتنس',
        coverPreset: 'fitness',
        coverDataUrl: `data:image/png;base64,${png}`,
      }),
    });
    expect(withPhoto.status).toBe(200);
    const { period: next } = (await json(withPhoto)) as { period: { coverDataUrl?: string } };
    expect(next.coverDataUrl).toContain(png);
  });

  it('enforces manager vs member period permissions', async () => {
    const owner = await signup('09127771001', 'مالک نقش', 'role-own');
    const managerUser = await signup('09127771002', 'مدیر نقش', 'role-mgr');
    const memberUser = await signup('09127771003', 'عضو نقش', 'role-mem');
    const otherMgr = await signup('09127771004', 'مدیر دو', 'role-mgr2');
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ title: 'نقش‌ها', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };

    const addManager = await app.request(`/periods/${period.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({
        id: 'mgr-1',
        displayName: 'مدیر نقش',
        userId: managerUser.user.id,
        role: 'manager',
      }),
    });
    expect(addManager.status).toBe(200);
    expect(((await json(addManager)) as { member: { role: string } }).member.role).toBe('manager');

    await app.request(`/periods/${period.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({
        id: 'mem-1',
        displayName: 'عضو نقش',
        userId: memberUser.user.id,
        role: 'member',
      }),
    });
    await app.request(`/periods/${period.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({
        id: 'mgr-2',
        displayName: 'مدیر دو',
        userId: otherMgr.user.id,
        role: 'manager',
      }),
    });

    const memberInvite = await app.request(`/periods/${period.id}/invites`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberUser.token}` },
    });
    expect(memberInvite.status).toBe(403);

    const managerInvite = await app.request(`/periods/${period.id}/invites`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerUser.token}` },
    });
    expect(managerInvite.status).toBe(200);

    const memberSettings = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberUser.token}` },
      body: JSON.stringify({ id: period.id, title: 'هک عنوان' }),
    });
    expect(memberSettings.status).toBe(403);

    const managerSettings = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerUser.token}` },
      body: JSON.stringify({ id: period.id, title: 'عنوان مدیر' }),
    });
    expect(managerSettings.status).toBe(200);

    const memberExpense = await app.request(`/periods/${period.id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberUser.token}` },
      body: JSON.stringify({
        id: 'role-exp',
        title: 'نان',
        amount: 10,
        currency: 'IRT',
        payerId: memberUser.user.id,
        splitMode: 'equal',
        shares: [{ memberId: 'mem-1', value: 1 }],
        tax: { type: 'none', value: 0 },
        tags: [],
        fxRate: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 0,
      }),
    });
    expect(memberExpense.status).toBe(200);

    const memberAdd = await app.request(`/periods/${period.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberUser.token}` },
      body: JSON.stringify({ id: 'intruder', displayName: 'جدید' }),
    });
    expect(memberAdd.status).toBe(403);

    const memberRolePatch = await app.request(`/periods/${period.id}/members/mgr-2`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberUser.token}` },
      body: JSON.stringify({ role: 'viewer' }),
    });
    expect(memberRolePatch.status).toBe(403);

    const managerPromote = await app.request(`/periods/${period.id}/members/mem-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerUser.token}` },
      body: JSON.stringify({ role: 'manager' }),
    });
    expect(managerPromote.status).toBe(403);

    const managerToViewer = await app.request(`/periods/${period.id}/members/mem-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerUser.token}` },
      body: JSON.stringify({ role: 'viewer' }),
    });
    expect(managerToViewer.status).toBe(200);
    expect(((await json(managerToViewer)) as { member: { role: string } }).member.role).toBe('viewer');

    const changeOtherManager = await app.request(`/periods/${period.id}/members/mgr-2`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerUser.token}` },
      body: JSON.stringify({ role: 'member' }),
    });
    expect(changeOtherManager.status).toBe(403);

    const snap = await app.request(`/periods/${period.id}/snapshot`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const snapBody = (await json(snap)) as { members: { id: string; role: string }[] };
    const ownerMember = snapBody.members.find((m) => m.role === 'owner');
    expect(ownerMember).toBeTruthy();
    const demoteOwner = await app.request(`/periods/${period.id}/members/${ownerMember!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerUser.token}` },
      body: JSON.stringify({ role: 'member' }),
    });
    expect(demoteOwner.status).toBe(403);

    const ownerPromote = await app.request(`/periods/${period.id}/members/mem-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ role: 'manager' }),
    });
    expect(ownerPromote.status).toBe(200);
    expect(((await json(ownerPromote)) as { member: { role: string } }).member.role).toBe('manager');
  });

  it('lets a member patch only their own seat, not another member identity', async () => {
    const owner = await signup('09128881001', 'مالک پچ', 'patch-own');
    const memberUser = await signup('09128881002', 'عضو پچ', 'patch-mem');
    const other = await signup('09128881003', 'دیگر پچ', 'patch-oth');
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({
        title: 'پچ عضو',
        currency: 'IRT',
        members: [
          { id: 'own-1', displayName: 'مالک', role: 'owner' },
          { id: 'mem-1', displayName: 'عضو پچ', role: 'member', userId: memberUser.user.id },
          { id: 'oth-1', displayName: 'دیگر', role: 'member', userId: other.user.id },
        ],
      }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };

    const stealName = await app.request(`/periods/${period.id}/members/oth-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberUser.token}` },
      body: JSON.stringify({ displayName: 'اسم عوض شد' }),
    });
    expect(stealName.status).toBe(403);

    const stealPhone = await app.request(`/periods/${period.id}/members/oth-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberUser.token}` },
      body: JSON.stringify({ phone: '09128881002' }),
    });
    expect(stealPhone.status).toBe(403);

    const selfName = await app.request(`/periods/${period.id}/members/mem-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberUser.token}` },
      body: JSON.stringify({ displayName: 'نام خودم', role: 'member' }),
    });
    expect(selfName.status).toBe(200);
    expect(((await json(selfName)) as { member: { displayName: string } }).member.displayName).toBe('نام خودم');

    const ownerPatch = await app.request(`/periods/${period.id}/members/oth-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ phone: '09128881003' }),
    });
    expect(ownerPatch.status).toBe(200);
  });

  it('treats same-phone seats as one actor for settlement, and binds chat sender', async () => {
    const owner = await signup('09128882001', 'مالک دو صندلی', 'dual-own');
    const creditor = await signup('09128882002', 'طلبکار', 'dual-cred');
    const memberUser = await signup('09128882003', 'عضو چت', 'dual-mem');
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({
        title: 'دو صندلی',
        currency: 'IRT',
        members: [
          { id: 'own-1', displayName: 'مالک', role: 'owner', phone: '09128882001' },
          { id: 'seat-2', displayName: 'جایگاه دوم', role: 'member', phone: '09128882001' },
          { id: 'cred-1', displayName: 'طلبکار', role: 'member', userId: creditor.user.id },
          { id: 'mem-1', displayName: 'عضو چت', role: 'member', userId: memberUser.user.id },
        ],
      }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };

    const pending = await app.request(`/periods/${period.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({
        id: 'pay-dual',
        fromMemberId: 'seat-2',
        toMemberId: 'cred-1',
        amount: 1000,
        currency: 'IRT',
        kind: 'settlement',
        status: 'pending_confirm',
      }),
    });
    expect(pending.status).toBe(200);

    const spoof = await app.request(`/periods/${period.id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberUser.token}` },
      body: JSON.stringify({ senderMemberId: 'own-1', body: 'من مالک نیستم' }),
    });
    expect(spoof.status).toBe(403);

    const ownChat = await app.request(`/periods/${period.id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberUser.token}` },
      body: JSON.stringify({ senderMemberId: 'mem-1', body: 'سلام' }),
    });
    expect(ownChat.status).toBe(200);
    expect(((await json(ownChat)) as { message: { senderMemberId: string } }).message.senderMemberId).toBe('mem-1');
  });
});

describe('username and public profile', () => {
  beforeAll(async () => {
    await initStore();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it('sets a unique username, rejects reserved and taken, and frees it on delete', async () => {
    const a = await signup('09128883001', 'محمد', 'un-a');
    const b = await signup('09128883002', 'سارا', 'un-b');
    const reserved = await app.request('/auth/me/username', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ username: 'profile' }),
    });
    expect(reserved.status).toBe(400);
    const numbered = await app.request('/auth/me/username', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ username: '1ali' }),
    });
    expect(numbered.status).toBe(400);
    const ok = await app.request('/auth/me/username', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ username: 'MmdShry' }),
    });
    expect(ok.status).toBe(200);
    const okBody = (await json(ok)) as { user: { username?: string }; profile: { username?: string } };
    expect(okBody.user.username).toBe('mmdshry');
    expect(okBody.profile.username).toBe('mmdshry');

    const avail = await app.request('/auth/username/available?u=mmdshry', {
      headers: { Authorization: `Bearer ${b.token}` },
    });
    expect(((await json(avail)) as { available: boolean }).available).toBe(false);
    const taken = await app.request('/auth/me/username', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${b.token}` },
      body: JSON.stringify({ username: 'mmdshry' }),
    });
    expect(taken.status).toBe(409);

    const cover = await app.request('/auth/me/cover', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ coverPreset: 'travel' }),
    });
    expect(cover.status).toBe(200);

    const pub = await app.request('/u/mmdshry');
    expect(pub.status).toBe(200);
    const pubBody = (await json(pub)) as {
      username: string;
      displayName: string;
      phone?: string;
      email?: string;
      coverPreset?: string | null;
      periodCount: number;
    };
    expect(pubBody.username).toBe('mmdshry');
    expect(pubBody.displayName).toBe('محمد');
    expect(pubBody.phone).toBeUndefined();
    expect(pubBody.email).toBeUndefined();
    expect(pubBody.coverPreset).toBe('travel');

    const gone = await app.request('/auth/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${a.token}` },
    });
    expect(gone.status).toBe(200);
    expect((await app.request('/u/mmdshry')).status).toBe(404);
    const reused = await app.request('/auth/me/username', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${b.token}` },
      body: JSON.stringify({ username: 'mmdshry' }),
    });
    expect(reused.status).toBe(200);
  });

  it('hides banned profiles and lets managers add members by username', async () => {
    const owner = await signup('09128883011', 'مالک', 'un-own');
    const guest = await signup('09128883012', 'مهمان', 'un-gst');
    await app.request('/auth/me/username', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guest.token}` },
      body: JSON.stringify({ username: 'sara88' }),
    });
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ title: 'سفر', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };
    const lookup = await app.request('/users/lookup?username=sara88', {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(lookup.status).toBe(200);
    const added = await app.request(`/periods/${period.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ username: 'sara88' }),
    });
    expect(added.status).toBe(200);
    const addedBody = (await json(added)) as { member: { userId?: string; displayName: string } };
    expect(addedBody.member.userId).toBe(guest.user.id);
    expect(addedBody.member.displayName).toBe('مهمان');
    const again = await app.request(`/periods/${period.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ username: 'sara88' }),
    });
    expect(again.status).toBe(409);
    const listed = await app.request('/periods', { headers: { Authorization: `Bearer ${guest.token}` } });
    const listedBody = (await json(listed)) as { periods: { id: string }[] };
    expect(listedBody.periods.some((p) => p.id === period.id)).toBe(true);

    const pub = await app.request('/u/sara88');
    const stats = (await json(pub)) as { periodCount: number; comemberCount: number };
    expect(stats.periodCount).toBeGreaterThanOrEqual(1);
    expect(stats.comemberCount).toBeGreaterThanOrEqual(1);

    await mutate((d) => {
      const u = d.users.find((row) => row.id === guest.user.id);
      if (u) u.bannedAt = new Date().toISOString();
    });
    expect((await app.request('/u/sara88')).status).toBe(404);
    expect((await app.request('/u/nope')).status).toBe(404);
    expect((await app.request('/users/lookup?username=sara88')).status).toBe(401);
  });
});

