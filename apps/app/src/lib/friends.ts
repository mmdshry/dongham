import type { LocalFriend } from './db';
import { api, ensureProfile } from './api';
import { normalizeEmail, normalizeIranMobile } from './format';

export function friendContactTaken(
  friends: LocalFriend[],
  input: { phone?: string; email?: string },
  excludeId?: string,
): 'phone' | 'email' | null {
  const nPhone = normalizeIranMobile(input.phone);
  const nEmail = normalizeEmail(input.email);
  for (const f of friends) {
    if (excludeId && f.id === excludeId) continue;
    if (nPhone && normalizeIranMobile(f.phone) === nPhone) return 'phone';
    if (nEmail && normalizeEmail(f.email) === nEmail) return 'email';
  }
  return null;
}

export function friendByUserId(friends: LocalFriend[], friendUserId?: string): LocalFriend | undefined {
  if (!friendUserId) return undefined;
  return friends.find((f) => f.friendUserId === friendUserId);
}

export type FriendWrite = {
  id: string;
  displayName: string;
  phone?: string;
  email?: string;
  friendUserId?: string;
};

export async function persistFriendCloud(
  method: 'POST' | 'PUT' | 'DELETE',
  friend: FriendWrite,
): Promise<void> {
  const profile = await ensureProfile();
  if (!profile.token) return;
  const path = method === 'POST' ? '/friends' : `/friends/${friend.id}`;
  try {
    await api(path, {
      method,
      body: method === 'DELETE' ? undefined : JSON.stringify(friend),
    });
  } catch {
    /* offline ok */
  }
}
