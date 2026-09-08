import { isPremium as isPremiumEntitlement } from '@dongham/ledger';
import { api, updateProfile } from './api';
import type { LocalProfile } from './db';

export const PREMIUM_SKU_MONTHLY = 'premium_monthly';
export const PREMIUM_SKU_YEARLY = 'premium_yearly';

export function isPremium(profile?: LocalProfile | null): boolean {
  return isPremiumEntitlement(profile);
}

export type PremiumPlan = { sku: string; rial: number; toman: number; days: number };

/** Prices come from the API (env-configured); the gateway bills rial, the UI shows toman. */
export async function fetchPremiumPlans(): Promise<PremiumPlan[]> {
  try {
    const res = await api<{ plans: PremiumPlan[] }>('/billing/plans');
    return Array.isArray(res.plans) ? res.plans : [];
  } catch {
    return [];
  }
}

async function applyUser(user: { plan?: string; premiumUntil?: string }) {
  await updateProfile({
    plan: user.plan === 'premium' ? 'premium' : 'free',
    premiumUntil: user.premiumUntil,
  });
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
