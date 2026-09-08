import { useEffect, useState } from 'react';
import { EmptyRow, PageLoading, SearchBox } from '../components/ui';
import { api, faDate, faNum, type Page } from '../lib/api';
import { useSession } from '../lib/session';
import type { AuditRow } from '../lib/types';

export function AuditPage() {
  const { setToast } = useSession();
  const [q, setQ] = useState('');
  const [data, setData] = useState<Page<AuditRow> | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ q, limit: '100' });
          setData(await api<Page<AuditRow>>(`/admin/audit?${params}`));
        } catch (e) {
          setToast(e instanceof Error ? e.message : 'خطا', 'error');
        }
      })();
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, setToast]);

  return (
    <div className="animate-rise space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">فعالیت ادمین</h1>
        <SearchBox value={q} onChange={setQ} placeholder="جستجو عمل یا هدف…" />
      </div>
      <p className="text-xs text-ink-700/60">{data ? `${faNum(data.total)} رکورد` : ''}</p>
      {!data ? (
        <PageLoading />
      ) : (
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>زمان</th>
              <th>عمل</th>
              <th>هدف</th>
              <th>خلاصه</th>
              <th>ادمین</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length ? (
              data.items.map((row) => (
              <tr key={row.id}>
                <td>{faDate(row.createdAt)}</td>
                <td>{row.action}</td>
                <td>
                  {row.targetType} / {row.targetId}
                </td>
                <td>{row.summary}</td>
                <td dir="ltr">{row.actorPhone || row.actorUserId}</td>
              </tr>
              ))
            ) : (
              <EmptyRow colSpan={5} />
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
