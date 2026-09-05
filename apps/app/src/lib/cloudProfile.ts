import { nanoid } from 'nanoid';
import { api, ensureProfile, updateProfile } from './api';
import { FX_WATCH_META, LAST_USER_META, readCalendarMode, writeCalendarMode } from './calendarPref';
import type { CloudPayoutMethod, CloudProfile } from '@dongham/ledger';
import { encryptText } from './crypto';
import { db, type LocalProfile, type PayoutMethod } from './db';
import { parseWatchlist } from './fx';
import { listPayouts, syncSelfPayoutToMembers } from './payout';
import {
  shouldApplyServerPayouts,
  shouldPushLocalPayouts,
  shouldPushPrefs,
  shouldResetLocalAccount,
} from './accountSync';

export type { CloudPayoutMethod, CloudProfile };

export type AuthUser = {
  id: string;
  displayName: string;
  phone?: string;
  email?: string;
  plan?: 'free' | 'premium';
  premiumUntil?: string;
};

export { shouldApplyServerPayouts, shouldPushLocalPayouts, shouldPushPrefs, shouldResetLocalAccount } from './accountSync';

async function encryptCloudMethods(methods: CloudPayoutMethod[]): Promise<PayoutMethod[]> {
  const out: PayoutMethod[] = [];
  for (const m of methods) {
    out.push({
      id: m.id,
      label: m.label,
      cardNumber: await encryptText(m.cardNumber),
      sheba: m.sheba ? await encryptText(m.sheba) : undefined,
      cardHolderName: m.cardHolderName,
      bankName: m.bankName,
      accountNumber: m.accountNumber,
      isDefault: m.isDefault,
    });
  }
  return out;
}

async function loadLocalWatchlist(): Promise<string[]> {
  const row = await db.meta.get(FX_WATCH_META);
  return parseWatchlist(row?.value);
}

async function applyEncryptedPayouts(methods: CloudPayoutMethod[]) {
  const encrypted = await encryptCloudMethods(methods);
  const def = encrypted.find((m) => m.isDefault) || encrypted[0];
  await updateProfile({
    payoutMethods: encrypted,
    cardNumber: def?.cardNumber,
    sheba: def?.sheba,
    cardHolderName: def?.cardHolderName,
    bankName: def?.bankName,
    payoutDirty: false,
  });
}

async function applyPrefs(cloud: CloudProfile) {
  const calendarMode = cloud.calendarMode === 'gregorian' ? 'gregorian' : 'jalali';
  writeCalendarMode(calendarMode);
  await db.meta.put({ key: FX_WATCH_META, value: JSON.stringify(cloud.fxWatchlist || []) });
  await updateProfile({
    displayName: cloud.displayName,
    phone: cloud.phone,
    email: cloud.email,
    plan: cloud.plan || 'free',
    premiumUntil: cloud.premiumUntil,
    usePersianDigits: cloud.usePersianDigits,
    debtReminders: cloud.debtReminders,
    calendarMode,
    prefsUpdatedAt: cloud.prefsUpdatedAt,
  });
}

export async function resetLocalAccountData(): Promise<void> {
  const keepMeta = new Set(['deviceId', 'encKey']);
  await db.transaction(
    'rw',
    [
      db.profile,
      db.periods,
      db.members,
      db.expenses,
      db.payments,
      db.chat,
      db.outbox,
      db.friends,
      db.invites,
      db.recurring,
      db.notifications,
      db.activity,
      db.meta,
    ],
    async () => {
      await db.periods.clear();
      await db.members.clear();
      await db.expenses.clear();
      await db.payments.clear();
      await db.chat.clear();
      await db.outbox.clear();
      await db.friends.clear();
      await db.invites.clear();
      await db.recurring.clear();
      await db.notifications.clear();
      await db.activity.clear();
      const meta = await db.meta.toArray();
      for (const row of meta) {
        if (!keepMeta.has(row.key)) await db.meta.delete(row.key);
      }
      await db.profile.put({
        id: 'self',
        guestKey: nanoid(),
        displayName: 'من',
        usePersianDigits: true,
        plan: 'free',
        payoutMethods: [],
        debtReminders: true,
        calendarMode: 'jalali',
      });
    },
  );
  try {
    localStorage.removeItem('dongham_widget');
  } catch {
    /* ignore */
  }
}

