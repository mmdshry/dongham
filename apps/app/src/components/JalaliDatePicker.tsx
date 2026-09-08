import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Icon } from './Icon';
import { useEffect, useId, useRef, useState } from 'react';
import type { CalendarMode } from '../lib/jalali';
import {
  WEEKDAY_SHORT_FA,
  calendarMonthGrid,
  calendarMonthName,
  calendarPartsToIso,
  isoToCalendarParts,
  sameCalendarDay,
  shiftCalendarMonth,
} from '../lib/jalali';
import { formatCalendarDate, toPersianDigits } from '../lib/format';
import { useCalendarMode } from '../lib/calendarPref';
import { updateAccountPrefs } from '../lib/cloudProfile';
import { usePersianDigits } from '../lib/usePersianDigits';

export function JalaliDatePicker({
  iso,
  onChange,
  label = 'تاریخ',
}: {
  iso: string;
  onChange: (iso: string) => void;
  label?: string;
}) {
  const persian = usePersianDigits();
  const titleId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Single source of truth shared with every other date label (profile → localStorage fallback).
  const mode = useCalendarMode();
  const selected = isoToCalendarParts(iso || new Date().toISOString(), mode);
  const [view, setView] = useState({ y: selected.y, m: selected.m });

  useEffect(() => {
    const next = isoToCalendarParts(iso || new Date().toISOString(), mode);
    setView({ y: next.y, m: next.m });
  }, [iso, mode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const todayIso = new Date().toISOString();
  const todayParts = isoToCalendarParts(todayIso, mode);
  const cells = calendarMonthGrid(view.y, view.m, mode);
  const years = Array.from({ length: 16 }, (_, i) => view.y - 8 + i);

  const pick = (y: number, m: number, d: number) => {
    onChange(calendarPartsToIso(y, m, d, mode, iso));
    setOpen(false);
  };

  const switchMode = (next: CalendarMode) => {
    if (next === mode) return;
    // updateAccountPrefs writes localStorage + Dexie profile, so useCalendarMode re-renders every date label at once.
    void updateAccountPrefs({ calendarMode: next });
  };

  return (
    <div ref={wrapRef} className="relative">
      <p className="label" id={titleId}>
        {label}
      </p>
      <button
        type="button"
        className="input flex items-center justify-between gap-2 text-start"
        aria-labelledby={titleId}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{formatCalendarDate(iso || todayIso, mode, persian)}</span>
        <Icon icon={Calendar} size={20} className="shrink-0 text-brand-700" />
      </button>
      {open ? (
        <>
          <div
            className="fixed inset-0 z-50 bg-scrim/55 md:hidden"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="fixed inset-x-0 bottom-0 z-[51] rounded-t-3xl bg-surface p-4 shadow-soft md:absolute md:inset-auto md:top-full md:z-50 md:mt-2 md:w-full md:rounded-3xl"
          >
            <div className="mb-3 flex gap-1 rounded-2xl bg-brand-50 p-1">
              <button
                type="button"
                className={`chip flex-1 !min-h-10 ${mode === 'jalali' ? 'bg-brand-700 text-on-brand' : 'text-ink-800'}`}
                onClick={() => switchMode('jalali')}
              >
                شمسی
              </button>
              <button
                type="button"
                className={`chip flex-1 !min-h-10 ${mode === 'gregorian' ? 'bg-brand-700 text-on-brand' : 'text-ink-800'}`}
                onClick={() => switchMode('gregorian')}
              >
                میلادی
              </button>
            </div>
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost !min-h-11 !min-w-11 !px-0"
                aria-label="ماه قبل"
                onClick={() => setView((v) => shiftCalendarMonth(v.y, v.m, -1))}
              >
                <Icon icon={ChevronRight} size={20} />
              </button>
              <p className="min-w-0 flex-1 text-center text-sm font-bold">
                {calendarMonthName(view.m, mode)}
              </p>
              <select
                className="input !w-auto !min-h-11 !px-2 !py-2 text-sm"
                aria-label={mode === 'jalali' ? 'سال شمسی' : 'سال میلادی'}
                value={view.y}
                onChange={(e) => setView((v) => ({ ...v, y: Number(e.target.value) }))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {toPersianDigits(y, persian)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-ghost !min-h-11 !min-w-11 !px-0"
                aria-label="ماه بعد"
                onClick={() => setView((v) => shiftCalendarMonth(v.y, v.m, 1))}
              >
                <Icon icon={ChevronLeft} size={20} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-ink-700/60">
              {WEEKDAY_SHORT_FA.map((w) => (
                <span key={w} className="py-1 font-semibold">
                  {w}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((cell) => {
                const isSelected = sameCalendarDay(cell, selected);
                const isToday = sameCalendarDay(cell, todayParts);
                return (
                  <button
                    key={`${cell.y}-${cell.m}-${cell.d}-${cell.inMonth ? 'm' : 'x'}`}
                    type="button"
                    aria-current={isSelected ? 'date' : undefined}
                    className={`min-h-11 rounded-xl text-sm tabular-nums ${
                      isSelected
                        ? 'bg-brand-700 font-bold text-on-brand'
                        : isToday
                          ? 'bg-brand-100 font-semibold text-brand-800'
                          : cell.inMonth
                            ? 'text-ink-800 hover:bg-brand-50'
                            : 'text-ink-700/35'
                    }`}
                    onClick={() => pick(cell.y, cell.m, cell.d)}
                  >
                    {toPersianDigits(cell.d, persian)}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn-ghost flex-1" onClick={() => setOpen(false)}>
                بستن
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={() => pick(todayParts.y, todayParts.m, todayParts.d)}
              >
                امروز
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
