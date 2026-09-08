import { toLatinDigits } from './normalize.js';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_PATTERN = /^[a-z][a-z0-9]{2,19}$/;

/** App, marketing, and static prefixes that must not become public profile slugs. */
export const RESERVED_USERNAMES = new Set([
  'about',
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'avatars',
  'compare',
  'dorm',
  'faq',
  'features',
  'friends',
  'guide',
  'home',
  'i',
  'icons',
  'more',
  'og',
  'periods',
  'privacy',
  'profile',
  'reports',
  'terms',
  'theme',
  'transactions',
  'travel',
]);

export type UsernameFailReason = 'empty' | 'invalid' | 'reserved';

export type ParseUsernameResult =
  | { ok: true; username: string }
  | { ok: false; reason: UsernameFailReason };

export const USERNAME_ERROR_FA: Record<UsernameFailReason, string> = {
  empty: 'یوزرنیم را وارد کنید',
  invalid: 'یوزرنیم باید با حرف انگلیسی شروع شود و فقط حرف و رقم انگلیسی داشته باشد',
  reserved: 'این یوزرنیم رزرو شده است',
};

/** Strip @, map Persian digits, lowercase. */
export function normalizeUsernameInput(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let value = toLatinDigits(raw).trim().toLowerCase();
  if (value.startsWith('@')) value = value.slice(1).trim();
  return value;
}

export function parseUsername(raw: unknown): ParseUsernameResult {
  const username = normalizeUsernameInput(raw);
  if (!username) return { ok: false, reason: 'empty' };
  if (!USERNAME_PATTERN.test(username)) return { ok: false, reason: 'invalid' };
  if (RESERVED_USERNAMES.has(username)) return { ok: false, reason: 'reserved' };
  return { ok: true, username };
}

/** Single-segment public profile path such as `/mmdshry`. Reserved routes return undefined. */
export function usernameFromPath(pathname: string): string | undefined {
  const path = pathname.trim().split(/[?#]/)[0] || '';
  if (!path.startsWith('/')) return undefined;
  const slug = path.slice(1).replace(/\/$/, '');
  if (!slug || slug.includes('/')) return undefined;
  const parsed = parseUsername(slug);
  return parsed.ok ? parsed.username : undefined;
}

export function isPublicProfilePath(pathname: string): boolean {
  return Boolean(usernameFromPath(pathname));
}
