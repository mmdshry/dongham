import { memberBelongsToActor } from '@dongham/ledger';

export const PLACEHOLDER_DISPLAY_NAME = 'من';
export const DISPLAY_NAME_MAX = 80;
export const GUEST_DISPLAY_NAME_PREFIX = 'کاربر مهمان';

const GUEST_DISPLAY_NAME_RE = /^کاربر مهمان \d{5}$/;

export function randomGuestDisplayName(): string {
  const n = 10000 + Math.floor(Math.random() * 90000);
  return `${GUEST_DISPLAY_NAME_PREFIX} ${n}`;
}

export function isGuestDisplayName(name?: string): boolean {
  return GUEST_DISPLAY_NAME_RE.test(normalizeDisplayName(name));
}

export function normalizeDisplayName(name?: string): string {
  return (name || '').trim().slice(0, DISPLAY_NAME_MAX);
}

export function needsDisplayName(name?: string): boolean {
  const n = normalizeDisplayName(name);
  return !n || n === PLACEHOLDER_DISPLAY_NAME;
}

export function isSelfMember(
  member?: { guestKey?: string; userId?: string; phone?: string; email?: string } | null,
  profile?: { guestKey?: string; userId?: string; phone?: string; email?: string } | null,
): boolean {
  return memberBelongsToActor(member, profile);
}

export function displayNameWithMe(name: string, isSelf: boolean): string {
  const n = name.trim();
  if (!n || !isSelf) return n;
  return `${n} (${PLACEHOLDER_DISPLAY_NAME})`;
}
