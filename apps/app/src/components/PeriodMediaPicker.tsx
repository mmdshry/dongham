import { useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { compressCover } from '../lib/avatar';
import {
  COVER_FILES,
  PERIOD_MEDIA_LABELS,
  PERIOD_MEDIA_PRESETS,
  type PeriodMediaPreset,
} from '../lib/periodCover';
import { Icon } from './Icon';
import { useUiStore } from '../store/ui';

export type PeriodMediaValue = {
  coverPreset?: string;
  coverDataUrl?: string;
};

export function PeriodMediaPicker({
  value,
  onChange,
  disabled,
  label = 'بک‌گراند دوره',
}: {
  value: PeriodMediaValue;
  onChange: (next: PeriodMediaValue) => void;
  disabled?: boolean;
  label?: string;
}) {
  const coverInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const setToast = useUiStore((s) => s.setToast);

  const pickFile = async (file?: File) => {
    if (!file || disabled || busy) return;
    setBusy(true);
    try {
      const coverDataUrl = await compressCover(file);
      onChange({ ...value, coverDataUrl });
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'آپلود عکس ممکن نشد', 'error');
    } finally {
      setBusy(false);
      if (coverInput.current) coverInput.current.value = '';
    }
  };

  const selectCover = (id: PeriodMediaPreset) => {
    const next = { ...value, coverPreset: id };
    delete next.coverDataUrl;
    onChange(next);
  };

  const coverSelected = !value.coverDataUrl && value.coverPreset;
  const selectedLabel =
    coverSelected && coverSelected in PERIOD_MEDIA_LABELS
      ? PERIOD_MEDIA_LABELS[coverSelected as PeriodMediaPreset]
      : undefined;

  return (
    <div className="space-y-4">
      <div>
        <p className="label">{label}</p>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {PERIOD_MEDIA_PRESETS.map((id) => {
            const selected = coverSelected === id;
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                title={PERIOD_MEDIA_LABELS[id]}
                aria-label={PERIOD_MEDIA_LABELS[id]}
                aria-pressed={selected}
                className={`rounded-xl ring-2 ring-offset-2 ring-offset-surface ${
                  selected ? '!ring-brand-700' : '!ring-transparent opacity-70'
                }`}
                onClick={() => selectCover(id)}
              >
                <span className="relative block overflow-hidden rounded-xl">
                  <img src={COVER_FILES[id]} alt="" className="h-12 w-full object-cover" />
                  {selected ? (
                    <span className="absolute end-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-700 text-on-brand">
                      <Icon icon={Check} size={10} strokeWidth={3} />
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={disabled || busy}
            onClick={() => coverInput.current?.click()}
          >
            {busy ? '...' : 'از دستگاه'}
          </button>
          {value.coverDataUrl ? (
            <span className="self-center text-xs text-ink-700/70">عکس سفارشی انتخاب شد</span>
          ) : selectedLabel ? (
            <span className="self-center text-xs text-ink-700/70">{selectedLabel}</span>
          ) : null}
        </div>
        <input
          ref={coverInput}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => void pickFile(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
