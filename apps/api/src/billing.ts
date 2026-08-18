import { nanoid } from 'nanoid';
import { getDb, mutate } from './db.js';
import type { BillingEvent } from './types.js';

/** Cafe Bazaar / Myket purchase verification.
 * Production: BAZAAR_API_TOKEN + developer API.
 * Tests/dev: tokens starting with "dev-" are accepted when no token is configured.
 */

export async function verifyBazaarPurchase(input: {
  sku: string;
  purchaseToken: string;
  packageName?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const pkg = input.packageName || process.env.BAZAAR_PACKAGE || 'ir.dongham.app';
  const apiToken = process.env.BAZAAR_API_TOKEN;

  if (!apiToken) {
    if (input.purchaseToken.startsWith('dev-')) {
      return { ok: true };
    }
    return { ok: false, error: 'بازار پیکربندی نشده است' };
  }

  const url = `https://pardakht.cafebazaar.ir/devapi/v2/api/validate/${encodeURIComponent(pkg)}/inapp/${encodeURIComponent(input.sku)}/purchases/${encodeURIComponent(input.purchaseToken)}/`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (!res.ok) return { ok: false, error: 'خرید تأیید نشد' };
    const body = (await res.json()) as { purchaseState?: number };
    if (body.purchaseState === 0) return { ok: true };
    return { ok: false, error: 'وضعیت خرید نامعتبر است' };
  } catch {
    return { ok: false, error: 'خطا در ارتباط با بازار' };
  }
}

export function premiumUntilFromNow(days = 30): string {
  return new Date(Date.now() + days * 86400_000).toISOString();
}

export function recordBillingEvent(input: {
  userId: string;
  source: BillingEvent['source'];
  sku?: string;
  amount?: number;
  until: string;
}): void {
  mutate((db) => {
    if (!db.billingEvents) db.billingEvents = [];
    db.billingEvents.unshift({
      id: nanoid(),
      userId: input.userId,
      source: input.source,
      sku: input.sku,
      amount: input.amount,
      until: input.until,
      createdAt: new Date().toISOString(),
    });
    if (db.billingEvents.length > 5000) db.billingEvents = db.billingEvents.slice(0, 5000);
  });
}

export async function verifyMyketPurchase(input: {
  sku: string;
  purchaseToken: string;
  packageName?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const pkg = input.packageName || process.env.MYKET_PACKAGE || 'ir.dongham.app';
  const apiToken = process.env.MYKET_API_TOKEN;

  if (!apiToken) {
    if (input.purchaseToken.startsWith('dev-')) return { ok: true };
    return { ok: false, error: 'مایکت پیکربندی نشده است' };
  }

  const url = `https://developer.myket.ir/api/applications/${encodeURIComponent(pkg)}/purchases/products/${encodeURIComponent(input.sku)}/tokens/${encodeURIComponent(input.purchaseToken)}`;
  try {
    const res = await fetch(url, { headers: { 'X-Access-Token': apiToken } });
    if (!res.ok) return { ok: false, error: 'خرید مایکت تأیید نشد' };
    const body = (await res.json()) as { purchaseState?: number };
    if (body.purchaseState === 0) return { ok: true };
    return { ok: false, error: 'وضعیت خرید مایکت نامعتبر است' };
  } catch {
    return { ok: false, error: 'خطا در ارتباط با مایکت' };
  }
}
