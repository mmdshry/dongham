import { nanoid } from 'nanoid';
import { expirePremium, sanitizeFxWatchlist, toLatinDigits } from '@dongham/ledger';
import { mutate } from './db.js';
import type { UserRecord } from './types.js';

export function persistPremiumExpiry(u: UserRecord): UserRecord {
  if (!expirePremium(u)) return u;
  mutate((db) => {
    const row = db.users.find((x) => x.id === u.id);
    if (row) row.plan = 'free';
  });
  return u;
}

export function publicUser(u: UserRecord) {
  persistPremiumExpiry(u);
  return {
    id: u.id,
    phone: u.phone,
    email: u.email,
    hasGoogle: Boolean(u.googleId),
    displayName: u.displayName,
    createdAt: u.createdAt,
    deletedAt: u.deletedAt,
    bannedAt: u.bannedAt,
    plan: u.plan || 'free',
    premiumUntil: u.premiumUntil,
  };
}

export type CloudPayoutMethod = {
  id: string;
  label?: string;
  cardNumber: string;
  sheba?: string;
  cardHolderName?: string;
  bankName?: string;
  accountNumber?: string;
  isDefault?: boolean;
};

export type CloudProfile = {
  displayName: string;
  phone?: string;
  email?: string;
  plan: 'free' | 'premium';
  premiumUntil?: string;
  usePersianDigits: boolean;
  debtReminders: boolean;
  calendarMode: 'jalali' | 'gregorian';
  fxWatchlist: string[];
  payoutMethods?: CloudPayoutMethod[];
  prefsUpdatedAt?: string;
};

export type UserProfilePatch = {
  displayName?: string;
  usePersianDigits?: boolean;
  debtReminders?: boolean;
  calendarMode?: 'jalali' | 'gregorian';
  fxWatchlist?: unknown;
  payoutMethods?: unknown;
};

function digits(value: unknown): string {
  return toLatinDigits(String(value || '')).replace(/\D/g, '');
}

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

export { sanitizeFxWatchlist };

export function sanitizePayoutMethods(input: unknown): CloudPayoutMethod[] {
  if (!Array.isArray(input)) return [];
  const out: CloudPayoutMethod[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const cardNumber = digits(row.cardNumber);
    if (cardNumber.length !== 16) continue;
    if (seen.has(cardNumber)) continue;
    seen.add(cardNumber);
    let sheba = toLatinDigits(String(row.sheba || ''))
      .replace(/\s/g, '')
      .toUpperCase();
    if (sheba && !sheba.startsWith('IR')) {
      const shebaDigits = sheba.replace(/\D/g, '');
      sheba = shebaDigits.length === 24 ? `IR${shebaDigits}` : '';
    }
    if (sheba && !/^IR\d{24}$/.test(sheba)) sheba = '';
    const method: CloudPayoutMethod = {
      id: typeof row.id === 'string' && row.id.trim() ? row.id.trim().slice(0, 40) : nanoid(),
      cardNumber,
    };
    const label = clip(row.label, 40);
    const holder = clip(row.cardHolderName, 80);
    const bank = clip(row.bankName, 40);
    const account = clip(row.accountNumber, 32);
    if (label) method.label = label;
    if (sheba) method.sheba = sheba;
    if (holder) method.cardHolderName = holder;
    if (bank) method.bankName = bank;
    if (account) method.accountNumber = account;
    if (row.isDefault) method.isDefault = true;
    out.push(method);
    if (out.length >= 20) break;
  }
  if (out.length && !out.some((m) => m.isDefault)) out[0].isDefault = true;
  return out.map((m) => (m.isDefault ? m : { ...m, isDefault: false }));
}

export function cloudProfile(u: UserRecord): CloudProfile {
  persistPremiumExpiry(u);
  return {
    displayName: u.displayName,
    phone: u.phone,
    email: u.email,
    plan: u.plan || 'free',
    premiumUntil: u.premiumUntil,
    usePersianDigits: u.usePersianDigits !== false,
    debtReminders: u.debtReminders !== false,
    calendarMode: u.calendarMode === 'gregorian' ? 'gregorian' : 'jalali',
    fxWatchlist: Array.isArray(u.fxWatchlist) ? sanitizeFxWatchlist(u.fxWatchlist) : [],
    payoutMethods: u.payoutMethods === undefined ? undefined : sanitizePayoutMethods(u.payoutMethods),
    prefsUpdatedAt: u.prefsUpdatedAt,
  };
}

export function authSession(token: string, user: UserRecord) {
  return { token, user: publicUser(user), profile: cloudProfile(user) };
}

export function applyUserProfilePatch(userId: string, patch: UserProfilePatch): UserRecord | null {
  let next: UserRecord | null = null;
  mutate((db) => {
    const row = db.users.find((u) => u.id === userId && !u.deletedAt);
    if (!row) return;
    if (typeof patch.displayName === 'string') {
      const name = patch.displayName.trim().slice(0, 40);
      if (name) row.displayName = name;
    }
    if (typeof patch.usePersianDigits === 'boolean') row.usePersianDigits = patch.usePersianDigits;
    if (typeof patch.debtReminders === 'boolean') row.debtReminders = patch.debtReminders;
    if (patch.calendarMode === 'jalali' || patch.calendarMode === 'gregorian') {
      row.calendarMode = patch.calendarMode;
    }
    if (patch.fxWatchlist !== undefined) row.fxWatchlist = sanitizeFxWatchlist(patch.fxWatchlist);
    if (patch.payoutMethods !== undefined) row.payoutMethods = sanitizePayoutMethods(patch.payoutMethods);
    row.prefsUpdatedAt = new Date().toISOString();
    next = { ...row };
  });
  return next;
}
