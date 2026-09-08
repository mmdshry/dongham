import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { nanoid } from 'nanoid';
import { Link, Navigate, useParams } from 'react-router-dom';
import { canManagePeriod, usernameFromPath } from '@dongham/ledger';
import { UserRound } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { Modal } from '../components/Dialog';
import { EmptyState, PageSkeleton } from '../components/ui';
import { UserAvatar } from '../components/UserAvatar';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { api, ApiError } from '../lib/api';
import { db } from '../lib/db';
import { formatJalaliDate, toLatinDigits, toPersianDigits } from '../lib/format';
import { isSelfMember } from '../lib/memberLabel';
import { APP_HOME } from '../lib/paths';
import { periodCoverSrc } from '../lib/periodCover';
import { userAvatarSrc } from '../lib/userAvatarPresets';
import { usePersianDigits } from '../lib/usePersianDigits';
import { useUiStore } from '../store/ui';

type PublicPeriodCard = {
  id: string;
  title: string;
  coverPreset?: string | null;
  coverDataUrl?: string | null;
  memberCount: number;
};

type PublicProfile = {
  username: string;
  displayName: string;
  avatarPreset?: string | null;
  avatarDataUrl?: string | null;
  coverPreset?: string | null;
  coverDataUrl?: string | null;
  periodCount: number;
  comemberCount: number;
  createdAt: string;
  isPremium: boolean;
  publicPeriods: PublicPeriodCard[];
  viewer?: { isSelf: boolean; isFriend: boolean };
};

