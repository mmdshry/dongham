import { useLiveQuery } from 'dexie-react-hooks';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';
import { ConnectionModeBadge } from './ConnectionModeBadge';
import { Icon } from './Icon';
import { db } from '../lib/db';
import { formatMoney } from '../lib/format';
import { COVER_EMPTY } from '../lib/periodCover';
import { useUiStore } from '../store/ui';
import { ToastBar } from './ToastBar';
import { UnreadDot } from './UnreadDot';

export { ConnectionModeBadge } from './ConnectionModeBadge';

export function ToastHost() {
  const toast = useUiStore((s) => s.toast);
  const setToast = useUiStore((s) => s.setToast);
  if (!toast) return null;
  return (
    <ToastBar
      key={toast.id}
      toast={toast}
      onDismiss={() => setToast(null)}
      className="fixed left-1/2 z-50 max-w-[90vw] -translate-x-1/2 bottom-[max(7.25rem,calc(var(--keyboard-inset,0px)+1rem))] md:bottom-[max(2rem,calc(var(--keyboard-inset,0px)+1rem))]"
    />
  );
}

export function EmptyState({
  title,
  hint,
  image,
  icon,
  action,
}: {
  title: string;
  hint?: string;
  image?: boolean;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="card-surface animate-rise overflow-hidden !p-0 text-center">
      {image ? (
        <div className="aspect-[16/9] w-full overflow-hidden bg-[rgb(var(--bg))] sm:aspect-[2/1]">
          <img
            src={COVER_EMPTY}
            alt=""
            className="h-full w-full object-cover object-center"
          />
        </div>
      ) : icon ? (
        <div className="flex justify-center pt-6 text-brand-700/35">
          <Icon icon={icon} size={40} strokeWidth={1.6} />
        </div>
      ) : null}
      <div className="p-5 sm:p-6">
        <p className="text-base font-extrabold text-ink-900">{title}</p>
        {hint ? <p className="mt-2 text-sm leading-6 text-ink-700/70">{hint}</p> : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}

export function Money({ amount, currency = 'IRT' }: { amount: number; currency?: string }) {
  const profile = useLiveQuery(() => db.profile.get('self'));
  const persian = profile?.usePersianDigits ?? true;
  if (currency === 'IRT') {
    const n = new Intl.NumberFormat(persian ? 'fa-IR' : 'en-US').format(amount);
    return (
      <span className="inline-flex items-center gap-1 tabular-nums">
        <span dir="ltr">{n}</span>
        <span>تومان</span>
      </span>
    );
  }
  return <span className="tabular-nums">{formatMoney(amount, currency, persian)}</span>;
}

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">در حال بارگذاری</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card-surface h-28 animate-pulse bg-brand-50" />
      ))}
    </div>
  );
}

export function Shell({
  title,
  children,
  action,
  back,
  chrome = 'page',
  attention,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  back?: () => void;
  chrome?: 'app' | 'page';
  attention?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-36 pt-[max(1rem,env(safe-area-inset-top))] md:pb-10 md:pt-6">
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:z-50 focus-visible:rounded-xl focus-visible:bg-surface focus-visible:px-3 focus-visible:py-2"
      >
        پرش به محتوا
      </a>
      {chrome === 'app' ? (
        <>
          <AppHeader />
          <h1 className="sr-only">{title}</h1>
        </>
      ) : (
        <header className="mb-5 flex items-center justify-between gap-3 animate-rise">
          <div className="flex min-w-0 items-center gap-3">
            {back ? (
              <button
                type="button"
                className="btn-ghost !min-h-11 !min-w-11 shrink-0 !px-0"
                onClick={back}
                aria-label="بازگشت"
              >
                <Icon icon={ChevronRight} size={20} />
              </button>
            ) : null}
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-xl font-extrabold text-ink-900 md:text-2xl">{title}</h1>
                {attention ? <UnreadDot /> : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="md:hidden">
              <ConnectionModeBadge compact />
            </span>
            <span className="hidden md:inline-flex">
              <ConnectionModeBadge />
            </span>
            {action}
          </div>
        </header>
      )}
      <main id="main">{children}</main>
    </div>
  );
}
