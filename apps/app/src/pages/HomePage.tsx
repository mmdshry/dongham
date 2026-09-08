import { useLiveQuery } from 'dexie-react-hooks';
import { Plus } from 'lucide-react';
import { EmptyState, PageSkeleton, Shell } from '../components/ui';
import { ConnectionModeBadge } from '../components/ConnectionModeBadge';
import { Icon } from '../components/Icon';
import { PeriodCard } from '../components/PeriodCard';
import { SyncBanner } from '../components/SyncBanner';
import { useAvatarMap } from '../lib/avatarCache';
import { db } from '../lib/db';
import { firstName } from '../lib/initials';
import { useUiStore } from '../store/ui';

export function HomePage() {
  const openSheet = useUiStore((s) => s.openSheet);
  const periodsQuery = useLiveQuery(() => db.periods.orderBy('updatedAt').reverse().toArray(), []);
  const members = useLiveQuery(() => db.members.toArray(), []) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const payments = useLiveQuery(() => db.payments.toArray(), []) || [];
  const profile = useLiveQuery(() => db.profile.get('self'));
  const persian = profile?.usePersianDigits ?? true;
  const avatarByUserId = useAvatarMap(members.map((m) => m.userId));
  const periods = periodsQuery ?? [];
  const periodsReady = periodsQuery !== undefined;

  const createBtn = (
    <button type="button" className="btn-primary inline-flex w-full items-center justify-center gap-2" onClick={() => openSheet('create')}>
      <Icon icon={Plus} size={18} />
      ساخت دوره جدید
    </button>
  );

  return (
    <Shell title="دوره‌ها" chrome="app">
      <SyncBanner />
      <section className="animate-rise">
        <p className="text-2xl font-extrabold leading-tight text-ink-900 md:text-3xl">سلام، {firstName(profile?.displayName)}</p>
        <div className="mt-2 hidden md:block">
          <ConnectionModeBadge />
        </div>
        <p className="mt-1 text-sm text-ink-700/70">خوش آمدید! امروز چه هزینه‌ای را تقسیم می‌کنید؟</p>
      </section>

      <section className="mt-8 animate-rise">
        <h2 className="text-lg font-extrabold text-ink-900">دوره‌های فعال</h2>
        <p className="mt-1 text-sm leading-6 text-ink-700/70">
          اینجا می‌توانید دوره‌ها را مدیریت کنید و با اعضا تسویه کنید.
        </p>
        { !periodsReady ? (
          <div className="mt-4">
            <PageSkeleton rows={3} />
          </div>
        ) : periods.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              image
              title="هنوز دوره‌ای ندارید"
              hint="یک دوره جدید بسازید و هزینه‌ها را با دوستان تقسیم کنید."
              action={createBtn}
            />
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {periods.map((p, i) => (
              <li key={p.id} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                <PeriodCard
                  period={p}
                  members={members.filter((m) => m.periodId === p.id)}
                  expenses={expenses.filter((e) => e.periodId === p.id)}
                  payments={payments.filter((pay) => pay.periodId === p.id)}
                  avatarByUserId={avatarByUserId}
                  profile={profile}
                  persianDigits={persian}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}
