export function hasUnreadChat(opts: {
  messages: { senderMemberId: string; createdAt: string }[];
  selfMemberIds: string[];
  lastReadAt?: string | null;
  muted?: boolean;
}): boolean {
  if (opts.muted) return false;
  if (!opts.lastReadAt) return false;
  const last = Date.parse(opts.lastReadAt);
  if (!Number.isFinite(last)) return false;
  const self = new Set(opts.selfMemberIds);
  return opts.messages.some((m) => {
    if (self.has(m.senderMemberId)) return false;
    const t = Date.parse(m.createdAt);
    return Number.isFinite(t) && t > last;
  });
}

export function hasUnseenPeriodActivity(opts: {
  lastSeenAt?: string | null;
  timestamps: (string | null | undefined)[];
}): boolean {
  if (!opts.lastSeenAt) return false;
  const seen = Date.parse(opts.lastSeenAt);
  if (!Number.isFinite(seen)) return false;
  return opts.timestamps.some((raw) => {
    if (!raw) return false;
    const t = Date.parse(raw);
    return Number.isFinite(t) && t > seen;
  });
}

export function periodActivityTimestamps(input: {
  expenses?: { createdAt: string; updatedAt?: string; deletedAt?: string }[];
  payments?: { createdAt: string; updatedAt?: string; deletedAt?: string }[];
  activity?: { createdAt: string }[];
  completedAt?: string;
  deletedAt?: string;
}): string[] {
  const out: string[] = [];
  for (const e of input.expenses || []) {
    out.push(e.createdAt);
    if (e.updatedAt) out.push(e.updatedAt);
    if (e.deletedAt) out.push(e.deletedAt);
  }
  for (const p of input.payments || []) {
    out.push(p.createdAt);
    if (p.updatedAt) out.push(p.updatedAt);
    if (p.deletedAt) out.push(p.deletedAt);
  }
  for (const a of input.activity || []) out.push(a.createdAt);
  if (input.completedAt) out.push(input.completedAt);
  if (input.deletedAt) out.push(input.deletedAt);
  return out;
}

export function periodHasAttention(unreadChat: boolean, unseenActivity: boolean): boolean {
  return unreadChat || unseenActivity;
}
