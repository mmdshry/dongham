import { nanoid } from 'nanoid';
import { expirePremium, sanitizeFxWatchlist, toLatinDigits } from '@dongham/ledger';
import type { CloudPayoutMethod, CloudProfile } from '@dongham/ledger';
import { getUserById, updateUser } from './repo.js';
import type { UserRecord } from './types.js';

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

export type UserProfilePatch = {
  displayName?: string;
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
  };
}

export async function authSession(token: string, user: UserRecord) {
  await persistPremiumExpiry(user);
  return { token, user: publicUser(user), profile: cloudProfile(user) };
}

export async function applyUserProfilePatch(userId: string, patch: UserProfilePatch): Promise<UserRecord | null> {
  const row = await getUserById(userId);
  if (!row || row.deletedAt) return null;
  if (typeof patch.displayName === 'string') {
    // Same ceiling as the client's DISPLAY_NAME_MAX and users.display_name VARCHAR(80).
    const name = parseRequiredDisplayName(patch.displayName, 80);
    if (name) row.displayName = name;
  }
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
