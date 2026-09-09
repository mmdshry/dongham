import { nanoid } from 'nanoid';
import { expirePremium, gregorianToJalali, sanitizeFxWatchlist, toLatinDigits } from '@dongham/ledger';
import type { CloudPayoutMethod, CloudProfile } from '@dongham/ledger';
import { getUserById, updateUser } from './repo.js';
import type { UserRecord } from './types.js';

export const DISPLAY_NAME_CHANGE_LIMIT = 3;
export const DISPLAY_NAME_QUOTA_MESSAGE = 'این ماه ۳ بار تغییر داده‌اید؛ از اول ماه بعد دوباره.';

export type DisplayNameQuota = {
  month: string;
  used: number;
  limit: number;
  remaining: number;
};

export class DisplayNameQuotaError extends Error {
  quota: DisplayNameQuota;
  constructor(quota: DisplayNameQuota) {
    super(DISPLAY_NAME_QUOTA_MESSAGE);
    this.name = 'DisplayNameQuotaError';
    this.quota = quota;
  }
}

export class DisplayNameInvalidError extends Error {
  constructor() {
    super('نام نمایشی لازم است');
    this.name = 'DisplayNameInvalidError';
  }
}

export type { CloudPayoutMethod, CloudProfile };

export async function persistPremiumExpiry(u: UserRecord): Promise<UserRecord> {
  if (!expirePremium(u)) return u;
  await updateUser(u);
  return u;
}

export function parseRequiredDisplayName(raw?: string, max = 80): string | undefined {
  const name = (raw || '').trim().slice(0, max);
  if (!name || name === 'من') return undefined;
  return name;
}

/** New OTP/email users: honor a real name, otherwise the login identifier. */
export function signupDisplayName(input: {
  displayName?: string;
  phone?: string;
  email?: string;
}): string | undefined {
  return (
    parseRequiredDisplayName(input.displayName) ||
    parseRequiredDisplayName(input.phone) ||
    parseRequiredDisplayName(input.email)
  );
}

export function publicUser(u: UserRecord) {
  expirePremium(u);
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
    hasAvatar: Boolean(u.hasAvatar || u.avatarDataUrl || u.avatarPreset),
    username: u.username,
  };
}

export function tehranJalaliMonth(now = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const gy = Number(parts.find((p) => p.type === 'year')?.value);
  const gm = Number(parts.find((p) => p.type === 'month')?.value);
  const gd = Number(parts.find((p) => p.type === 'day')?.value);
  const [jy, jm] = gregorianToJalali(gy, gm, gd);
  return `${jy}-${String(jm).padStart(2, '0')}`;
}

export function displayNameQuota(
  user: Pick<UserRecord, 'displayNameMonth' | 'displayNameChanges'>,
  now = Date.now(),
): DisplayNameQuota {
  const month = tehranJalaliMonth(now);
  const used = user.displayNameMonth === month ? Math.max(0, user.displayNameChanges || 0) : 0;
  return {
    month,
    used,
    limit: DISPLAY_NAME_CHANGE_LIMIT,
    remaining: Math.max(0, DISPLAY_NAME_CHANGE_LIMIT - used),
  };
}

export function cloudDisplayNameQuota(user: UserRecord, now = Date.now()) {
  const quota = displayNameQuota(user, now);
  return {
    displayNameChangesUsed: quota.used,
    displayNameChangesRemaining: quota.remaining,
    displayNameChangesLimit: quota.limit,
  };
}

export type UserProfilePatch = {
  usePersianDigits?: boolean;
  debtReminders?: boolean;
  calendarMode?: 'jalali' | 'gregorian';
  autoSync?: boolean;
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
  expirePremium(u);
  return {
    displayName: u.displayName,
    phone: u.phone,
    email: u.email,
    plan: u.plan || 'free',
    premiumUntil: u.premiumUntil,
    usePersianDigits: u.usePersianDigits !== false,
    debtReminders: u.debtReminders !== false,
    calendarMode: u.calendarMode === 'gregorian' ? 'gregorian' : 'jalali',
    autoSync: u.autoSync !== false,
    fxWatchlist: Array.isArray(u.fxWatchlist) ? sanitizeFxWatchlist(u.fxWatchlist) : [],
    payoutMethods: u.payoutMethods === undefined ? undefined : sanitizePayoutMethods(u.payoutMethods),
    prefsUpdatedAt: u.prefsUpdatedAt,
    avatarDataUrl: u.avatarDataUrl,
    avatarPreset: u.avatarPreset,
    avatarUpdatedAt: u.avatarUpdatedAt,
    username: u.username,
    profileCoverPreset: u.profileCoverPreset,
    profileCoverDataUrl: u.profileCoverDataUrl,
    ...cloudDisplayNameQuota(u),
  };
}

export async function authSession(token: string, user: UserRecord) {
  await persistPremiumExpiry(user);
  return { token, user: publicUser(user), profile: cloudProfile(user) };
}

export async function applyDisplayNameChange(
  userId: string,
  raw: unknown,
  now = Date.now(),
): Promise<UserRecord | null> {
  const row = await getUserById(userId);
  if (!row || row.deletedAt) return null;
  const name = parseRequiredDisplayName(typeof raw === 'string' ? raw : '', 80);
  if (!name) throw new DisplayNameInvalidError();
  if (name === row.displayName) return row;
  const quota = displayNameQuota(row, now);
  if (quota.remaining <= 0) throw new DisplayNameQuotaError(quota);
  row.displayName = name;
  row.displayNameMonth = quota.month;
  row.displayNameChanges = quota.used + 1;
  row.prefsUpdatedAt = new Date(now).toISOString();
  await updateUser(row);
  return row;
}

export async function applyUserProfilePatch(userId: string, patch: UserProfilePatch): Promise<UserRecord | null> {
  const row = await getUserById(userId);
  if (!row || row.deletedAt) return null;
  if (typeof patch.usePersianDigits === 'boolean') row.usePersianDigits = patch.usePersianDigits;
  if (typeof patch.debtReminders === 'boolean') row.debtReminders = patch.debtReminders;
  if (patch.calendarMode === 'jalali' || patch.calendarMode === 'gregorian') {
    row.calendarMode = patch.calendarMode;
  }
  if (typeof patch.autoSync === 'boolean') row.autoSync = patch.autoSync;
  if (patch.fxWatchlist !== undefined) row.fxWatchlist = sanitizeFxWatchlist(patch.fxWatchlist);
  if (patch.payoutMethods !== undefined) row.payoutMethods = sanitizePayoutMethods(patch.payoutMethods);
  row.prefsUpdatedAt = new Date().toISOString();
  await updateUser(row);
  return row;
}

export function wipePublicProfile(user: UserRecord): void {
  user.username = undefined;
  user.profileCoverPreset = undefined;
  user.profileCoverDataUrl = undefined;
  user.avatarDataUrl = undefined;
  user.avatarPreset = undefined;
  user.avatarUpdatedAt = undefined;
}
