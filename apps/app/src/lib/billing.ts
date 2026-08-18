import { isPremium as isPremiumEntitlement } from '@dongham/ledger';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { api, updateProfile } from './api';
import type { LocalProfile } from './db';

interface StorePlugin {
  purchase(options: { sku: string }): Promise<{ purchaseToken: string; sku: string }>;
  queryPremium(options: { sku: string }): Promise<{ owned: boolean; purchaseToken?: string }>;
}

const Bazaar = registerPlugin<StorePlugin>('DonghamBazaar');
const Myket = registerPlugin<StorePlugin>('DonghamMyket');

export const PREMIUM_SKU_MONTHLY = 'premium_monthly';
export const PREMIUM_SKU_YEARLY = 'premium_yearly';
export const PREMIUM_SKU = PREMIUM_SKU_MONTHLY;

export function isPremium(profile?: LocalProfile | null): boolean {
  return isPremiumEntitlement(profile);
}

async function applyUser(user: { plan?: string; premiumUntil?: string }) {
  await updateProfile({
    plan: user.plan === 'premium' ? 'premium' : 'free',
    premiumUntil: user.premiumUntil,
  });
}

export async function buyPremiumBazaar(sku = PREMIUM_SKU_MONTHLY): Promise<{ ok: boolean; error?: string }> {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, error: 'خرید بازار فقط در اپ اندروید ممکن است' };
  }
  try {
    const result = await Bazaar.purchase({ sku });
    const res = await api<{ user: { plan?: string; premiumUntil?: string } }>('/billing/bazaar/verify', {
      method: 'POST',
      body: JSON.stringify({ sku: result.sku, purchaseToken: result.purchaseToken }),
    });
    await applyUser(res.user);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'خرید ناموفق' };
  }
}

export async function buyPremiumMyket(sku = PREMIUM_SKU_MONTHLY): Promise<{ ok: boolean; error?: string }> {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, error: 'خرید مایکت فقط در اپ اندروید ممکن است' };
  }
  try {
    const result = await Myket.purchase({ sku });
    const res = await api<{ user: { plan?: string; premiumUntil?: string } }>('/billing/myket/verify', {
      method: 'POST',
      body: JSON.stringify({ sku: result.sku, purchaseToken: result.purchaseToken }),
    });
    await applyUser(res.user);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'خرید ناموفق' };
  }
}

export async function buyPremiumWeb(
  sku: 'premium_monthly' | 'premium_yearly' = 'premium_monthly',
): Promise<{ ok: boolean; error?: string; url?: string }> {
  try {
    const res = await api<{ url: string }>('/billing/zarinpal/request', {
      method: 'POST',
      body: JSON.stringify({ sku }),
    });
    if (res.url) {
      window.location.href = res.url;
      return { ok: true, url: res.url };
    }
    return { ok: false, error: 'لینک پرداخت ساخته نشد' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'خطا در درگاه' };
  }
}

export async function verifyZarinpalReturn(authority: string, status: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await api<{ user: { plan?: string; premiumUntil?: string } }>('/billing/zarinpal/verify', {
      method: 'POST',
      body: JSON.stringify({ authority, status }),
    });
    await applyUser(res.user);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'تأیید پرداخت ناموفق' };
  }
}

/** @deprecated use buyPremiumBazaar / buyPremiumWeb */
export async function buyPremium(): Promise<{ ok: boolean; error?: string }> {
  if (Capacitor.isNativePlatform()) return buyPremiumBazaar();
  return buyPremiumWeb();
}
