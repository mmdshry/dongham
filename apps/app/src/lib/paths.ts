/** In-app home (period list). Apex `/` is the marketing site in production. */
export const APP_HOME = '/app';

export { isPublicProfilePath, usernameFromPath } from '@dongham/ledger';

/** Same-origin relative path only; blocks `//host` and absolute URLs in `?next=`. */
export function safeAuthNextPath(raw: string | null | undefined, fallback = APP_HOME): string {
  if (!raw) return fallback;
  const path = raw.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return fallback;
  if (path.includes('://')) return fallback;
  return path;
}
