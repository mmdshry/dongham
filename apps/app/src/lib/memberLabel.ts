import { memberBelongsToActor } from '@dongham/ledger';

export const PLACEHOLDER_DISPLAY_NAME = 'من';
export const DISPLAY_NAME_MAX = 80;

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
