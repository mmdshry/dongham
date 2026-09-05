import { createHash } from 'node:crypto';
import { bankFromDrapi } from '@dongham/ledger';
import { getShebaDay, upsertShebaLookup } from './repo.js';
import type { ShebaLookupCache, ShebaLookupDay } from './types.js';

export const SHEBA_LOOKUP_LIMIT = 5;

type TokenCache = { value: string; exp: number };
let tokenCache: TokenCache | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function resetDrapiToken(): void {
  tokenCache = null;
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function scheduleTokenRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (!tokenCache) return;
  const wait = Math.max(30_000, tokenCache.exp - Date.now() - 5 * 60_000);
  refreshTimer = setTimeout(() => {
    void warmupDrapiToken();
  }, wait);
}

export async function warmupDrapiToken(): Promise<void> {
  try {
    await drapiToken(true);
  } catch {
    /* credentials missing or drapi down — convert will retry */
  }
}

export function tehranDay(now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}

export function hashCard(card: string): string {
  return createHash('sha256').update(card).digest('hex');
}

export function lookupIdentity(userId?: string | null, deviceId?: string | null): string | null {
  if (userId) return `user:${userId}`;
  if (deviceId) return `device:${deviceId}`;
  return null;
}

async function dayRow(identity: string, day: string): Promise<ShebaLookupDay> {
  return getShebaDay(identity, day);
}

export async function quotaFor(
  identity: string,
  day = tehranDay(),
): Promise<{ remaining: number; limit: number; count: number }> {
  const row = await dayRow(identity, day);
  return { remaining: Math.max(0, SHEBA_LOOKUP_LIMIT - row.count), limit: SHEBA_LOOKUP_LIMIT, count: row.count };
}

export async function cachedLookup(identity: string, cardHash: string): Promise<ShebaLookupCache | undefined> {
  const row = await getShebaDay(identity, tehranDay());
  return row.cache[cardHash];
}

async function upsertDay(next: ShebaLookupDay): Promise<void> {
  await upsertShebaLookup(next);
}

async function drapiToken(force = false): Promise<string> {
  if (!force && tokenCache && tokenCache.exp > Date.now() + 5 * 60_000) return tokenCache.value;
  const username = process.env.DRAPI_USERNAME;
  const password = process.env.DRAPI_PASSWORD;
  if (!username || !password) throw new Error('سرویس استعلام شبا تنظیم نشده');
  const url = process.env.DRAPI_TOKEN_URL || 'https://drapi.ir/auth/http/token';
  const res = await fetch(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) throw new Error('دریافت توکن استعلام ناموفق بود');
  tokenCache = {
    value: json.access_token,
    exp: Date.now() + (Number(json.expires_in) || 7200) * 1000,
  };
  scheduleTokenRefresh();
  return tokenCache.value;
}

type DrapiConvert = {
  ibanInfo?: {
    bank?: string;
    depositNumber?: string;
    iban?: string;
    owners?: { firstName?: string; lastName?: string }[];
  };
};

export async function convertCardToSheba(cardNumber: string): Promise<ShebaLookupCache> {
  const token = await drapiToken();
  const url =
    process.env.DRAPI_CARD_URL || 'https://drapi.ir/rest/api/main/convertCardToSheba/v1.0/convertcardtosheba';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ cardNumber }),
  });
  const json = (await res.json().catch(() => ({}))) as DrapiConvert;
  const info = json.ibanInfo;
  if (!res.ok || !info?.iban) throw new Error('استعلام شبا ناموفق بود');
  const owner = info.owners?.[0];
  const holderName = [owner?.firstName, owner?.lastName].filter(Boolean).join(' ').trim();
  const bank = bankFromDrapi(info.bank);
  return {
    iban: info.iban,
    depositNumber: info.depositNumber || '',
    bank: info.bank || '',
    bankName: bank?.name || '',
    bankCode: bank?.code || '',
    holderName,
  };
}

export async function lookupCardSheba(
  identity: string,
  cardNumber: string,
): Promise<{ result: ShebaLookupCache; remaining: number; cached: boolean }> {
  const day = tehranDay();
  const cardHash = hashCard(cardNumber);
  const row = await dayRow(identity, day);
  if (row.count >= SHEBA_LOOKUP_LIMIT) {
    const err = new Error('سقف استعلام روزانه تمام شده است') as Error & { status: number };
    err.status = 429;
    throw err;
  }
  const existing = await cachedLookup(identity, cardHash);
  const result = existing || (await convertCardToSheba(cardNumber));
  await upsertDay({
    ...row,
    count: row.count + 1,
    cache: { ...row.cache, [cardHash]: result },
  });
  return { result, remaining: SHEBA_LOOKUP_LIMIT - (row.count + 1), cached: !!existing };
}
