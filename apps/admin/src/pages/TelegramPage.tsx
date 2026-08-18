import { useEffect, useState } from 'react';
import { ConfirmDialog, SearchBox } from '../components/ui';
import { api, type Page } from '../lib/api';
import { useSession } from '../lib/session';

type LinkRow = { chatId: string; periodId: string; payerMemberId?: string; periodTitle?: string };

export function TelegramPage() {
  const { setToast } = useSession();
  const [q, setQ] = useState('');
  const [data, setData] = useState<Page<LinkRow> | null>(null);
  const [drop, setDrop] = useState<string | null>(null);

  const load = async (query = q) => {
    const params = new URLSearchParams({ q: query, limit: '100' });
    setData(await api<Page<LinkRow>>(`/admin/telegram-links?${params}`));
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load(q).catch((e) => setToast(e instanceof Error ? e.message : 'خطا'));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, setToast]);

  return (
    <div className="animate-rise space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">تلگرام</h1>
        <SearchBox value={q} onChange={setQ} placeholder="جستجو چت یا دوره…" />
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>چت</th>
              <th>دوره</th>
              <th>پرداخت‌کننده</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((row) => (
              <tr key={row.chatId}>
                <td dir="ltr">{row.chatId}</td>
                <td>
                  {row.periodTitle || row.periodId} <span className="text-ink-700/50">({row.periodId})</span>
                </td>
                <td>{row.payerMemberId || '—'}</td>
                <td>
                  <button type="button" className="btn-ghost text-rose-700" onClick={() => setDrop(row.chatId)}>
                    قطع اتصال
                  </button>
                </td>
              </tr>
            ))}
            {!data?.items.length ? (
              <tr>
                <td colSpan={4} className="text-ink-700/60">
                  موردی نیست
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={Boolean(drop)}
        title="قطع اتصال تلگرام"
        message="این چت دیگر به دوره وصل نخواهد بود."
        danger
        onClose={() => setDrop(null)}
        onConfirm={() => {
          const chatId = drop;
          setDrop(null);
          if (!chatId) return;
          void api(`/admin/telegram-links/${encodeURIComponent(chatId)}`, { method: 'DELETE' })
            .then(() => load())
            .then(() => setToast('قطع شد'))
            .catch((e) => setToast(e instanceof Error ? e.message : 'خطا'));
        }}
      />
    </div>
  );
}