export async function rememberUserId(userId?: string): Promise<void> {
  if (!userId) return;
  await db.meta.put({ key: LAST_USER_META, value: userId });
}

export async function previousUserId(profile?: LocalProfile | null): Promise<string | undefined> {
  if (profile?.userId) return profile.userId;
  const row = await db.meta.get(LAST_USER_META);
  return row?.value;
}

export async function pushCloudProfile(opts?: { includePayouts?: boolean }): Promise<void> {
  const profile = await ensureProfile();
  if (!profile.token) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const body: Record<string, unknown> = {
    displayName: profile.displayName,
    usePersianDigits: profile.usePersianDigits !== false,
    debtReminders: profile.debtReminders !== false,
    calendarMode: profile.calendarMode || readCalendarMode(),
    fxWatchlist: await loadLocalWatchlist(),
  };
  if (opts?.includePayouts) {
    const methods = await listPayouts(profile);
    body.payoutMethods = methods
      .filter((m) => m.card)
      .map((m) => ({
        id: m.id,
        label: m.label,
        cardNumber: m.card,
        sheba: m.sheba || undefined,
        cardHolderName: m.holder || undefined,
        bankName: m.bank || undefined,
        accountNumber: m.accountNumber,
        isDefault: m.isDefault,
      }));
  }
  const res = await api<{ profile: CloudProfile }>('/auth/me', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  await updateProfile({
    prefsUpdatedAt: res.profile.prefsUpdatedAt,
    payoutDirty: opts?.includePayouts ? false : profile.payoutDirty,
    displayName: res.profile.displayName,
  });
}

export async function syncCloudProfile(seed?: CloudProfile): Promise<void> {
  const profile = await ensureProfile();
  if (!profile.token) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const cloud =
    seed ||
    (
      await api<{ profile: CloudProfile }>('/auth/me')
    ).profile;
  if (!cloud) return;
  const localCards = await listPayouts(profile);
  const localHasCards = localCards.some((m) => m.card);
  const includePayouts = shouldPushLocalPayouts(localHasCards, Boolean(profile.payoutDirty), cloud.payoutMethods);
  const pushPrefs = shouldPushPrefs(profile.prefsUpdatedAt, cloud.prefsUpdatedAt);
  if (pushPrefs || includePayouts) {
    await pushCloudProfile({ includePayouts });
    return;
  }
  await applyPrefs(cloud);
  if (shouldApplyServerPayouts(Boolean(profile.payoutDirty), cloud.payoutMethods)) {
    await applyEncryptedPayouts(cloud.payoutMethods || []);
  }
}

export async function updateAccountPrefs(patch: Partial<LocalProfile>): Promise<LocalProfile> {
  if (patch.calendarMode === 'jalali' || patch.calendarMode === 'gregorian') {
    writeCalendarMode(patch.calendarMode);
  }
  const next = await updateProfile({
    ...patch,
    prefsUpdatedAt: new Date().toISOString(),
  });
  void pushCloudProfile({ includePayouts: Boolean(patch.payoutDirty) }).catch(() => undefined);
  return next;
}

export async function applyAuthSession(res: {
  token: string;
  user: AuthUser;
  profile?: CloudProfile;
}): Promise<void> {
  const current = await ensureProfile();
  const last = await previousUserId(current);
  if (shouldResetLocalAccount(last, res.user.id)) {
    await resetLocalAccountData();
  }
  await rememberUserId(res.user.id);
  await updateProfile({
    token: res.token,
    userId: res.user.id,
    displayName: res.user.displayName,
    phone: res.user.phone,
    email: res.user.email,
    plan: res.user.plan || 'free',
    premiumUntil: res.user.premiumUntil,
  });
  await syncCloudProfile(res.profile);
  await syncSelfPayoutToMembers();
}
