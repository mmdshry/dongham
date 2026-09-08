import { normalizeEmail, normalizeIranMobile, toLatinDigits } from './normalize.js';
import { normalizeUsernameInput, USERNAME_MAX } from './username.js';

export const MEMBER_SEARCH_MIN = 3;
export const MEMBER_SEARCH_LIMIT = 8;

export type MemberSearchQuery =
  | { kind: 'too_short' }
  | { kind: 'phone'; phone: string }
  | { kind: 'email'; email: string }
  | { kind: 'username'; prefix: string }
  | { kind: 'incomplete_phone' }
  | { kind: 'empty' };

function compactPhoneInput(raw: string): string {
  const compact = toLatinDigits(raw).trim().replace(/[\s-]/g, '');
  return compact.startsWith('+') ? compact.slice(1) : compact;
}

function looksLikePhoneInput(raw: string): boolean {
  return /^\d+$/.test(compactPhoneInput(raw));
}

/** Classify owner/manager member-picker input into an exact or prefix search. */
export function classifyMemberSearchQuery(raw: unknown): MemberSearchQuery {
  if (typeof raw !== 'string') return { kind: 'too_short' };
  const trimmed = toLatinDigits(raw).trim();
  if (!trimmed) return { kind: 'too_short' };

  const phone = normalizeIranMobile(trimmed);
  if (phone) return { kind: 'phone', phone };

  if (looksLikePhoneInput(trimmed)) {
    return compactPhoneInput(trimmed).length >= MEMBER_SEARCH_MIN
      ? { kind: 'incomplete_phone' }
      : { kind: 'too_short' };
  }

  const usernameHint = trimmed.startsWith('@');
  if (trimmed.includes('@') && !usernameHint) {
    const email = normalizeEmail(trimmed);
    if (email) return { kind: 'email', email };
    return trimmed.length >= MEMBER_SEARCH_MIN ? { kind: 'empty' } : { kind: 'too_short' };
  }

  const username = normalizeUsernameInput(trimmed);
  const prefix = username.replace(/[^a-z0-9]/g, '');
  if (prefix.length < MEMBER_SEARCH_MIN) {
    return trimmed.replace(/^@+/, '').length >= MEMBER_SEARCH_MIN ? { kind: 'empty' } : { kind: 'too_short' };
  }
  if (!/^[a-z][a-z0-9]*$/.test(prefix)) return { kind: 'empty' };
  return { kind: 'username', prefix: prefix.slice(0, USERNAME_MAX) };
}

export function memberSearchNeedsCloud(
  query: MemberSearchQuery,
): query is Extract<MemberSearchQuery, { kind: 'phone' } | { kind: 'email' } | { kind: 'username' }> {
  return query.kind === 'phone' || query.kind === 'email' || query.kind === 'username';
}
