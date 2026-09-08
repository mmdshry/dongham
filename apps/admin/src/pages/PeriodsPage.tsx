import { PERIOD_STATUS_LABEL_FA, periodLifecycleStatus } from '@dongham/ledger';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyRow, PageLoading, SearchBox } from '../components/ui';
import { api, faDate, faNum, type Page } from '../lib/api';
import { useSession } from '../lib/session';
import type { PeriodListItem } from '../lib/types';

function statusOf(p: PeriodListItem) {
  return periodLifecycleStatus({
    deletedAt: p.deletedAt,
    completedAt: p.completedAt,
    createdAt: p.createdAt,
    expenses: p.lastActivityAt ? [{ createdAt: p.lastActivityAt }] : [],
  });
}

export function PeriodsPage() {
  const { setToast } = useSession();
  const [q, setQ] = useState('');
  const [data, setData] = useState<Page<PeriodListItem> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ q, limit: '50', offset: '0' });
          setData(await api<Page<PeriodListItem>>(`/admin/periods?${params}`));
        } catch (e) {
          setToast(e instanceof Error ? e.message : 'خطا', 'error');
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
      const next = await api<Page<PeriodListItem>>(`/admin/periods?${params}`);
      setData({ ...next, items: [...data.items, ...next.items] });
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="animate-rise space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">دوره‌ها</h1>
        <SearchBox value={q} onChange={setQ} placeholder="جستجو عنوان یا صاحب…" />
      </div>
      <p className="text-xs text-ink-700/60">{data ? `${faNum(data.items.length)} از ${faNum(data.total)} دوره` : ''}</p>
      {!data ? (
        <PageLoading />
      ) : (
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>عنوان</th>
              <th>وضعیت</th>
              <th>شناسه</th>
              <th>صاحب</th>
              <th>اعضا</th>
              <th>هزینه</th>
              <th>به‌روز</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length ? (
              data.items.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link className="font-semibold text-brand-800" to={`/periods/${p.id}`}>
                    {p.title}
                  </Link>
                </td>
                <td>{PERIOD_STATUS_LABEL_FA[statusOf(p)]}</td>
                <td dir="ltr">{p.id}</td>
                <td>{p.ownerName || p.ownerId}</td>
                <td>{faNum(p.memberCount)}</td>
                <td>{faNum(p.expenseCount)}</td>
                <td>{faDate(p.updatedAt)}</td>
              </tr>
              ))
            ) : (
              <EmptyRow colSpan={7} />
            )}
          </tbody>
        </table>
      </div>
      )}
      {data && data.items.length < data.total ? (
        <button type="button" className="btn-ghost" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? '…' : 'بیشتر'}
        </button>
      ) : null}
    </div>
  );
}
