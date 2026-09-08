import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import { app } from './app.js';
import { initStore, resetDb } from './db.js';
import { all, getPool } from './mysql.js';
import { sendPushToUser } from './push.js';

const TEST_VAPID = {
  publicKey: 'BP_5qeimA5i7jOlClTHNQVZ5uSt8rB-DbD8Z9nvnQldEXWkDTHMCFhQipelIlwrBzHpeGqOciZc84JX1yJ0Ii_8',
  privateKey: '4l4b-hPtP_fATbRgdA2IAxRoxPtiUOLn4m6uzFgh5dA',
};

async function json(res: Response) {
  return res.json();
}

async function login(phone: string, name: string, deviceId: string) {
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
  return (await json(verify)) as { token: string; user: { id: string } };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

describe('web push', () => {
  beforeAll(async () => {
    process.env.VAPID_PUBLIC_KEY = TEST_VAPID.publicKey;
    process.env.VAPID_PRIVATE_KEY = TEST_VAPID.privateKey;
    process.env.VAPID_SUBJECT = 'mailto:test@dongham.ir';
    await initStore();
  });

  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  it('exposes vapid public key and rejects subscribe without auth', async () => {
    const vapid = await app.request('/push/vapid');
    expect(vapid.status).toBe(200);
    const body = (await json(vapid)) as { publicKey: string };
    expect(body.publicKey).toBe(TEST_VAPID.publicKey);

    const unauth = await app.request('/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: 'https://push.example/sub',
        keys: { p256dh: 'p', auth: 'a' },
      }),
    });
    expect(unauth.status).toBe(401);
  });

  it('returns 503 when vapid keys are missing', async () => {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    try {
      const res = await app.request('/push/vapid');
      expect(res.status).toBe(503);
      const { token } = await login('09121110000', 'علی', 'push-off');
      const sub = await app.request('/push/subscribe', {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({
          endpoint: 'https://push.example/sub',
          keys: { p256dh: 'p', auth: 'a' },
        }),
      });
      expect(sub.status).toBe(503);
    } finally {
      process.env.VAPID_PUBLIC_KEY = pub;
      process.env.VAPID_PRIVATE_KEY = priv;
    }
  });

  it('stores and removes a push subscription', async () => {
    const { token, user } = await login('09121110001', 'سارا', 'push-sub');
    const endpoint = 'https://push.example/device-1';
    const sub = await app.request('/push/subscribe', {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ endpoint, keys: { p256dh: 'p256', auth: 'auth1' } }),
    });
    expect(sub.status).toBe(200);
    const rows = await all(getPool(), 'SELECT endpoint, user_id FROM push_subscriptions WHERE user_id=?', [user.id]);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].endpoint)).toBe(endpoint);

    const del = await app.request('/push/subscribe', {
      method: 'DELETE',
      headers: auth(token),
      body: JSON.stringify({ endpoint }),
    });
    expect(del.status).toBe(200);
    const after = await all(getPool(), 'SELECT endpoint FROM push_subscriptions WHERE user_id=?', [user.id]);
    expect(after).toHaveLength(0);
  });

  it('sends web push on test notification and drops gone endpoints', async () => {
    const { token, user } = await login('09121110002', 'رضا', 'push-send');
    await app.request('/push/subscribe', {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({
        endpoint: 'https://push.example/gone',
        keys: { p256dh: 'p256', auth: 'auth1' },
      }),
    });
    const send = vi.spyOn(webpush, 'sendNotification').mockRejectedValue({ statusCode: 410, message: 'gone' });
    await sendPushToUser({ userId: user.id, title: 'دونگ‌هام', body: 'آزمایش', url: '/', notificationId: 'n1' });
    expect(send).toHaveBeenCalled();
    const rows = await all(getPool(), 'SELECT endpoint FROM push_subscriptions WHERE user_id=?', [user.id]);
    expect(rows).toHaveLength(0);
  });

  it('notifies period members on expense, payment, and join', async () => {
    const send = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({ statusCode: 201 } as never);
    const owner = await login('09121110003', 'مالک', 'push-own');
    const member = await login('09121110004', 'عضو', 'push-mem');
    await app.request('/push/subscribe', {
      method: 'POST',
      headers: auth(member.token),
      body: JSON.stringify({
        endpoint: 'https://push.example/member',
        keys: { p256dh: 'p256', auth: 'auth1' },
      }),
    });

    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({ title: 'سفر', currency: 'IRT' }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };

    const inviteRes = await app.request(`/periods/${period.id}/invites`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const { token: inviteToken } = (await json(inviteRes)) as { token: string };
    await app.request(`/invites/${inviteToken}/join`, {
      method: 'POST',
      headers: auth(member.token),
      body: JSON.stringify({ displayName: 'عضو' }),
    });

    const ownerNotifs = await app.request('/notifications', { headers: { Authorization: `Bearer ${owner.token}` } });
    const ownerList = (await json(ownerNotifs)) as { notifications: { title: string }[] };
    expect(ownerList.notifications.some((n) => n.title === 'عضو جدید')).toBe(true);

    const snapRes = await app.request(`/periods/${period.id}/snapshot`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const snap = (await json(snapRes)) as { members: { id: string; userId?: string }[] };
    const ownerMember = snap.members.find((m) => m.userId === owner.user.id)!;

    await app.request(`/periods/${period.id}/expenses`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({
        title: 'ناهار',
        amount: 1000,
        currency: 'IRT',
        payerId: ownerMember.id,
        splitMode: 'equal',
        shares: snap.members.map((m) => ({ memberId: m.id, value: 1 })),
        tax: { type: 'none', value: 0 },
      }),
    });

    const memberNotifs = await app.request('/notifications', { headers: { Authorization: `Bearer ${member.token}` } });
    const memberList = (await json(memberNotifs)) as { notifications: { title: string; body: string }[] };
    expect(memberList.notifications.some((n) => n.title === 'هزینه جدید')).toBe(true);

    const from = snap.members.find((m) => m.userId === member.user.id)!;
    await app.request(`/periods/${period.id}/payments`, {
      method: 'POST',
      headers: auth(member.token),
      body: JSON.stringify({
        fromMemberId: from.id,
        toMemberId: ownerMember.id,
        amount: 500,
        currency: 'IRT',
        kind: 'settlement',
      }),
    });
    const ownerAfterPay = await app.request('/notifications', { headers: { Authorization: `Bearer ${owner.token}` } });
    const ownerPayList = (await json(ownerAfterPay)) as { notifications: { title: string }[] };
    expect(ownerPayList.notifications.some((n) => n.title === 'ثبت تسویه')).toBe(true);
    await vi.waitFor(() => {
      expect(send).toHaveBeenCalled();
    });
  });

  it('writes a test inbox row', async () => {
    vi.spyOn(webpush, 'sendNotification').mockResolvedValue({ statusCode: 201 } as never);
    const { token } = await login('09121110005', 'تست', 'push-test');
    const res = await app.request('/push/test', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const list = await app.request('/notifications', { headers: { Authorization: `Bearer ${token}` } });
    const body = (await json(list)) as { notifications: { title: string; body: string }[] };
    expect(body.notifications[0]?.title).toBe('دونگ‌هام');
    expect(body.notifications[0]?.body).toBe('نوتیفیکیشن آزمایشی');
  });
});
