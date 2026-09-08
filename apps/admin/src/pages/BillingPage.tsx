import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../components/ui';
import { api, faDate, faNum, type Page } from '../lib/api';
import { useSession } from '../lib/session';
import type { BillingEvent } from '../lib/types';

type Pending = { authority: string; userId: string; sku: string; amount: number; createdAt: string };
type Sheba = { identity: string; day: string; count: number };

export function BillingPage() {
  const { setToast } = useSession();
  const [pending, setPending] = useState<Page<Pending> | null>(null);
  const [sheba, setSheba] = useState<Page<Sheba> | null>(null);
  const [events, setEvents] = useState<Page<BillingEvent> | null>(null);
  const [drop, setDrop] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = async () => {
    const [p, s, e] = await Promise.all([
      api<Page<Pending>>('/admin/billing/zarinpal-pending'),
      api<Page<Sheba>>('/admin/billing/sheba-lookups'),
      api<Page<BillingEvent>>('/admin/billing/events?limit=50'),
    ]);
    setPending(p);
    setSheba(s);
    setEvents(e);
  };

  useEffect(() => {
    void load().catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'));
  }, [setToast]);

  const loadMoreEvents = async () => {
    if (!events) return;
    setLoadingMore(true);
    try {
      const next = await api<Page<BillingEvent>>(`/admin/billing/events?limit=50&offset=${events.items.length}`);
      setEvents({ ...next, items: [...events.items, ...next.items] });
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const sourceLabel: Record<BillingEvent['source'], string> = {
    bazaar: 'بازار',
    myket: 'مایکت',
    zarinpal: 'زرین‌پال',
    admin: 'ادمین',
  };

  return (
    <div className="animate-rise space-y-6">
      <h1 className="text-2xl font-extrabold">پرداخت</h1>
      <section>
        <h2 className="mb-2 font-bold">تاریخچه پرداخت موفق</h2>
        <p className="mb-2 text-xs text-ink-700/60">{events ? `${faNum(events.items.length)} از ${faNum(events.total)}` : ''}</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>کاربر</th>
                <th>منبع</th>
                <th>شناسه کالا</th>
                <th>مبلغ</th>
                <th>تا</th>
                <th>تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {(events?.items || []).map((row) => (
                <tr key={row.id}>
                  <td dir="ltr">{row.userId}</td>
                  <td>{sourceLabel[row.source]}</td>
                  <td>{row.sku || '—'}</td>
                  {/* Zarinpal stores rial; everything else in Dongham is toman. */}
                  <td title={row.amount != null ? `${faNum(row.amount)} ریال` : undefined}>
                    {row.amount != null ? `${faNum(Math.round(row.amount / 10))} تومان` : '—'}
                  </td>
                  <td>{faDate(row.until)}</td>
                  <td>{faDate(row.createdAt)}</td>
                </tr>
              ))}
              {!events?.items.length ? (
                <tr>
                  <td colSpan={6} className="text-ink-700/60">
                    موردی نیست
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {events && events.items.length < events.total ? (
          <button type="button" className="btn-ghost mt-2" disabled={loadingMore} onClick={() => void loadMoreEvents()}>
            {loadingMore ? '…' : 'بیشتر'}
          </button>
        ) : null}
      </section>
      <section>
        <h2 className="mb-2 font-bold">زرین‌پال معلق</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>کاربر</th>
                <th>شناسه کالا</th>
                <th>مبلغ</th>
                <th>تاریخ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(pending?.items || []).map((row) => (
                <tr key={row.authority}>
                  <td dir="ltr">{row.userId}</td>
                  <td>{row.sku}</td>
                  <td>{faNum(row.amount)} ریال</td>
                  <td>{faDate(row.createdAt)}</td>
                  <td>
                    <button type="button" className="btn-ghost text-danger" onClick={() => setDrop(row.authority)}>
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
              {!pending?.items.length ? (
                <tr>
                  <td colSpan={5} className="text-ink-700/60">
                    موردی نیست
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 className="mb-2 font-bold">سهمیه استعلام شبا</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>هویت</th>
                <th>روز</th>
                <th>تعداد</th>
              </tr>
            </thead>
            <tbody>
              {(sheba?.items || []).map((row) => (
                <tr key={`${row.identity}-${row.day}`}>
                  <td dir="ltr">{row.identity}</td>
                  <td>{row.day}</td>
                  <td>{faNum(row.count)}</td>
                </tr>
              ))}
              {!sheba?.items.length ? (
                <tr>
                  <td colSpan={3} className="text-ink-700/60">
                    موردی نیست
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <ConfirmDialog
        open={Boolean(drop)}
        title="حذف پرداخت معلق"
        message="این درخواست زرین‌پال از صف معلق حذف می‌شود."
        danger
        onClose={() => setDrop(null)}
        onConfirm={() => {
          const authority = drop;
          setDrop(null);
          if (!authority) return;
          void api(`/admin/billing/zarinpal-pending/${encodeURIComponent(authority)}`, { method: 'DELETE' })
            .then(() => load())
            .then(() => setToast('حذف شد', 'success'))
            .catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'));
        }}
      />
    </div>
  );
}
