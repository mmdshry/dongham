import { nanoid } from 'nanoid';
import { getDb, mutate } from './db.js';
import { premiumUntilFromNow } from './billing.js';

const SKU_RIAL: Record<string, number> = {
  premium_monthly: Number(process.env.ZARINPAL_MONTHLY_RIAL || 490_000),
  premium_yearly: Number(process.env.ZARINPAL_YEARLY_RIAL || 3_900_000),
};

function merchantId() {
  return process.env.ZARINPAL_MERCHANT_ID || '';
}

function sandbox() {
  return process.env.ZARINPAL_SANDBOX === '1' || !merchantId();
}

function apiBase() {
  return sandbox()
    ? 'https://sandbox.zarinpal.com/pg/v4/payment'
    : 'https://api.zarinpal.com/pg/v4/payment';
}

function startPay(authority: string) {
  return sandbox()
    ? `https://sandbox.zarinpal.com/pg/StartPay/${authority}`
    : `https://www.zarinpal.com/pg/StartPay/${authority}`;
}

export function skuDays(sku: string) {
  return sku.includes('year') ? 365 : 30;
}

export async function zarinpalRequest(input: {
  userId: string;
  sku: string;
  callbackUrl: string;
}): Promise<{ url: string; authority: string }> {
  const amount = SKU_RIAL[input.sku];
  if (!amount) throw new Error('sku نامعتبر است');

  if (!merchantId()) {
    const authority = `dev-${nanoid()}`;
    mutate((db) => {
      db.zarinpalPending = db.zarinpalPending || [];
      db.zarinpalPending.push({
        authority,
        userId: input.userId,
        sku: input.sku,
        amount,
        createdAt: new Date().toISOString(),
      });
    });
    const appUrl = process.env.APP_PUBLIC_URL || 'http://localhost:5173';
    return {
      authority,
      url: `${appUrl}/more?Authority=${authority}&Status=OK`,
    };
  }

  const res = await fetch(`${apiBase()}/request.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: merchantId(),
      amount,
      callback_url: input.callbackUrl,
      description: `اشتراک دونگ‌هام ${input.sku}`,
    }),
  });
  const json = (await res.json()) as { data?: { authority?: string; code?: number }; errors?: unknown };
  const authority = json.data?.authority;
  if (!authority) throw new Error('درگاه زرین‌پال پاسخ نداد');
  mutate((db) => {
    db.zarinpalPending = db.zarinpalPending || [];
    db.zarinpalPending.push({
      authority,
      userId: input.userId,
      sku: input.sku,
      amount,
      createdAt: new Date().toISOString(),
    });
  });
  return { authority, url: startPay(authority) };
}

export async function zarinpalVerify(input: {
  authority: string;
  status: string;
}): Promise<{ ok: boolean; error?: string; userId?: string; sku?: string }> {
  if (input.status && input.status.toUpperCase() !== 'OK') {
    return { ok: false, error: 'پرداخت لغو شد' };
  }
  const pending = (getDb().zarinpalPending || []).find((p) => p.authority === input.authority);
  if (!pending) return { ok: false, error: 'تراکنش پیدا نشد' };

  if (!merchantId() && input.authority.startsWith('dev-')) {
    applyPremium(pending.userId, pending.sku);
    return { ok: true, userId: pending.userId, sku: pending.sku };
  }

  const res = await fetch(`${apiBase()}/verify.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: merchantId(),
      amount: pending.amount,
      authority: input.authority,
    }),
  });
  const json = (await res.json()) as { data?: { code?: number } };
  if (json.data?.code !== 100 && json.data?.code !== 101) {
    return { ok: false, error: 'تأیید زرین‌پال ناموفق بود' };
  }
  applyPremium(pending.userId, pending.sku);
  return { ok: true, userId: pending.userId, sku: pending.sku };
}

function applyPremium(userId: string, sku: string) {
  const until = premiumUntilFromNow(skuDays(sku));
  mutate((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (u) {
      u.plan = 'premium';
      u.premiumUntil = until;
    }
    db.zarinpalPending = (db.zarinpalPending || []).filter((p) => p.userId !== userId || p.sku !== sku);
  });
}
