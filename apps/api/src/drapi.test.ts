import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from './app.js';
import { resetDb } from './db.js';
import { resetDrapiToken, warmupDrapiToken } from './drapi.js';

const CARD_A = '6274121199004409';
const CARD_B = '6037991111111112';

function json(res: Response) {
  return res.json();
}

function mockDrapi() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('token')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 7200 }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        type: 'DEBIT',
        ibanInfo: {
          bank: 'EGHTESAD_NOVIN',
          depositNumber: '181-800-6734170-1',
          iban: 'IR610550018180006734170001',
          owners: [{ firstName: 'محمد', lastName: 'شهریاری' }],
        },
      }),
      { status: 200 },
    );
  });
}

describe('card to sheba', () => {
  beforeEach(() => {
    resetDb();
    resetDrapiToken();
    process.env.DRAPI_USERNAME = 'test-user';
    process.env.DRAPI_PASSWORD = 'test-pass';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DRAPI_USERNAME;
    delete process.env.DRAPI_PASSWORD;
  });

  it('returns sheba from cache without calling drapi but still consumes quota', async () => {
    const fetchMock = mockDrapi();
    const first = await app.request('/payout/card-to-sheba', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'dev-a' },
      body: JSON.stringify({ cardNumber: CARD_A }),
    });
    const a = (await json(first)) as { iban: string; bankName: string; remaining: number; cached: boolean };
    expect(first.status).toBe(200);
    expect(a.iban).toBe('IR610550018180006734170001');
    expect(a.bankName).toBe('اقتصاد نوین');
    expect(a.remaining).toBe(4);
    expect(a.cached).toBe(false);

    const second = await app.request('/payout/card-to-sheba', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'dev-a' },
      body: JSON.stringify({ cardNumber: CARD_A }),
    });
    const b = (await json(second)) as { remaining: number; cached: boolean };
    expect(second.status).toBe(200);
    expect(b.cached).toBe(true);
    expect(b.remaining).toBe(3);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('convert')).length).toBe(1);
  });

  it('reuses a warmed token so convert does not fetch token again', async () => {
    const fetchMock = mockDrapi();
    await warmupDrapiToken();
    await app.request('/payout/card-to-sheba', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'dev-c' },
      body: JSON.stringify({ cardNumber: CARD_A }),
    });
    await app.request('/payout/card-to-sheba', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'dev-c' },
      body: JSON.stringify({ cardNumber: CARD_B }),
    });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('token')).length).toBe(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('convert')).length).toBe(2);
  });

  it('blocks the sixth live lookup', async () => {
    mockDrapi();
    for (let i = 0; i < 5; i += 1) {
      const card = `${CARD_B.slice(0, 15)}${i}`;
      const res = await app.request('/payout/card-to-sheba', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'dev-b' },
        body: JSON.stringify({ cardNumber: card }),
      });
      expect(res.status).toBe(200);
    }
    const sixth = await app.request('/payout/card-to-sheba', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'dev-b' },
      body: JSON.stringify({ cardNumber: CARD_A }),
    });
    expect(sixth.status).toBe(429);
    const quota = await app.request('/payout/sheba-quota', { headers: { 'X-Device-Id': 'dev-b' } });
    const q = (await json(quota)) as { remaining: number };
    expect(q.remaining).toBe(0);
  });
});
