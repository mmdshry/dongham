import { useLiveQuery } from 'dexie-react-hooks';
import { nanoid } from 'nanoid';
import { useMemo, useState } from 'react';
import { db } from '../lib/db';
import { useUiStore } from '../store/ui';

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function MemberPicker({
  selected,
  onChange,
  excludeNames = [],
  draftInputId,
}: {
  selected: string[];
  onChange: (names: string[]) => void;
  excludeNames?: string[];
  draftInputId?: string;
}) {
  const setToast = useUiStore((s) => s.setToast);
  const friends = useLiveQuery(() => db.friends.toArray(), []) || [];
  const members = useLiveQuery(() => db.members.toArray(), []) || [];
  const [extra, setExtra] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  const excluded = useMemo(() => new Set(excludeNames.map((n) => n.trim()).filter(Boolean)), [excludeNames]);

  const candidates = useMemo(
    () =>
      uniqueNames([
        ...friends.map((f) => f.displayName),
        ...members.filter((m) => !m.isPot).map((m) => m.displayName),
        ...extra,
      ]).filter((n) => !excluded.has(n)),
    [friends, members, extra, excluded],
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (name: string, checked: boolean) => {
    if (checked) onChange(uniqueNames([...selected, name]));
    else onChange(selected.filter((n) => n !== name));
  };

  const addDraft = async () => {
    const name = draft.trim();
    if (!name) return;
    if (/[,،]/.test(name)) {
      setToast('نام را بدون ویرگول وارد کنید و با تیک انتخاب کنید');
      return;
    }
    if (excluded.has(name)) {
      setToast('این فرد از قبل در دوره است');
      setDraft('');
      return;
    }
    if (!friends.some((f) => f.displayName === name)) {
      await db.friends.put({ id: nanoid(), displayName: name });
    }
    setExtra((prev) => uniqueNames([...prev, name]));
    onChange(uniqueNames([...selected, name]));
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <p className="label">اعضا</p>
      {candidates.length === 0 ? (
        <p className="text-xs text-ink-700/70">هنوز کسی در لیست نیست. یک نام اضافه کنید یا از صفحه دوستان وارد کنید.</p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-2xl bg-brand-50 p-2">
          {candidates.map((name) => {
            const boxId = `${draftInputId || 'member'}-${name}`;
            return (
              <li key={name}>
                <label htmlFor={boxId} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-sm">
                  <input
                    id={boxId}
                    type="checkbox"
                    className="h-5 w-5 shrink-0"
                    checked={selectedSet.has(name)}
                    onChange={(e) => toggle(name, e.target.checked)}
                  />
                  <span className="truncate">{name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={draftInputId}
          className="input min-w-0 flex-1"
          placeholder="نام جدید"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void addDraft();
            }
          }}
        />
        <button type="button" className="btn-ghost shrink-0 sm:!px-3" onClick={() => void addDraft()}>
          افزودن به لیست
        </button>
      </div>
    </div>
  );
}
