import { nanoid } from 'nanoid';
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
    displayName: 'من',
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

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

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
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
  return data as T;
}
