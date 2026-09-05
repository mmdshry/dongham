export { inviteExpiresAt, isInviteExpired } from '@dongham/ledger';

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

