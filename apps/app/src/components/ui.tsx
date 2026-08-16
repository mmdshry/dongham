import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { AdBanner } from './AdBanner';
import { db } from '../lib/db';
import { formatMoney } from '../lib/format';
import { useUiStore } from '../store/ui';

export function ToastHost() {
  const toast = useUiStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      role="status"
      className="fixed left-1/2 z-50 max-w-[90vw] -translate-x-1/2 animate-pop rounded-2xl bg-ink-900 px-4 py-3 text-sm text-white shadow-soft bottom-[max(5.5rem,calc(var(--keyboard-inset,0px)+1rem))] md:bottom-[max(2rem,calc(var(--keyboard-inset,0px)+1rem))]"
    >
      {toast}
    </div>
  );
}

export function OnlineBadge() {
  const online = useUiStore((s) => s.online);
  return (
    <span
      className={`hidden items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${
        online ? 'bg-brand-100 text-brand-800' : 'bg-amber-100 text-amber-900'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-brand-600' : 'bg-amber-500'}`} />
      {online ? 'آنلاین' : 'آفلاین'}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card-surface animate-rise text-center">
      <p className="text-base font-semibold text-ink-800">{title}</p>
      {hint ? <p className="mt-2 text-sm text-ink-700/70">{hint}</p> : null}
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

export function Shell({
  title,
  children,
  action,
  back,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  back?: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] md:pb-10 md:pt-6">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-xl focus:bg-white focus:px-3 focus:py-2"
      >
        پرش به محتوا
      </a>
      <header className="mb-5 flex items-center justify-between gap-3 animate-rise">
        <div className="flex min-w-0 items-center gap-3">
          {back ? (
            <button
              type="button"
              className="btn-ghost !min-h-11 !min-w-11 shrink-0 !px-0"
              onClick={back}
              aria-label="بازگشت"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-brand-700 md:hidden">Dongham</p>
            <h1 className="truncate text-xl font-extrabold text-ink-900 md:text-2xl">{title}</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <OnlineBadge />
          {action}
        </div>
      </header>
      <div id="main">{children}</div>
      <AdBanner />
    </div>
  );
}
