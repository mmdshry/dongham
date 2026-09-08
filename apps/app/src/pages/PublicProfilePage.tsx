import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { usernameFromPath } from '@dongham/ledger';
import { BrandLogo } from '../components/BrandLogo';
import { EmptyState, PageSkeleton } from '../components/ui';
import { UserAvatar } from '../components/UserAvatar';
import { api, ApiError } from '../lib/api';
import { toPersianDigits } from '../lib/format';
import { APP_HOME } from '../lib/paths';
import { periodCoverSrc } from '../lib/periodCover';
import { userAvatarSrc } from '../lib/userAvatarPresets';
import { usePersianDigits } from '../lib/usePersianDigits';

type PublicProfile = {
  username: string;
  displayName: string;
  avatarPreset?: string | null;
  avatarDataUrl?: string | null;
  coverPreset?: string | null;
  coverDataUrl?: string | null;
  periodCount: number;
  comemberCount: number;
};

export function PublicProfilePage() {
  const { username: raw = '' } = useParams();
  const slug = usernameFromPath(`/${raw}`);
  const persian = usePersianDigits();
  const [state, setState] = useState<'loading' | 'missing' | 'error' | 'ready'>('loading');
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setState('loading');
    setProfile(null);
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
              <h1 className="text-2xl font-extrabold text-ink-900">{profile.displayName}</h1>
              <p className="mt-1 text-sm text-ink-700/70" dir="ltr">
                @{profile.username}
              </p>
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
              <Link to={APP_HOME} className="btn-primary mt-6 w-full">
                ورود به دونگ‌هام
              </Link>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
