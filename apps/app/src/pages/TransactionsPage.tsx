import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { EmptyState, Money, Shell } from '../components/ui';
import { db } from '../lib/db';
import { formatCalendarDate } from '../lib/format';
import { useCalendarMode } from '../lib/calendarPref';

type Row = {
  id: string;
  at: string;
  title: string;
  amount: number;
  currency: string;
  periodId: string;
  periodTitle: string;
  kind: 'expense' | 'payment';
};

export function TransactionsPage() {
  const periods = useLiveQuery(() => db.periods.toArray(), []) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const payments = useLiveQuery(() => db.payments.toArray(), []) || [];
  const calendarMode = useCalendarMode();
  const titleOf = (id: string) => periods.find((p) => p.id === id)?.title || 'دوره';

  const rows: Row[] = [
    ...expenses
      .filter((e) => !e.deletedAt)
      .map((e) => ({
        id: `e-${e.id}`,
        at: e.occurredAt || e.createdAt,
        title: e.title,
        amount: e.amount,
        currency: e.currency,
        periodId: e.periodId,
        periodTitle: titleOf(e.periodId),
        kind: 'expense' as const,
      })),
    ...payments
      .filter((p) => !p.deletedAt)
      .map((p) => ({
        id: `p-${p.id}`,
        at: p.createdAt,
        title: p.kind === 'loan' ? 'قرض' : 'پرداخت / تسویه',
        amount: p.amount,
        currency: p.currency,
        periodId: p.periodId,
        periodTitle: titleOf(p.periodId),
        kind: 'payment' as const,
      })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <Shell title="تراکنش‌ها" chrome="app">
      {rows.length === 0 ? (
        <EmptyState icon={Inbox} title="تراکنشی نیست" hint="با ساخت دوره و ثبت هزینه، اینجا فهرست می‌شود." />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={row.kind === 'expense' ? `/periods/${row.periodId}` : `/periods/${row.periodId}`}
                className="card-surface flex items-center justify-between gap-3 !py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-ink-900">{row.title}</p>
                  <p className="mt-0.5 text-xs text-ink-700/60">
                    {row.periodTitle} · {formatCalendarDate(row.at, calendarMode)}
                  </p>
                </div>
                <p className={`shrink-0 text-sm font-extrabold ${row.kind === 'payment' ? 'text-brand-800' : 'text-ink-900'}`}>
                  <Money amount={row.amount} currency={row.currency} />
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
