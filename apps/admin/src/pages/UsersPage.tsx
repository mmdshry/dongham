import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SearchBox } from '../components/ui';
import { isPremium } from '@dongham/ledger';
import { api, faDate, faNum, type Page } from '../lib/api';
import { useSession } from '../lib/session';
import type { AdminUser } from '../lib/types';

export function UsersPage() {
  const { setToast } = useSession();
  const [q, setQ] = useState('');
  const [data, setData] = useState<Page<AdminUser> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ q, limit: '50', offset: '0' });
          setData(await api<Page<AdminUser>>(`/admin/users?${params}`));
        } catch (e) {
          setToast(e instanceof Error ? e.message : 'خطا');
        }
      })();
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, setToast]);

  const loadMore = async () => {
    if (!data) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ q, limit: '50', offset: String(data.items.length) });
      const next = await api<Page<AdminUser>>(`/admin/users?${params}`);
      setData({ ...next, items: [...data.items, ...next.items] });
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="animate-rise space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">کاربران</h1>
        <SearchBox value={q} onChange={setQ} placeholder="جستجو نام، موبایل، ایمیل…" />
      </div>
      <p className="text-xs text-ink-700/60">{data ? `${faNum(data.items.length)} از ${faNum(data.total)} کاربر` : ''}</p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>نام</th>
              <th>موبایل</th>
              <th>ایمیل</th>
              <th>پلن</th>
              <th>ثبت</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((u) => (
              <tr key={u.id}>
                <td>
                  <Link className="font-semibold text-brand-800" to={`/users/${u.id}`}>
                    {u.displayName}
                  </Link>
                  {u.deletedAt ? <span className="mr-2 text-xs text-rose-700">حذف‌شده</span> : null}
                  {u.bannedAt ? <span className="mr-2 text-xs text-rose-700">مسدود</span> : null}
                </td>
                <td dir="ltr">{u.phone || '—'}</td>
                <td>{u.email || '—'}</td>
                <td>{isPremium(u) ? 'پریمیوم' : 'رایگان'}</td>
                <td>{faDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.items.length < data.total ? (
        <button type="button" className="btn-ghost" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? '…' : 'بیشتر'}
        </button>
      ) : null}
    </div>
  );
}
