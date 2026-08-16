import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CurrencyMark } from './Flag';
import { browseRateCurrencies, currencyInfo, displayTomanRate } from '../lib/currencyCatalog';
import { formatGrouped, formatJalaliDateTime, parseMoneyInput } from '../lib/format';
import {
  fetchFxSnapshot,
  loadFxWatchlist,
  saveFxWatchlist,
  saveManualRates,
  type FxSnapshot,
} from '../lib/fx';
import { usePersianDigits } from '../lib/usePersianDigits';
import { useUiStore } from '../store/ui';

function FxTomanPrice({ amount, persian }: { amount: number; persian: boolean }) {
  if (!amount) return <span className="text-xs text-ink-700/70">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-700/70">
      <span dir="ltr" className="tabular-nums">
        {formatGrouped(amount, persian)}
      </span>
      <span>تومان</span>
    </span>
  );
}

function sourceLabel(source: string): string {
  if (source === 'navasan-web') return 'نواسان';
  if (source === 'nobitex') return 'نوبیتکس';
  if (source === 'nobitex+navasan') return 'نوبیتکس و نواسان';
  if (source === 'navasan') return 'نواسان';
  if (source === 'provider') return 'منبع سفارشی';
  if (source === 'cache') return 'کش';
  if (source === 'stale') return 'کش منقضی';
  if (source === 'manual') return 'نرخ دستی شما';
  if (source === 'offline') return 'آفلاین';
  if (source === 'none') return 'بدون نرخ زنده';
  return source || 'نامشخص';
}

export function FxRatesPanel({ compact = false }: { compact?: boolean }) {
  const setToast = useUiStore((s) => s.setToast);
  const persian = usePersianDigits();
  const [snap, setSnap] = useState<FxSnapshot | null>(null);
  const [watch, setWatch] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  const load = async () => {
    setBusy(true);
    try {
      const [next, codes] = await Promise.all([fetchFxSnapshot(), loadFxWatchlist()]);
      setSnap(next);
      setWatch(codes);
      const nextDraft: Record<string, string> = {};
      for (const code of codes) {
        const n = displayTomanRate(code, next.rates[code]);
        nextDraft[code] = n ? formatGrouped(n, persian) : '';
      }
      setDraft(nextDraft);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persian]);

  const persistWatch = async (codes: string[]) => {
    await saveFxWatchlist(codes);
    setWatch(codes);
    setDraft((prev) => {
      const next: Record<string, string> = {};
      for (const code of codes) {
        const n = displayTomanRate(code, snap?.rates[code]);
        next[code] = prev[code] ?? (n ? formatGrouped(n, persian) : '');
      }
      return next;
    });
  };

  const addCode = async (code: string) => {
    if (watch.includes(code)) return;
    await persistWatch([...watch, code]);
    setQ('');
  };

  const removeCode = async (code: string) => {
    await persistWatch(watch.filter((c) => c !== code));
  };

  const save = async () => {
    const rates: Record<string, number> = {};
    for (const code of watch) {
      if (code === 'IRR') {
        rates[code] = 1;
        continue;
      }
      const n = parseMoneyInput(draft[code] || '');
      if (n > 0) rates[code] = n;
    }
    await saveManualRates(rates);
    setToast('نرخ‌های دستی ذخیره شد');
    await load();
  };

  const listed = useMemo(
    () => browseRateCurrencies(q, snap?.rates || {}, watch),
    [q, snap, watch],
  );

  const selected = useMemo(() => watch.map((code) => currencyInfo(code)), [watch]);

  return (
    <div id="fx" className="card-surface space-y-3">
      <h2 className="font-bold">نرخ ارز</h2>
      <p className="text-xs text-ink-700/70">
        نرخ زنده هر دقیقه از نواسان گرفته می‌شود (تومان برای هر واحد). قیمت‌ها همین‌جا دیده می‌شوند؛ افزودن فقط برای پین و
        نرخ دستی است. اگر قطع باشد آخرین قیمت می‌ماند.
      </p>
      {snap ? (
        <p className="text-xs text-brand-800">
          منبع: {sourceLabel(snap.source)}
          {snap.fetchedAt ? ` · آخرین بروزرسانی ${formatJalaliDateTime(snap.fetchedAt)}` : ''}
        </p>
      ) : null}
      {snap?.source === 'offline' || snap?.source === 'stale' || snap?.source === 'none' ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          نرخ زنده قطع است؛ آخرین قیمت ذخیره‌شده نمایش داده می‌شود.
        </p>
      ) : null}
      <input
        className="input"
        placeholder="جستجوی ارز…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {listed.length ? (
        <ul className="max-h-56 space-y-1 overflow-y-auto rounded-2xl bg-brand-50 p-2 text-sm">
          {listed.slice(0, compact ? 12 : 80).map((c) => {
            const n = displayTomanRate(c.code, snap?.rates[c.code]);
            return (
              <li key={c.code} className="flex items-center justify-between gap-2 px-1 py-1">
                <CurrencyMark info={c} />
                <div className="flex items-center gap-2">
                  <FxTomanPrice amount={n} persian={persian} />
                  <button type="button" className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => void addCode(c.code)}>
                    افزودن
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-ink-700/60">{q.trim() ? 'ارزی پیدا نشد.' : 'نرخ زنده‌ای برای نمایش نیست.'}</p>
      )}
      {selected.length ? <p className="text-xs font-semibold">ارزهای پین‌شده</p> : null}
      {selected.length === 0 ? (
        <p className="text-xs text-ink-700/60">برای نرخ دستی، ارز را از لیست بالا پین کنید.</p>
      ) : (
        <ul className="space-y-2">
          {selected.map((c) => {
            const n = displayTomanRate(c.code, snap?.rates[c.code]);
            return (
              <li key={c.code} className="rounded-2xl bg-brand-50 p-2">
                <div className="flex items-center justify-between gap-2 px-1">
                  <CurrencyMark info={c} />
                  <div className="flex items-center gap-2">
                    <FxTomanPrice amount={n} persian={persian} />
                    <button
                      type="button"
                      className="btn-ghost !px-2 !py-1 !text-xs"
                      onClick={() => void removeCode(c.code)}
                    >
                      حذف
                    </button>
                  </div>
                </div>
                <label className="mt-2 block px-1 text-xs text-ink-700/70" htmlFor={`fx-${c.code}`}>
                  نرخ دستی (اختیاری)
                </label>
                <input
                  id={`fx-${c.code}`}
                  className="input mt-1 !py-2"
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="تومان"
                  value={draft[c.code] || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [c.code]: e.target.value }))}
                />
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary flex-1" onClick={() => void save()} disabled={busy || watch.length === 0}>
          ذخیره نرخ دستی
        </button>
        <button type="button" className="btn-ghost flex-1" onClick={() => void load()} disabled={busy}>
          واکشی دوباره
        </button>
      </div>
      {compact ? (
        <Link to="/more#fx" className="text-xs text-brand-800 underline">
          تنظیمات کامل نرخ ارز
        </Link>
      ) : null}
    </div>
  );
}
