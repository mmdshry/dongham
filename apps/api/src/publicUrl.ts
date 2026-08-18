export function appPublicUrl(): string {
  const raw = (process.env.APP_PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (raw) return raw;
  return process.env.NODE_ENV === 'production' ? 'https://app.dongham.ir' : 'http://localhost:5173';
}

export function telegramBotUsername(): string {
  return (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
}

export function telegramMiniAppInviteUrl(token: string): string | undefined {
  const bot = telegramBotUsername();
  if (!bot) return undefined;
  return `https://t.me/${bot}/app?startapp=${encodeURIComponent(token)}`;
}

export function inviteExpiresAt(from = new Date()): string {
  return new Date(from.getTime() + 30 * 86400_000).toISOString();
}

export function isInviteExpired(invite: { expiresAt?: string }, now = Date.now()): boolean {
  if (!invite.expiresAt) return false;
  const ts = Date.parse(invite.expiresAt);
  return Number.isNaN(ts) ? false : ts <= now;
}
