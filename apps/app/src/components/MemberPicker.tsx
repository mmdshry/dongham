import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Search, X } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useEffect, useMemo, useState } from 'react';
import {
  classifyMemberSearchQuery,
  memberSearchNeedsCloud,
  MEMBER_SEARCH_MIN,
} from '@dongham/ledger';
import { UserAvatar } from './UserAvatar';
import { api, ApiError } from '../lib/api';
import { db } from '../lib/db';
import {
  contactMatchesMemberQuery,
  memberPickKey,
  uniqueMemberPicks,
  type MemberPick,
} from '../lib/memberPick';
import { userAvatarSrc } from '../lib/userAvatarPresets';
import { useUiStore } from '../store/ui';

type UserSearchHit = {
  userId: string;
  displayName: string;
  username?: string;
  hasAvatar: boolean;
  avatarPreset?: string;
  avatarDataUrl?: string;
};

function hitToPick(hit: UserSearchHit): MemberPick {
  return {
    kind: 'user',
    userId: hit.userId,
    displayName: hit.displayName,
    username: hit.username || '',
    avatarPreset: hit.avatarPreset,
    avatarSrc: hit.avatarDataUrl,
  };
}

function pickAvatarSrc(pick: MemberPick): string | undefined {
  if (pick.kind !== 'user') return undefined;
  return userAvatarSrc({ avatarPreset: pick.avatarPreset, avatarDataUrl: pick.avatarSrc });
}

