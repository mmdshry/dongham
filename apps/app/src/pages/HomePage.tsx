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
import { actorRoleOf, canCompleteOrDeletePeriod, periodStatusOf } from '../lib/periodLifecycle';
import { useUiStore } from '../store/ui';

export function HomePage() {
  const openSheet = useUiStore((s) => s.openSheet);
  const periodsQuery = useLiveQuery(() => db.periods.orderBy('updatedAt').reverse().toArray(), []);
  const members = useLiveQuery(() => db.members.toArray(), []) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const payments = useLiveQuery(() => db.payments.toArray(), []) || [];
  const chat = useLiveQuery(() => db.chat.toArray(), []) || [];
  const activity = useLiveQuery(() => db.activity.toArray(), []) || [];
  const prefs = useLiveQuery(() => db.periodPrefs.toArray(), []) || [];
  const profile = useLiveQuery(() => db.profile.get('self'));
  const persian = profile?.usePersianDigits ?? true;
  const avatarByUserId = useAvatarMap(members.map((m) => m.userId));
  const periods = periodsQuery ?? [];
  const periodsReady = periodsQuery !== undefined;
  const prefById = Object.fromEntries(prefs.map((row) => [row.periodId, row.archivedAt]));

  const withStatus = periods.map((p) => {
    const periodMembers = members.filter((m) => m.periodId === p.id);
    const status = periodStatusOf(p, {
      archivedAt: prefById[p.id],
      expenses: expenses.filter((e) => e.periodId === p.id),
      payments: payments.filter((pay) => pay.periodId === p.id),
    });
    const role = actorRoleOf(p, periodMembers, profile);
    return { period: p, members: periodMembers, status, canManage: canCompleteOrDeletePeriod(role) };
  });
  const active = withStatus.filter((row) => row.status !== 'archived' && row.status !== 'deleted');
  const archived = withStatus.filter((row) => row.status === 'archived');
  const deleted = withStatus.filter((row) => row.status === 'deleted' && row.canManage);

  const createBtn = (
    <button type="button" className="btn-primary inline-flex w-full items-center justify-center gap-2" onClick={() => openSheet('create')}>
      <Icon icon={Plus} size={18} />
      ساخت دوره جدید
    </button>
  );

  const renderList = (rows: typeof withStatus) => (
    <ul className="mt-4 grid gap-3 md:grid-cols-2">
      {rows.map((row, i) => (
        <li key={row.period.id} className="min-w-0 animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
          <PeriodCard
            period={row.period}
            members={row.members}
            expenses={expenses.filter((e) => e.periodId === row.period.id)}
            payments={payments.filter((pay) => pay.periodId === row.period.id)}
            chat={chat.filter((msg) => msg.periodId === row.period.id)}
            activity={activity.filter((rowAct) => rowAct.periodId === row.period.id)}
            avatarByUserId={avatarByUserId}
            profile={profile}
            persianDigits={persian}
          />
        </li>
      ))}
    </ul>
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
        {!periodsReady ? (
          <div className="mt-4">
            <PageSkeleton rows={3} />
          </div>
        ) : active.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              image
              title={periods.length === 0 ? 'هنوز دوره‌ای ندارید' : 'دورهٔ فعالی ندارید'}
              hint={
                periods.length === 0
                  ? 'یک دوره جدید بسازید و هزینه‌ها را با دوستان تقسیم کنید.'
                  : 'دوره‌های آرشیو یا حذف‌شده را از بخش‌های پایین ببینید.'
              }
              action={createBtn}
            />
          </div>
        ) : (
          renderList(active)
        )}
      </section>

      {archived.length ? (
        <section className="mt-10 animate-rise">
          <h2 className="text-lg font-extrabold text-ink-900">آرشیو</h2>
          <p className="mt-1 text-sm leading-6 text-ink-700/70">فقط برای شما پنهان شده‌اند. هر وقت خواستید از آرشیو خارج کنید.</p>
          {renderList(archived)}
        </section>
      ) : null}

      {deleted.length ? (
        <section className="mt-10 animate-rise">
          <h2 className="text-lg font-extrabold text-ink-900">حذف‌شده</h2>
          <p className="mt-1 text-sm leading-6 text-ink-700/70">حذف نرم است؛ مالک یا مدیر می‌تواند دوره را بازیابی کند.</p>
          {renderList(deleted)}
        </section>
      ) : null}
    </Shell>
  );
}
