import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from './app.js';
import { initStore, resetDb } from './db.js';
import { resetLiveBus } from './live.js';

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

describe('live long-poll', () => {
  beforeAll(async () => {
    await initStore();
  });

  beforeEach(async () => {
    resetLiveBus();
    await resetDb();
  });

  it('rejects unauthenticated live waits', async () => {
    const res = await app.request('/live?wait=0');
    expect(res.status).toBe(401);
  });

  it('returns queued chat and period events without waiting', async () => {
    const owner = await login('09121110020', 'مالک زنده', 'live-own');
    const member = await login('09121110021', 'عضو زنده', 'live-mem');
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({
        title: 'دوره زنده',
        currency: 'IRT',
        members: [
          { id: 'own', displayName: 'مالک زنده', userId: owner.user.id, role: 'owner' },
          { id: 'mem', displayName: 'عضو زنده', userId: member.user.id, role: 'member' },
        ],
      }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };
    resetLiveBus();

    const chat = await app.request(`/periods/${period.id}/chat`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({ senderMemberId: 'own', body: 'سلام آنی' }),
    });
    expect(chat.status).toBe(200);
    await Promise.resolve();

    const live = await app.request('/live?wait=0', { headers: auth(member.token) });
    expect(live.status).toBe(200);
    const body = (await json(live)) as {
      events: { type: string; periodId?: string; message?: { body: string } }[];
    };
    expect(body.events.some((e) => e.type === 'chat' && e.message?.body === 'سلام آنی')).toBe(true);
    expect(body.events.some((e) => e.type === 'period' && e.periodId === period.id)).toBe(true);
  });

  it('wakes a waiting poll when another member writes', async () => {
    const owner = await login('09121110022', 'مالک انتظار', 'live-wait-own');
    const member = await login('09121110023', 'عضو انتظار', 'live-wait-mem');
    const periodRes = await app.request('/periods', {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({
        title: 'انتظار',
        currency: 'IRT',
        members: [
          { id: 'own', displayName: 'مالک انتظار', userId: owner.user.id, role: 'owner' },
          { id: 'mem', displayName: 'عضو انتظار', userId: member.user.id, role: 'member' },
        ],
      }),
    });
    const { period } = (await json(periodRes)) as { period: { id: string } };
    resetLiveBus();

    const liveP = app.request('/live?wait=5', { headers: auth(member.token) });
    await new Promise((r) => setTimeout(r, 40));
    const chat = await app.request(`/periods/${period.id}/chat`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({ senderMemberId: 'own', body: 'بیدار' }),
    });
    expect(chat.status).toBe(200);
    const live = await liveP;
    expect(live.status).toBe(200);
    const body = (await json(live)) as {
      events: { type: string; message?: { body: string } }[];
    };
    expect(body.events.some((e) => e.type === 'chat' && e.message?.body === 'بیدار')).toBe(true);
  });
});
