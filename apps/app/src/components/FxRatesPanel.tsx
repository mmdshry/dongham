import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { currencyLabel, FX_CURRENCY_CODES } from '../lib/currencies';
import { formatGrouped, parseMoneyInput } from '../lib/format';
import { fetchFxSnapshot, saveManualRates, type FxSnapshot } from '../lib/fx';
import { usePersianDigits } from '../lib/usePersianDigits';
import { useUiStore } from '../store/ui';

function sourceLabel(source: string): string {
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

  const load = async () => {
    setBusy(true);
    try {
      const next = await fetchFxSnapshot();
      setSnap(next);
      const nextDraft: Record<string, string> = {};
      for (const code of FX_CURRENCY_CODES) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persian]);

  const save = async () => {
    const rates: Record<string, number> = {};
    for (const code of FX_CURRENCY_CODES) {
      const n = parseMoneyInput(draft[code] || '');
      if (n > 0) rates[code] = n;
    }
    await saveManualRates(rates);
    setToast('نرخ‌های دستی ذخیره شد');
    await load();
  };

  return (
    <div id="fx" className="card-surface space-y-3">
      <h2 className="font-bold">نرخ ارز</h2>
      <p className="text-xs text-ink-700/70">
        نرخ زنده از نوبیتکس گرفته می‌شود (تومان برای هر واحد). اگر قطع باشد یا ارزی نباشد، خودتان قیمت را وارد کنید.
      </p>
      {snap ? (
        <p className="text-xs text-brand-800">منبع: {sourceLabel(snap.source)}</p>
      ) : null}
      {snap?.missing.length ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          این ارزها نرخ زنده ندارند: {snap.missing.map((c) => currencyLabel(c)).join('، ')}. قیمت را به تومان وارد کنید.
        </p>
      ) : null}
      <div className="space-y-2">
        {FX_CURRENCY_CODES.map((code) => (
          <div key={code} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_8rem]">
            <label className="text-sm" htmlFor={`fx-${code}`}>
              {currencyLabel(code)}
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
        ))}
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