function searchHint(draft: string): string {
  if (!draft.trim()) return 'یوزرنیم، شماره موبایل یا ایمیل را وارد کنید (حداقل ۳ کاراکتر)';
  const classified = classifyMemberSearchQuery(draft);
  if (classified.kind === 'too_short') return 'برای جستجو حداقل ۳ کاراکتر وارد کنید';
  if (classified.kind === 'incomplete_phone') return 'شماره را کامل وارد کنید';
  return '';
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
  const profile = useLiveQuery(() => db.profile.get('self'));
  const friends = useLiveQuery(() => db.friends.toArray(), []) || [];
  const members = useLiveQuery(() => db.members.toArray(), []) || [];
  const [draft, setDraft] = useState('');
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [hits, setHits] = useState<UserSearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const excludedNames = useMemo(
    () => new Set(excludeNames.map((n) => n.trim()).filter(Boolean)),
    [excludeNames],
  );
  const excludedUsers = useMemo(() => new Set(excludeUserIds.filter(Boolean)), [excludeUserIds]);
  const selectedKeys = useMemo(() => new Set(selected.map(memberPickKey)), [selected]);
  const classified = useMemo(() => classifyMemberSearchQuery(draft), [draft]);
  const hint = searchHint(draft);

  useEffect(() => {
    if (!memberSearchNeedsCloud(classified)) {
      setHits([]);
      setSearching(false);
      return;
    }
    const online = typeof navigator === 'undefined' || navigator.onLine;
    if (!profile?.token || !online) {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await api<{ users: UserSearchHit[] }>(`/users/search?q=${encodeURIComponent(draft.trim())}`);
          if (!cancelled) setHits(res.users);
        } catch (e) {
          if (cancelled) return;
          setHits([]);
          if (e instanceof ApiError && e.status === 400) return;
          setToast(e instanceof Error ? e.message : 'جستجو ممکن نشد', 'error');
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [classified, draft, profile?.token, setToast]);

  const results = useMemo(() => {
    const cloud = hits.map(hitToPick);
    const local: MemberPick[] = [];
    const needleOk =
      classified.kind === 'phone' ||
      classified.kind === 'email' ||
      classified.kind === 'incomplete_phone' ||
      draft.trim().length >= MEMBER_SEARCH_MIN;
    if (needleOk) {
      for (const m of members) {
        if (m.isPot || !contactMatchesMemberQuery(draft, m)) continue;
        if (m.userId) {
          local.push({ kind: 'user', userId: m.userId, displayName: m.displayName, username: '' });
        } else {
          local.push({ kind: 'name', displayName: m.displayName });
        }
      }
      for (const f of friends) {
        if (!contactMatchesMemberQuery(draft, f)) continue;
        if (f.friendUserId) {
          local.push({ kind: 'user', userId: f.friendUserId, displayName: f.displayName, username: '' });
        } else {
          local.push({ kind: 'name', displayName: f.displayName });
        }
      }
    }
    return uniqueMemberPicks([...cloud, ...local]);
  }, [hits, members, friends, draft, classified.kind]);

  const addPick = (pick: MemberPick) => {
    if (pick.kind === 'user' ? excludedUsers.has(pick.userId) : excludedNames.has(pick.displayName)) return;
    onChange(uniqueMemberPicks([...selected, pick]));
  };

  const removePick = (pick: MemberPick) => {
    const key = memberPickKey(pick);
    onChange(selected.filter((row) => memberPickKey(row) !== key));
  };

  const togglePick = (pick: MemberPick) => {
    if (pick.kind === 'user' ? excludedUsers.has(pick.userId) : excludedNames.has(pick.displayName)) return;
    if (selectedKeys.has(memberPickKey(pick))) removePick(pick);
    else addPick(pick);
  };

  const addGuest = async () => {
    const name = guestName.trim();
    if (!name) return;
    if (/[,،]/.test(name)) {
      setToast('نام را بدون ویرگول وارد کنید', 'error');
      return;
    }
    if (excludedNames.has(name)) {
      setToast('این فرد از قبل در دوره است', 'error');
      setGuestName('');
      return;
    }
    if (!friends.some((f) => f.displayName === name)) {
      await db.friends.put({ id: nanoid(), displayName: name });
    }
    addPick({ kind: 'name', displayName: name });
    setGuestName('');
  };

  const showEmpty =
    Boolean(draft.trim()) &&
    classified.kind !== 'too_short' &&
    !searching &&
    results.length === 0;

  return (
    <div className="space-y-3">
      <p className="label">اعضا</p>
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {selected.map((pick) => {
            const key = memberPickKey(pick);
            return (
              <li key={key}>
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand-100 py-1 pe-1 ps-1.5 text-sm text-brand-800">
                  <UserAvatar name={pick.displayName} src={pickAvatarSrc(pick)} size="sm" className="!h-7 !w-7 text-[10px]" />
                  <span className="max-w-[9rem] truncate font-semibold">{pick.displayName}</span>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-brand-200"
                    aria-label={`حذف ${pick.displayName}`}
                    onClick={() => removePick(pick)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-ink-700/45" />
        <input
          id={draftInputId}
          className="input min-w-0 ps-10"
          placeholder="یوزرنیم، موبایل یا ایمیل"
          value={draft}
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
        />
      </div>
      {hint ? <p className="text-xs text-ink-700/70">{hint}</p> : null}
      {searching ? <p className="text-xs text-ink-700/70">در حال جستجو...</p> : null}
      {showEmpty ? <p className="text-xs text-ink-700/70">کسی پیدا نشد</p> : null}
      {results.length > 0 ? (
        <ul className="max-h-56 space-y-1 overflow-y-auto rounded-2xl bg-brand-50 p-1.5">
          {results.map((pick) => {
            const key = memberPickKey(pick);
            const inPeriod = pick.kind === 'user' ? excludedUsers.has(pick.userId) : excludedNames.has(pick.displayName);
            const selectedRow = selectedKeys.has(key);
            return (
              <li key={key}>
                <button
                  type="button"
                  disabled={inPeriod}
                  onClick={() => togglePick(pick)}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-start text-sm duration-150 ${
                    inPeriod
                      ? 'cursor-not-allowed opacity-55'
                      : selectedRow
                        ? 'bg-brand-100 text-brand-800'
                        : 'hover:bg-surface/90'
                  }`}
                >
                  <UserAvatar name={pick.displayName} src={pickAvatarSrc(pick)} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{pick.displayName}</span>
                    {pick.kind === 'user' && pick.username ? (
                      <span className="mt-0.5 block truncate text-xs text-ink-700/60" dir="ltr">
                        @{pick.username}
                      </span>
                    ) : pick.kind === 'name' ? (
                      <span className="mt-0.5 block text-xs text-ink-700/60">بدون حساب دنگهام</span>
                    ) : null}
                  </span>
                  {inPeriod ? (
                    <span className="shrink-0 text-[11px] font-semibold text-ink-700/70">در دوره است</span>
                  ) : selectedRow ? (
                    <Check className="h-4 w-4 shrink-0 text-brand-700" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <details
        className="more-panel rounded-2xl bg-surface/80 px-3 ring-1 ring-brand-800/15"
        open={guestOpen}
        onToggle={(e) => setGuestOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="text-ink-800">افزودن با نام (بدون حساب)</summary>
        <div className="flex flex-col gap-2 pb-3 pt-1 sm:flex-row">
          <input
            className="input min-w-0 flex-1 !py-2.5"
            placeholder="مثلاً علی"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void addGuest();
              }
            }}
          />
          <button type="button" className="btn-ghost shrink-0 sm:!px-3" onClick={() => void addGuest()}>
            افزودن
          </button>
        </div>
      </details>
    </div>
  );
}
