import { useMemo, useState } from 'react';
import { currencyInfo, searchCurrencies } from '../lib/currencyCatalog';
import { formatGrouped } from '../lib/format';
import { usePersianDigits } from '../lib/usePersianDigits';

export function CurrencySelect({
  id,
  value,
  onChange,
  rates,
}: {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  rates?: Record<string, number>;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const persian = usePersianDigits();
  const extra = Object.keys(rates || {});
  const options = useMemo(() => searchCurrencies(q, extra), [q, extra]);
  const selected = currencyInfo(value);

  return (
    <div className="relative">
      <button
        id={id}
        type="button"
        className="input flex w-full items-center justify-between gap-2 text-right"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          {selected.flag} {selected.countryFa} · {selected.code}
        </span>
        <span className="text-xs text-ink-700/60">▼</span>
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-brand-700/10">
          <input
            className="input !rounded-none !border-0 !ring-0"
            placeholder="جستجوی کشور یا ارز…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <ul className="max-h-56 overflow-y-auto">
            {options.map((c) => {
              const rate = rates?.[c.code];
              return (
                <li key={c.code}>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-sm ${
                      c.code === value ? 'bg-brand-50 font-semibold' : ''
                    }`}
                    onClick={() => {
                      onChange(c.code);
                      setOpen(false);
                      setQ('');
                    }}
                  >
                    <span>
                      {c.flag} {c.countryFa} · {c.code}
                    </span>
                    {rate ? (
                      <span className="shrink-0 text-xs text-ink-700/60" dir="ltr">
                        {formatGrouped(rate, persian)}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
