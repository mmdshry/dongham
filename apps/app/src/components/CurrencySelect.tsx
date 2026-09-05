import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CurrencyMark } from './Flag';
import { currencyInfo, displayTomanRate, searchCurrencies } from '../lib/currencyCatalog';
import { formatGrouped } from '../lib/format';
import { usePersianDigits } from '../lib/usePersianDigits';

type MenuBox = { top: number; left: number; width: number };

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
  const [box, setBox] = useState<MenuBox | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const persian = usePersianDigits();
  const extra = Object.keys(rates || {});
  const options = useMemo(() => searchCurrencies(q, extra), [q, extra]);
  const selected = currencyInfo(value);

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    const place = () => {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setBox({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const menu =
    open && box
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[60] max-h-72 overflow-hidden rounded-2xl bg-surface shadow-soft ring-1 ring-brand-700/10"
            style={{ top: box.top, left: box.left, width: box.width }}
          >
            <input
              className="input !rounded-none !border-0 !ring-0"
              placeholder="جستجوی ارز…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
            <ul className="max-h-56 overflow-y-auto">
              {options.map((c) => {
                const rate = displayTomanRate(c.code, rates?.[c.code]);
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
                      <CurrencyMark info={c} />
                      {rate ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-700/60">
                          <span dir="ltr" className="tabular-nums">
                            {formatGrouped(rate, persian)}
                          </span>
                          <span>تومان</span>
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        id={id}
        ref={btnRef}
        type="button"
        className="input flex w-full items-center justify-between gap-2 text-right"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <CurrencyMark info={selected} />
        <span className="text-xs text-ink-700/60">▼</span>
      </button>
      {menu}
    </div>
  );
}
