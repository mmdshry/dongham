import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Money, Shell } from '../components/ui';
import { db } from '../lib/db';
import { globalDebts, globalTagTotals } from '../lib/analytics';
import { fetchFxRates, type FxRates } from '../lib/fx';
import { formatMoney } from '../lib/format';
import { usePersianDigits } from '../lib/usePersianDigits';
import { useUiStore } from '../store/ui';

export function ReportsPage() {
  const setToast = useUiStore((s) => s.setToast);
  const fxWarned = useRef(false);
  const periods = useLiveQuery(() => db.periods.toArray(), []) || [];
  const members = useLiveQuery(() => db.members.toArray(), []) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const payments = useLiveQuery(() => db.payments.toArray(), []) || [];
  const profile = useLiveQuery(() => db.profile.get('self'));
  const persian = usePersianDigits();
  const [fxRates, setFxRates] = useState<FxRates>({});

  useEffect(() => {
    void fetchFxRates().then(setFxRates);
  }, []);

  const debts = useMemo(
    () =>
      globalDebts(
        periods,
        members,
        expenses,
        payments,
        {
          userId: profile?.userId,
          guestKey: profile?.guestKey,
          displayName: profile?.displayName,
          phone: profile?.phone,
        },
        fxRates,
      ),
    [periods, members, expenses, payments, profile, fxRates],
  );

  const tags = useMemo(
    () => globalTagTotals(periods, members, expenses, payments, fxRates),
    [periods, expenses, payments, members, fxRates],
  );
  const byTag = tags.byTag;

  useEffect(() => {
    if (debts.mixedUnconverted || tags.mixedUnconverted) {
      if (!fxWarned.current) {
        fxWarned.current = true;
        setToast('بعضی دوره‌ها ارز دیگری دارند و نرخ تبدیل‌شان موجود نیست — در جمع تومان نیامدند.', 'warn');
      }
    }
  }, [debts.mixedUnconverted, tags.mixedUnconverted, setToast]);

  return (
    <Shell title="گزارش‌ها" chrome="app">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card-surface">
          <p className="text-xs text-ink-700/70">طلب شما</p>
          <p className="mt-1 text-xl font-extrabold text-brand-800">
            <Money amount={debts.owedToMe} currency="IRT" />
          </p>
        </div>
        <div className="card-surface">
          <p className="text-xs text-ink-700/70">بدهی شما</p>
          <p className="mt-1 text-xl font-extrabold text-danger">
            <Money amount={debts.iOwe} currency="IRT" />
          </p>
        </div>
      </div>
      {debts.byPerson.length > 0 ? (
        <section className="mt-6">
          <h2 className="section-title">بین افراد</h2>
          <ul className="mt-3 space-y-2">
            {debts.byPerson.map((row) => (
              <li key={row.key} className="card-surface flex items-center justify-between gap-3 !py-3">
                <span className="font-semibold">{row.name}</span>
                <span className={`text-sm font-bold ${row.amount > 0 ? 'text-brand-800' : 'text-danger'}`}>
                  {formatMoney(Math.abs(row.amount), 'IRT', persian)}
                  {row.amount > 0 ? ' طلب' : row.amount < 0 ? ' بدهی' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {byTag.length > 0 ? (
        <section className="mt-6">
          <h2 className="section-title">تفکیک تگ</h2>
          <ul className="mt-3 space-y-2">
            {byTag.map(([tag, amount]) => (
              <li key={tag} className="card-surface flex items-center justify-between gap-3 !py-3">
                <span>{tag}</span>
                <span className="text-sm font-bold">
                  <Money amount={amount} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Shell>
  );
}
