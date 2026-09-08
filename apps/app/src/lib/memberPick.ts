export type MemberPick =
  | { kind: 'name'; displayName: string }
  | { kind: 'user'; displayName: string; userId: string; username: string };

export function memberPickKey(pick: MemberPick): string {
  return pick.kind === 'user' ? `u:${pick.userId}` : `n:${pick.displayName}`;
}

export function memberPickLabel(pick: MemberPick): string {
  return pick.kind === 'user' ? `${pick.displayName} (@${pick.username})` : pick.displayName;
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
