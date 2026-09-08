import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, faNum } from '../lib/api';
import { useSession } from '../lib/session';
import type { AdminStats } from '../lib/types';

export function DashboardPage() {
  const { setToast } = useSession();
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setStats(await api<AdminStats>('/admin/stats'));
      } catch (e) {
        setToast(e instanceof Error ? e.message : 'خطا', 'error');
      }
    })();
  }, [setToast]);

  const cards = stats
    ? [
        { label: 'کاربران فعال', value: stats.usersActive, to: '/users' },
        { label: 'پریمیوم', value: stats.usersPremium, to: '/users' },
        { label: 'حذف‌شده', value: stats.usersDeleted, to: '/users' },
        { label: 'دوره‌ها', value: stats.periods, to: '/periods' },
        { label: 'هزینه‌ها', value: stats.expenses, to: '/periods' },
        { label: 'تسویه‌ها', value: stats.payments, to: '/periods' },
        { label: 'نشست‌ها', value: stats.sessions, to: '/users' },
        { label: 'زرین‌پال معلق', value: stats.zarinpalPending, to: '/billing' },
      ]
    : [];

  return (
    <div className="animate-rise space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">داشبورد</h1>
        <p className="mt-1 text-sm text-ink-700/70">
          وضعیت API: {stats?.health.ok ? 'سالم' : 'نامشخص'}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="card hover:ring-brand-600/30">
            <p className="text-xs text-ink-700/70">{c.label}</p>
            <p className="mt-1 text-2xl font-extrabold text-brand-800">{faNum(c.value)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
