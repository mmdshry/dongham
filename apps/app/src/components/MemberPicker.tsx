import { useLiveQuery } from 'dexie-react-hooks';
import { nanoid } from 'nanoid';
import { useMemo, useState } from 'react';
import { parseUsername } from '@dongham/ledger';
import { api, ApiError } from '../lib/api';
import { db } from '../lib/db';
import {
  memberPickKey,
  memberPickLabel,
  uniqueMemberPicks,
  type MemberPick,
} from '../lib/memberPick';
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
  excludeUserIds = [],
  draftInputId,
}: {
  selected: MemberPick[];
  onChange: (picks: MemberPick[]) => void;
  excludeNames?: string[];
  excludeUserIds?: string[];
  draftInputId?: string;
}) {
  const setToast = useUiStore((s) => s.setToast);
  const friends = useLiveQuery(() => db.friends.toArray(), []) || [];
  const members = useLiveQuery(() => db.members.toArray(), []) || [];
  const [extra, setExtra] = useState<MemberPick[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const excludedNames = useMemo(
    () => new Set(excludeNames.map((n) => n.trim()).filter(Boolean)),
    [excludeNames],
  );
  const excludedUsers = useMemo(() => new Set(excludeUserIds.filter(Boolean)), [excludeUserIds]);
  const selectedKeys = useMemo(() => new Set(selected.map(memberPickKey)), [selected]);

  const candidates = useMemo(() => {
    const fromBook: MemberPick[] = uniqueNames([
      ...friends.map((f) => f.displayName),
      ...members.filter((m) => !m.isPot).map((m) => m.displayName),
    ])
      .filter((n) => !excludedNames.has(n))
      .map((displayName) => ({ kind: 'name' as const, displayName }));
    return uniqueMemberPicks([...fromBook, ...extra, ...selected]).filter((pick) => {
      if (pick.kind === 'name') return !excludedNames.has(pick.displayName);
      return !excludedUsers.has(pick.userId);
    });
  }, [friends, members, extra, selected, excludedNames, excludedUsers]);

  const toggle = (pick: MemberPick, checked: boolean) => {
    const key = memberPickKey(pick);
    if (checked) onChange(uniqueMemberPicks([...selected, pick]));
    else onChange(selected.filter((row) => memberPickKey(row) !== key));
  };

  const addUsername = async (raw: string): Promise<'ok' | 'missing' | 'error'> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setToast('برای افزودن با یوزرنیم باید آنلاین باشید', 'error');
      return 'error';
    }
    const parsed = parseUsername(raw);
    if (!parsed.ok) {
      setToast('یوزرنیم نامعتبر است', 'error');
      return 'error';
    }
    setBusy(true);
    try {
      const found = await api<{ userId: string; displayName: string; username: string }>(
        `/users/lookup?username=${encodeURIComponent(parsed.username)}`,
      );
      if (excludedUsers.has(found.userId) || selected.some((p) => p.kind === 'user' && p.userId === found.userId)) {
        setToast('این فرد از قبل در دوره است', 'error');
        setDraft('');
        return 'error';
      }
      const pick: MemberPick = {
        kind: 'user',
        userId: found.userId,
        displayName: found.displayName,
        username: found.username || parsed.username,
      };
      setExtra((prev) => uniqueMemberPicks([...prev, pick]));
      onChange(uniqueMemberPicks([...selected, pick]));
      setDraft('');
      return 'ok';
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return 'missing';
      setToast(e instanceof Error ? e.message : 'جستجو ممکن نشد', 'error');
      return 'error';
    } finally {
      setBusy(false);
    }
  };

  const addDraft = async () => {
    const name = draft.trim();
    if (!name || busy) return;
    if (/[,،]/.test(name)) {
      setToast('نام را بدون ویرگول وارد کنید و با تیک انتخاب کنید', 'error');
      return;
    }
    const forcedUsername = name.startsWith('@');
    const looksUsername = forcedUsername || parseUsername(name).ok;
    if (looksUsername) {
      const result = await addUsername(name);
      if (result === 'ok' || result === 'error') return;
      if (forcedUsername) {
        setToast('کاربری با این یوزرنیم پیدا نشد', 'error');
        return;
      }
    }
    if (excludedNames.has(name)) {
      setToast('این فرد از قبل در دوره است', 'error');
      setDraft('');
      return;
    }
    if (!friends.some((f) => f.displayName === name)) {
      await db.friends.put({ id: nanoid(), displayName: name });
    }
    const pick: MemberPick = { kind: 'name', displayName: name };
    setExtra((prev) => uniqueMemberPicks([...prev, pick]));
    onChange(uniqueMemberPicks([...selected, pick]));
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <p className="label">اعضا</p>
      {candidates.length === 0 ? (
        <p className="text-xs text-ink-700/70">هنوز کسی در لیست نیست. یک نام یا @یوزرنیم اضافه کنید.</p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-2xl bg-brand-50 p-2">
          {candidates.map((pick) => {
            const key = memberPickKey(pick);
            const boxId = `${draftInputId || 'member'}-${key}`;
            return (
              <li key={key}>
                <label htmlFor={boxId} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-sm">
                  <input
                    id={boxId}
                    type="checkbox"
                    className="h-5 w-5 shrink-0"
                    checked={selectedKeys.has(key)}
                    onChange={(e) => toggle(pick, e.target.checked)}
                  />
                  <span className="truncate">{memberPickLabel(pick)}</span>
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
          placeholder="نام یا @یوزرنیم"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void addDraft();
            }
          }}
        />
        <button type="button" className="btn-ghost shrink-0 sm:!px-3" disabled={busy} onClick={() => void addDraft()}>
          {busy ? '...' : 'افزودن به لیست'}
        </button>
      </div>
    </div>
  );
}
