import type { LocalFriend } from './db';
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
