import { useLiveQuery } from 'dexie-react-hooks';
import { Bell, QrCode } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { ConnectionModeBadge } from './ConnectionModeBadge';
import { Icon } from './Icon';
import { db } from '../lib/db';
import { JOIN_OFFLINE_ERROR } from '../lib/joinPeriod';
import { toPersianDigits } from '../lib/format';
import { usePersianDigits } from '../lib/usePersianDigits';
import { useUiStore } from '../store/ui';

export function AppHeader() {
  const openSheet = useUiStore((s) => s.openSheet);
  const online = useUiStore((s) => s.online);
  const notifications = useLiveQuery(() => db.notifications.toArray(), []) || [];
  const unread = notifications.filter((n) => !n.read).length;
  const persian = usePersianDigits();
  const unreadLabel = unread
    ? `اعلان‌ها، ${toPersianDigits(unread, persian)} خوانده‌نشده`
    : 'اعلان‌ها';

  return (
    <header className="relative mb-6 flex items-center justify-between pt-1 md:hidden">
      <button
        type="button"
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl text-ink-800 duration-150 hover:bg-brand-100 active:bg-brand-100"
        onClick={() => openSheet('notifs')}
        aria-label={unreadLabel}
      >
        <Icon icon={Bell} size={24} />
        {unread > 0 ? (
          <span className="absolute start-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" aria-hidden />
        ) : null}
      </button>
      <div className="flex flex-col items-center gap-1">
        <BrandLogo />
        <ConnectionModeBadge />
      </div>
      <button
        type="button"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl text-ink-800 duration-150 hover:bg-brand-100 active:bg-brand-100 disabled:opacity-50"
        onClick={() => openSheet('join')}
        disabled={!online}
        title={!online ? JOIN_OFFLINE_ERROR : undefined}
        aria-label="ورود با شناسه یا اسکن QR"
      >
        <Icon icon={QrCode} size={24} />
      </button>
    </header>
  );
}
