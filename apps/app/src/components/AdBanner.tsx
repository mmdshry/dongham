import { Capacitor } from '@capacitor/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { isPremium } from '../lib/billing';

export function AdBanner() {
  const profile = useLiveQuery(() => db.profile.get('self'));
  if (!Capacitor.isNativePlatform()) return null;
  if (isPremium(profile)) return null;
  return (
    <aside
      className="mx-auto mb-3 max-w-lg rounded-2xl bg-brand-50 px-3 py-2 text-center text-xs text-ink-700/80"
      aria-label="تبلیغ"
    >
      نسخه رایگان دونگ‌هام — برای حذف تبلیغ، اشتراک بازار را فعال کنید.
    </aside>
  );
}
