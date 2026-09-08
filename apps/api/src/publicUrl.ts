export { inviteExpiresAt, isInviteExpired } from '@dongham/ledger';

/** Path of the React home (period list). Apex `/` is the marketing site. */
export const APP_HOME_PATH = '/app';

export function appPublicUrl(): string {
  const raw = (process.env.APP_PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (raw) return raw;
  return process.env.NODE_ENV === 'production' ? 'https://dongham.ir' : 'http://localhost:5173';
}

export function appHomeUrl(): string {
  return `${appPublicUrl()}${APP_HOME_PATH}`;
}
