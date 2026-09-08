import { nanoid } from 'nanoid';
import { LAST_USER_META } from './calendarPref';
import { db, type LocalProfile } from './db';

const DEVICE_KEY = 'deviceId';

export async function getDeviceId(): Promise<string> {
  const row = await db.meta.get(DEVICE_KEY);
  if (row?.value) return row.value;
  const id = nanoid();
  await db.meta.put({ key: DEVICE_KEY, value: id });
  return id;
}

export async function ensureProfile(): Promise<LocalProfile> {
  const existing = await db.profile.get('self');
  if (existing) return existing;
  const profile: LocalProfile = {
    id: 'self',
    guestKey: nanoid(),
    displayName: '',
    usePersianDigits: true,
    plan: 'free',
  };
  await db.profile.put(profile);
  return profile;
}

export async function updateProfile(patch: Partial<LocalProfile>): Promise<LocalProfile> {
  const current = await ensureProfile();
  const next = { ...current, ...patch, id: 'self' as const };
  await db.profile.put(next);
  return next;
}

export const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export const SESSION_EXPIRED_MESSAGE = 'نشست منقضی شده؛ دوباره وارد شوید';

/** Login-style endpoints answer 401 for wrong credentials, not for an expired session. */
const CREDENTIAL_PATHS = ['/auth/otp/', '/auth/email-otp/', '/auth/login', '/auth/register', '/auth/google', '/auth/impersonate'];

const sessionExpiredListeners = new Set<() => void>();

/** Fires once when a stored token is rejected by the server (token already cleared). */
export function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

/**
 * A 401 on an authenticated call means the JWT or its server session is gone.
 * Clear the token so the UI stops claiming «حالت ابری» and the outbox stops retrying.
 */
async function handleSessionExpired(path: string, hadToken: boolean): Promise<void> {
  if (!hadToken || CREDENTIAL_PATHS.some((p) => path.startsWith(p))) return;
  const current = await db.profile.get('self');
  if (!current?.token) return;
  if (current.userId) await db.meta.put({ key: LAST_USER_META, value: current.userId });
  await db.profile.put({ ...current, token: undefined });
  for (const listener of sessionExpiredListeners) listener();
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const profile = await ensureProfile();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (profile.token) headers.set('Authorization', `Bearer ${profile.token}`);
  headers.set('X-Device-Id', await getDeviceId());
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      await handleSessionExpired(path, Boolean(profile.token));
      if (profile.token && !CREDENTIAL_PATHS.some((p) => path.startsWith(p))) {
        throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, data);
      }
    }
    throw new ApiError((data as { error?: string }).error || res.statusText, res.status, data);
  }
  return data as T;
}
