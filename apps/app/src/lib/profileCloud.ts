import { api, ensureProfile, updateProfile } from './api';
import { splitDataUrl } from './avatar';
import type { CloudProfile } from '@dongham/ledger';

type CoverProfile = Pick<CloudProfile, 'profileCoverPreset' | 'profileCoverDataUrl'>;

async function applyCover(cloud: CoverProfile): Promise<void> {
  await updateProfile({
    profileCoverPreset: cloud.profileCoverPreset,
    profileCoverDataUrl: cloud.profileCoverDataUrl,
  });
}

export async function pushProfileCoverPreset(preset: string): Promise<void> {
  const profile = await ensureProfile();
  await updateProfile({ profileCoverPreset: preset, profileCoverDataUrl: undefined });
  if (!profile.token) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const res = await api<{ profile: CoverProfile }>('/auth/me/cover', {
    method: 'PUT',
    body: JSON.stringify({ coverPreset: preset }),
  });
  await applyCover(res.profile);
}

export async function pushProfileCover(dataUrl: string): Promise<void> {
  const profile = await ensureProfile();
  const { mime, dataBase64 } = splitDataUrl(dataUrl);
  await updateProfile({ profileCoverDataUrl: dataUrl, profileCoverPreset: undefined });
  if (!profile.token) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const res = await api<{ profile: CoverProfile }>('/auth/me/cover', {
    method: 'PUT',
    body: JSON.stringify({ mime, dataBase64 }),
  });
  await applyCover(res.profile);
}

export async function removeProfileCover(): Promise<void> {
  const profile = await ensureProfile();
  await updateProfile({ profileCoverPreset: undefined, profileCoverDataUrl: undefined });
  if (!profile.token) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  await api('/auth/me/cover', { method: 'DELETE' });
}

export async function saveUsername(username: string): Promise<string | undefined> {
  const res = await api<{ user: { username?: string }; profile: { username?: string } }>('/auth/me/username', {
    method: 'PUT',
    body: JSON.stringify({ username }),
  });
  const next = res.profile.username || res.user.username;
  await updateProfile({ username: next });
  return next;
}
