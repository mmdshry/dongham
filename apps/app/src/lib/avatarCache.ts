import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { api, ensureProfile } from './api';
import { splitDataUrl } from './avatar';
import { db, type LocalAvatar } from './db';
import { isSelfMember } from './memberLabel';
import { userAvatarSrc } from './userAvatarPresets';

export function memberAvatarSrc(
  member: { guestKey?: string; userId?: string } | null | undefined,
  profile:
    | { guestKey?: string; userId?: string; avatarDataUrl?: string; avatarPreset?: string }
    | null
    | undefined,
  avatarByUserId: Record<string, string> = {},
): string | undefined {
  if (!member) return undefined;
  if (isSelfMember(member, profile)) {
    if (member.userId && avatarByUserId[member.userId]) return avatarByUserId[member.userId];
    if (profile?.userId && avatarByUserId[profile.userId]) return avatarByUserId[profile.userId];
    return userAvatarSrc(profile);
  }
  if (member.userId) return avatarByUserId[member.userId];
  return undefined;
}

export async function cacheAvatar(userId: string, dataUrl: string, updatedAt?: string): Promise<void> {
  await db.avatars.put({
    userId,
    dataUrl,
    updatedAt: updatedAt || new Date().toISOString(),
  });
}

export async function clearCachedAvatar(userId?: string): Promise<void> {
  if (userId) {
    await db.avatars.delete(userId);
    return;
  }
  await db.avatars.clear();
}

type AvatarProfile = { avatarDataUrl?: string; avatarPreset?: string; avatarUpdatedAt?: string };

export async function pushAvatar(dataUrl: string): Promise<void> {
  const profile = await ensureProfile();
  const { mime, dataBase64 } = splitDataUrl(dataUrl);
  await writeLocalAvatar({ avatarDataUrl: dataUrl });
  if (profile.userId) await cacheAvatar(profile.userId, dataUrl);
  if (!profile.token) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const res = await api<{ profile: AvatarProfile }>('/auth/me/avatar', {
    method: 'POST',
    body: JSON.stringify({ mime, dataBase64 }),
  });
  await applyRemoteAvatar(profile.userId, res.profile);
}

export async function pushAvatarPreset(preset: string): Promise<void> {
  const profile = await ensureProfile();
  const src = userAvatarSrc({ avatarPreset: preset });
  await writeLocalAvatar({ avatarPreset: preset });
  if (profile.userId && src) await cacheAvatar(profile.userId, src);
  if (!profile.token) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const res = await api<{ profile: AvatarProfile }>('/auth/me/avatar', {
    method: 'POST',
    body: JSON.stringify({ avatarPreset: preset }),
  });
  await applyRemoteAvatar(profile.userId, res.profile);
}

export async function removeAvatar(): Promise<void> {
  const profile = await ensureProfile();
  await writeLocalAvatar({});
  if (profile.userId) await clearCachedAvatar(profile.userId);
  if (!profile.token) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  await api('/auth/me/avatar', { method: 'DELETE' });
}

async function applyRemoteAvatar(userId: string | undefined, cloud: AvatarProfile): Promise<void> {
  await writeLocalAvatar({
    avatarDataUrl: cloud.avatarDataUrl,
    avatarPreset: cloud.avatarPreset,
  });
  const src = userAvatarSrc(cloud);
  if (userId && src) await cacheAvatar(userId, src, cloud.avatarUpdatedAt);
}

async function writeLocalAvatar(next: { avatarDataUrl?: string; avatarPreset?: string }): Promise<void> {
  const current = await ensureProfile();
  const row = { ...current, id: 'self' as const };
  if (next.avatarDataUrl) {
    row.avatarDataUrl = next.avatarDataUrl;
    delete row.avatarPreset;
  } else if (next.avatarPreset) {
    row.avatarPreset = next.avatarPreset;
    delete row.avatarDataUrl;
  } else {
    delete row.avatarDataUrl;
    delete row.avatarPreset;
  }
  await db.profile.put(row);
}

export async function refreshAvatars(userIds: string[]): Promise<void> {
  const profile = await ensureProfile();
  if (!profile.token) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, 50);
  if (!ids.length) return;
  const res = await api<{ avatars: { userId: string; dataUrl?: string; preset?: string; updatedAt?: string }[] }>(
    `/avatars?ids=${encodeURIComponent(ids.join(','))}`,
  );
  const found = new Set(res.avatars.map((row) => row.userId));
  await db.transaction('rw', db.avatars, async () => {
    for (const row of res.avatars) {
      const dataUrl = userAvatarSrc({ avatarDataUrl: row.dataUrl, avatarPreset: row.preset });
      if (!dataUrl) continue;
      await db.avatars.put({
        userId: row.userId,
        dataUrl,
        updatedAt: row.updatedAt || new Date().toISOString(),
      });
    }
    for (const id of ids) {
      if (!found.has(id) && id !== profile.userId) await db.avatars.delete(id);
    }
  });
}

export function useAvatarMap(userIds: Array<string | undefined | null>): Record<string, string> {
  const key = [...new Set(userIds.filter((id): id is string => Boolean(id)))].sort().join(',');
  const ids = key ? key.split(',') : [];
  const rows = useLiveQuery(async () => {
    if (!ids.length) return [] as LocalAvatar[];
    const list = await db.avatars.bulkGet(ids);
    return list.filter((row): row is LocalAvatar => Boolean(row));
  }, [key]);
  useEffect(() => {
    if (!ids.length) return;
    void refreshAvatars(ids).catch(() => undefined);
  }, [key]);
  const map: Record<string, string> = {};
  for (const row of rows || []) {
    if (row.dataUrl) map[row.userId] = row.dataUrl;
  }
  return map;
}
