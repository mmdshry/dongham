import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { currencyInfo, searchCurrencies } from '../lib/currencyCatalog';
import { formatGrouped, formatJalaliDate, parseMoneyInput } from '../lib/format';
import { fetchFxSnapshot, saveManualRates, type FxSnapshot } from '../lib/fx';
import { usePersianDigits } from '../lib/usePersianDigits';
import { useUiStore } from '../store/ui';

const MANUAL_CODES = ['USD', 'EUR', 'TRY', 'AED', 'IQD', 'XAU'] as const;

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
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  const load = async () => {
    setBusy(true);
    try {
      const next = await fetchFxSnapshot();
      setSnap(next);
      const nextDraft: Record<string, string> = {};
      for (const code of MANUAL_CODES) {
        const n = next.rates[code];
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

  const save = async () => {
    const rates: Record<string, number> = {};
    for (const code of MANUAL_CODES) {
      const n = parseMoneyInput(draft[code] || '');
      if (n > 0) rates[code] = n;
    }
    await saveManualRates(rates);
    setToast('نرخ‌های دستی ذخیره شد');
    await load();
  };

  const listed = useMemo(() => {
    const extra = Object.keys(snap?.rates || {});
    return searchCurrencies(q, extra).filter((c) => c.code !== 'IRT');
  }, [q, snap]);

  return (
    <div id="fx" className="card-surface space-y-3">
      <h2 className="font-bold">نرخ ارز</h2>
      <p className="text-xs text-ink-700/70">
        نرخ زنده همه کشورها هر دقیقه از نواسان گرفته می‌شود (تومان برای هر واحد). اگر قطع باشد آخرین قیمت می‌ماند.
      </p>
      {snap ? (
        <p className="text-xs text-brand-800">
          منبع: {sourceLabel(snap.source)}
          {snap.fetchedAt ? ` · آخرین بروزرسانی ${formatJalaliDate(snap.fetchedAt)}` : ''}
        </p>
      ) : null}
      {snap?.source === 'offline' || snap?.source === 'stale' || snap?.source === 'none' ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          نرخ زنده قطع است؛ آخرین قیمت ذخیره‌شده نمایش داده می‌شود.
        </p>
      ) : null}
      <input className="input" placeholder="جستجوی کشور یا ارز…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="max-h-56 space-y-1 overflow-y-auto rounded-2xl bg-brand-50 p-2 text-sm">
        {listed.slice(0, compact ? 12 : 80).map((c) => {
          const n = snap?.rates[c.code];
          return (
            <li key={c.code} className="flex items-center justify-between gap-2 px-1 py-1">
              <span>
                {c.flag} {c.countryFa} · {c.code}
              </span>
              <span dir="ltr" className="text-xs text-ink-700/70">
                {n ? formatGrouped(n, persian) : '—'}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs font-semibold">نرخ دستی (اختیاری)</p>
      <div className="space-y-2">
        {MANUAL_CODES.map((code) => {
          const info = currencyInfo(code);
          return (
            <div key={code} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_8rem]">
              <label className="text-sm" htmlFor={`fx-${code}`}>
                {info.flag} {info.nameFa}
              </label>
              <input
                id={`fx-${code}`}
                className="input !py-2"
                inputMode="numeric"
                dir="ltr"
                placeholder="تومان"
                value={draft[code] || ''}
                onChange={(e) => setDraft((d) => ({ ...d, [code]: e.target.value }))}
              />
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary flex-1" onClick={() => void save()} disabled={busy}>
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
