import {
  classifyMemberSearchQuery,
  MEMBER_SEARCH_MIN,
  normalizeEmail,
  normalizeIranMobile,
  toLatinDigits,
} from '@dongham/ledger';

export type MemberPick =
  | { kind: 'name'; displayName: string }
  | {
      kind: 'user';
      displayName: string;
      userId: string;
      username: string;
      avatarPreset?: string;
      avatarSrc?: string;
    };

export function memberPickKey(pick: MemberPick): string {
  return pick.kind === 'user' ? `u:${pick.userId}` : `n:${pick.displayName}`;
}

export function memberPickLabel(pick: MemberPick): string {
  if (pick.kind === 'user' && pick.username) return `${pick.displayName} (@${pick.username})`;
  return pick.displayName;
}

export function uniqueMemberPicks(picks: MemberPick[]): MemberPick[] {
  const seen = new Set<string>();
  const out: MemberPick[] = [];
  for (const pick of picks) {
    const key = memberPickKey(pick);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pick);
  }
  return out;
}

export function contactMatchesMemberQuery(
  query: string,
  contact: { displayName: string; phone?: string; email?: string },
): boolean {
  const classified = classifyMemberSearchQuery(query);
  if (classified.kind === 'phone') {
    return normalizeIranMobile(contact.phone) === classified.phone;
  }
  if (classified.kind === 'email') {
    return normalizeEmail(contact.email) === classified.email;
  }
  const needle = toLatinDigits(query).trim().toLowerCase();
  if (classified.kind === 'incomplete_phone') {
    const digits = needle.replace(/\D/g, '');
    const friendDigits = toLatinDigits(contact.phone || '').replace(/\D/g, '');
    return Boolean(digits && friendDigits.includes(digits));
  }
  if (needle.length < MEMBER_SEARCH_MIN) return false;
  return contact.displayName.toLowerCase().includes(needle);
}
