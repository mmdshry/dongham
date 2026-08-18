export type PremiumLike = {
  plan?: string | null;
  premiumUntil?: string | null;
} | null | undefined;

/** Active premium requires plan=premium and a future premiumUntil. */
export function isPremium(user: PremiumLike, now = Date.now()): boolean {
  if (!user || user.plan !== 'premium' || !user.premiumUntil) return false;
  const until = Date.parse(user.premiumUntil);
  if (Number.isNaN(until)) return false;
  return until > now;
}

/** Downgrade expired or dateless premium rows. Returns true if plan changed. */
export function expirePremium<T extends { plan?: string; premiumUntil?: string }>(user: T, now = Date.now()): boolean {
  if (user.plan !== 'premium') return false;
  if (isPremium(user, now)) return false;
  user.plan = 'free' as T['plan'];
  return true;
}
