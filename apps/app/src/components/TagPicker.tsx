import { useMemo, useState } from 'react';
import { useUiStore } from '../store/ui';

export function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function TagPicker({
  selected,
  onChange,
  suggestions = [],
  allowCreate = true,
  label = 'تگ‌ها',
  idPrefix = 'tag',
}: {
  selected: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  allowCreate?: boolean;
  label?: string;
  idPrefix?: string;
}) {
  const setToast = useUiStore((s) => s.setToast);
  const [extra, setExtra] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  const options = useMemo(
    () => uniqueTags([...suggestions, ...extra, ...selected]),
    [suggestions, extra, selected],
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (tag: string, checked: boolean) => {
    if (checked) onChange(uniqueTags([...selected, tag]));
    else onChange(selected.filter((t) => t !== tag));
  };

  const addDraft = () => {
    const tag = draft.trim();
    if (!tag) return;
    if (/[,،]/.test(tag)) {
      setToast('تگ را بدون ویرگول وارد کنید و با تیک انتخاب کنید', 'error');
      return;
    }
    setExtra((prev) => uniqueTags([...prev, tag]));
    onChange(uniqueTags([...selected, tag]));
    setDraft('');
  };

  return (
    <div className="space-y-2">
      {label ? <p className="label">{label}</p> : null}
      {options.length === 0 ? (
        <p className="text-xs text-ink-700/70">هنوز تگی نیست. یکی اضافه کنید.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {options.map((tag) => {
            const boxId = `${idPrefix}-${tag}`;
            const checked = selectedSet.has(tag);
            return (
              <li key={tag}>
                <label htmlFor={boxId} className={`chip-check ${checked ? 'chip-check-on' : ''}`}>
                  <input
                    id={boxId}
                    type="checkbox"
                    className="h-5 w-5 shrink-0"
                    checked={checked}
                    onChange={(e) => toggle(tag, e.target.checked)}
                  />
                  <span className="max-w-[12rem] truncate">{tag}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {allowCreate ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input min-w-0 flex-1"
            placeholder="تگ جدید"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addDraft();
              }
            }}
          />
          <button type="button" className="btn-ghost shrink-0 sm:!px-3" onClick={addDraft}>
            افزودن
          </button>
        </div>
      ) : null}
    </div>
  );
}
