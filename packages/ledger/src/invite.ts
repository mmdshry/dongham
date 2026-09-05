export const INVITE_TTL_MS = 30 * 86400_000;

export function inviteExpiresAt(from = new Date()): string {
  return new Date(from.getTime() + INVITE_TTL_MS).toISOString();
}

export function isInviteExpired(
  invite: { expiresAt?: string; createdAt?: string },
  now = Date.now(),
): boolean {
  if (invite.expiresAt) {
    const ts = Date.parse(invite.expiresAt);
    return Number.isNaN(ts) ? false : ts <= now;
  }
  if (invite.createdAt) {
    const ts = Date.parse(invite.createdAt);
    return Number.isNaN(ts) ? false : ts + INVITE_TTL_MS <= now;
  }
  return true;
}