export function PublicProfilePage() {
  const { username: raw = '' } = useParams();
  const slug = usernameFromPath(`/${raw}`);
  const persian = usePersianDigits();
  const setToast = useUiStore((s) => s.setToast);
  const me = useLiveQuery(() => db.profile.get('self'));
  const periods = useLiveQuery(() => db.periods.toArray(), []) || [];
  const members = useLiveQuery(() => db.members.toArray(), []) || [];
  const [state, setState] = useState<'loading' | 'missing' | 'error' | 'ready'>('loading');
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [addingFriend, setAddingFriend] = useState(false);
  const [friendAdded, setFriendAdded] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setState('loading');
    setProfile(null);
    setFriendAdded(false);
    void api<PublicProfile>(`/u/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (cancelled) return;
        setProfile(res);
        setState('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setState(e instanceof ApiError && e.status === 404 ? 'missing' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    const prev = document.title;
    if (state === 'ready' && profile) {
      document.title = `${profile.displayName} (@${profile.username}) · دونگ‌هام`;
    } else if (state === 'missing') {
      document.title = 'پروفایل پیدا نشد · دونگ‌هام';
    }
    return () => {
      document.title = prev;
    };
  }, [state, profile]);

  const loggedIn = Boolean(me?.token);
  const isSelf =
    Boolean(profile?.viewer?.isSelf) || Boolean(loggedIn && me?.username && profile && me.username === profile.username);
  const isFriend = Boolean(profile?.viewer?.isFriend) || friendAdded;

  const manageablePeriods = useMemo(
    () =>
      periods.filter((p) => {
        if (p.deletedAt || p.completedAt) return false;
        if (me?.userId && p.ownerId === me.userId) return true;
        const mine = members.find((m) => m.periodId === p.id && isSelfMember(m, me));
        return canManagePeriod(mine?.role);
      }),
    [periods, members, me],
  );

  if (!slug) return <Navigate to={APP_HOME} replace />;

  const cover = profile
    ? periodCoverSrc({
        coverPreset: profile.coverPreset || undefined,
        coverDataUrl: profile.coverDataUrl || undefined,
      })
    : undefined;
  const avatar = profile
    ? userAvatarSrc({
        avatarPreset: profile.avatarPreset || undefined,
        avatarDataUrl: profile.avatarDataUrl || undefined,
      })
    : undefined;

  const joinedLabel = profile?.createdAt
    ? persian
      ? formatJalaliDate(profile.createdAt)
      : toLatinDigits(formatJalaliDate(profile.createdAt))
    : '';

  const addFriend = async () => {
    if (!profile) return;
    if (!navigator.onLine) {
      setToast('برای افزودن به دوستان باید آنلاین باشید', 'error');
      return;
    }
    setAddingFriend(true);
    try {
      const looked = await api<{ userId: string; displayName: string }>(
        `/users/lookup?username=${encodeURIComponent(profile.username)}`,
      );
      const row = {
        id: nanoid(),
        displayName: looked.displayName || profile.displayName,
        friendUserId: looked.userId,
      };
      await api('/friends', { method: 'POST', body: JSON.stringify(row) });
      await db.friends.put(row);
      setFriendAdded(true);
      setToast('به لیست دوستان اضافه شد', 'success');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setFriendAdded(true);
        setToast('این فرد از قبل در دوستام است', 'success');
      } else {
        setToast(e instanceof ApiError ? e.message : 'افزودن ممکن نشد', 'error');
      }
    } finally {
      setAddingFriend(false);
    }
  };

  const inviteTo = async (periodId: string) => {
    if (!profile) return;
    if (!navigator.onLine) {
      setToast('برای دعوت باید آنلاین باشید', 'error');
      return;
    }
    setInvitingId(periodId);
    try {
      await api(`/periods/${periodId}/members`, {
        method: 'POST',
        body: JSON.stringify({ username: profile.username }),
      });
      setToast('به دوره اضافه شد', 'success');
      setInviteOpen(false);
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : 'دعوت ممکن نشد', 'error');
    } finally {
      setInvitingId(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="mb-5 flex items-center justify-center">
        <Link to={APP_HOME} aria-label="دونگ‌هام">
          <BrandLogo />
        </Link>
      </header>
      <main id="main" className="flex-1">
        {state === 'loading' ? (
          <PageSkeleton rows={3} />
        ) : state === 'missing' || state === 'error' || !profile ? (
          <EmptyState
            icon={UserRound}
            title={state === 'error' ? 'بارگذاری پروفایل ممکن نشد' : 'این پروفایل پیدا نشد'}
            hint={
              state === 'error'
                ? 'اتصال را بررسی کنید و دوباره تلاش کنید.'
                : 'یوزرنیم اشتباه است یا این صفحه دیگر در دسترس نیست.'
            }
            action={
              <Link to={APP_HOME} className="btn-primary">
                ورود به دونگ‌هام
              </Link>
            }
          />
        ) : (
          <>
            <article className="card-surface animate-rise !p-0">
              <div className="relative">
                <div className="aspect-[16/9] w-full overflow-hidden bg-brand-100 sm:aspect-[2/1]">
                  <img src={cover} alt="" className="h-full w-full object-cover object-center" />
                </div>
                <div className="absolute inset-x-0 bottom-0 flex translate-y-1/2 justify-center">
                  <UserAvatar name={profile.displayName} src={avatar} size="xl" className="ring-4 ring-surface" />
                </div>
              </div>
              <div className="px-5 pb-6 pt-16 text-center">
                <h1 className="inline-flex items-center justify-center gap-1.5 text-2xl font-extrabold text-ink-900">
                  <span>{profile.displayName}</span>
                  <VerifiedBadge premium={Boolean(profile.isPremium)} />
                </h1>
                <p className="mt-1 text-sm text-ink-700/70" dir="ltr">
                  @{profile.username}
                </p>
                {joinedLabel ? <p className="mt-1 text-xs text-ink-700/60">عضو از {joinedLabel}</p> : null}
                <dl className="mx-auto mt-6 grid max-w-xs grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-brand-50 px-3 py-3">
                    <dt className="text-xs text-ink-700/70">دوره</dt>
                    <dd className="mt-1 text-xl font-extrabold tabular-nums">
                      {toPersianDigits(profile.periodCount, persian)}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-brand-50 px-3 py-3">
                    <dt className="text-xs text-ink-700/70">هم‌دوره‌ای</dt>
                    <dd className="mt-1 text-xl font-extrabold tabular-nums">
                      {toPersianDigits(profile.comemberCount, persian)}
                    </dd>
                  </div>
                </dl>
                {isSelf ? (
                  <Link to="/profile" className="btn-primary mt-6 w-full">
                    ویرایش پروفایل
                  </Link>
                ) : loggedIn ? (
                  <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={isFriend || addingFriend}
                      onClick={() => void addFriend()}
                    >
                      {isFriend ? 'در دوستام' : 'افزودن به دوستان'}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setInviteOpen(true)}>
                      دعوت به دوره
                    </button>
                  </div>
                ) : (
                  <Link
                    to={`/auth?next=${encodeURIComponent(`/${profile.username}`)}`}
                    className="btn-primary mt-6 w-full"
                  >
                    ورود به دونگ‌هام
                  </Link>
                )}
              </div>
            </article>
            {(profile.publicPeriods?.length ?? 0) > 0 ? (
              <section className="mt-6 animate-rise">
                <h2 className="mb-3 text-sm font-bold text-ink-700">دوره‌های عمومی</h2>
                <ul className="space-y-2">
                  {profile.publicPeriods.map((p) => (
                    <li key={p.id}>
                      <Link
                        to={`/periods/${p.id}`}
                        className="card-surface flex items-center gap-3 !p-3"
                      >
                        <img
                          src={periodCoverSrc({
                            coverPreset: p.coverPreset || undefined,
                            coverDataUrl: p.coverDataUrl || undefined,
                          })}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded-2xl object-cover"
                        />
                        <div className="min-w-0 flex-1 text-right">
                          <p className="truncate font-bold">{p.title}</p>
                          <p className="mt-0.5 text-xs text-ink-700/60">
                            {toPersianDigits(p.memberCount, persian)} عضو
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="دعوت به دوره">
              {manageablePeriods.length === 0 ? (
                <p className="text-sm leading-6 text-ink-700/80">
                  فقط مالک یا مدیر دوره می‌تواند دعوت کند. اول یک دوره بسازید.
                </p>
              ) : (
                <ul className="space-y-2">
                  {manageablePeriods.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="card-surface flex w-full items-center gap-3 !p-3 text-right"
                        disabled={invitingId === p.id}
                        onClick={() => void inviteTo(p.id)}
                      >
                        <img src={periodCoverSrc(p)} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                        <span className="min-w-0 flex-1 truncate font-semibold">{p.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Modal>
          </>
        )}
      </main>
    </div>
  );
}
