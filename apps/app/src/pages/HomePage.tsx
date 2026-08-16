import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PeriodKind, PeriodTemplate, RoundTo } from '@dongham/ledger';
import { SyncBanner } from '../components/SyncBanner';
import { EmptyState, Money, Shell } from '../components/ui';
import { Modal } from '../components/Dialog';
import { CurrencySelect } from '../components/CurrencySelect';
import { MemberPicker } from '../components/MemberPicker';
import { db } from '../lib/db';
import { globalDebts } from '../lib/analytics';
import { fetchFxRates, type FxRates } from '../lib/fx';
import { formatJalaliDate, formatMoney } from '../lib/format';
import { currencyLabel } from '../lib/currencies';
import { scheduleDebtReminders } from '../lib/reminders';
import { createPeriodLocal } from '../lib/sync';
import { KIND_OPTIONS, ROUND_OPTIONS, TEMPLATES, templateById } from '../lib/templates';
import { pushWidgetBalance } from '../lib/widget';
import { useUiStore } from '../store/ui';

export function HomePage() {
  const navigate = useNavigate();
  const setToast = useUiStore((s) => s.setToast);
  const periods = useLiveQuery(() => db.periods.orderBy('updatedAt').reverse().toArray(), []) || [];
  const members = useLiveQuery(() => db.members.toArray(), []) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const payments = useLiveQuery(() => db.payments.toArray(), []) || [];
  const profile = useLiveQuery(() => db.profile.get('self'));
  const outbox = useLiveQuery(() => db.outbox.toArray(), []) || [];
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [memberNames, setMemberNames] = useState<string[]>([]);
  const [currency, setCurrency] = useState('IRT');
  const [template, setTemplate] = useState<PeriodTemplate>('custom');
  const [kind, setKind] = useState<PeriodKind>('split');
  const [roundTo, setRoundTo] = useState<RoundTo>(0);
  const [q, setQ] = useState('');
  const [fxRates, setFxRates] = useState<FxRates>({});

  useEffect(() => {
    void fetchFxRates().then(setFxRates);
  }, []);

  const filtered = periods.filter(
    (p) => !q || p.title.includes(q) || p.currency.includes(q.toUpperCase()),
  );

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

  useEffect(() => {
    void scheduleDebtReminders({ owedToMe: debts.owedToMe, iOwe: debts.iOwe });
    void pushWidgetBalance(
      formatMoney(debts.owedToMe, 'IRT', profile?.usePersianDigits ?? true),
      formatMoney(debts.iOwe, 'IRT', profile?.usePersianDigits ?? true),
    );
  }, [debts.owedToMe, debts.iOwe, profile?.usePersianDigits]);

  const create = async () => {
    if (!title.trim()) return;
    const id = await createPeriodLocal({
      title: title.trim(),
      currency,
      memberNames: memberNames.filter((n) => n !== profile?.displayName),
      template,
      kind,
      roundTo,
    });
    setToast('دوره ساخته شد');
    setOpen(false);
    setTitle('');
    setMemberNames([]);
    navigate(`/periods/${id}`);
  };

  return (
    <Shell
      title="دوره‌های من"
      action={
        <button type="button" className="btn-primary !py-2 !text-sm" onClick={() => setOpen(true)}>
          دوره جدید
        </button>
      }
    >
      <SyncBanner />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 animate-rise">
        <div className="card-surface">
          <p className="text-xs text-ink-700/70">طلب شما</p>
          <p className="mt-1 text-xl font-extrabold text-brand-800">
            <Money amount={debts.owedToMe} currency="IRT" />
          </p>
        </div>
        <div className="card-surface">
          <p className="text-xs text-ink-700/70">بدهی شما</p>
          <p className="mt-1 text-xl font-extrabold text-rose-700">
            <Money amount={debts.iOwe} currency="IRT" />
          </p>
        </div>
      </div>
      {debts.mixedUnconverted ? (
        <p className="mb-4 text-xs text-amber-900">بعضی دوره‌ها ارز دیگری دارند و نرخ تبدیل‌شان موجود نیست — در جمع تومان نیامدند.</p>
      ) : null}

      <div className="mb-4 animate-rise">
        <label className="label" htmlFor="search-periods">
          جستجو
        </label>
        <input
          id="search-periods"
          className="input"
          placeholder="نام دوره یا ارز..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="هنوز دوره‌ای ندارید"
          hint="بدون اینترنت هم می‌توانید دوره بسازید و هزینه ثبت کنید."
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {filtered.map((p, i) => (
            <li key={p.id} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <Link to={`/periods/${p.id}`} className="card-surface block transition hover:-translate-y-0.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-ink-900">{p.title}</p>
                    <p className="mt-1 text-xs text-ink-700/60">{formatJalaliDate(p.updatedAt)}</p>
                  </div>
                  <span className="rounded-full bg-brand-100 px-2.5 py-1 text-[11px] font-semibold text-brand-800">
                    {currencyLabel(p.currency)}
                  </span>
                </div>
                <p className="mt-3 text-xs text-ink-700/70">
                  {outbox.some((o) => o.periodId === p.id) || !p.synced ? 'در صف همگام‌سازی' : 'همگام'}
                  {p.template && p.template !== 'custom' ? ` · ${TEMPLATES.find((t) => t.id === p.template)?.label}` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="دوره جدید">
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="period-title">
                  عنوان
                </label>
                <input
                  id="period-title"
                  data-autofocus
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثل سفر شمال ۱۴۰۵"
                />
              </div>
              <div>
                <label className="label" htmlFor="period-template">
                  قالب
                </label>
                <select
                  id="period-template"
                  className="input"
                  value={template}
                  onChange={(e) => {
                    const t = e.target.value as PeriodTemplate;
                    setTemplate(t);
                    const tpl = templateById(t);
                    if (tpl.defaultKind) setKind(tpl.defaultKind);
                    if (tpl.defaultCurrency) setCurrency(tpl.defaultCurrency);
                  }}
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="period-kind">
                  نوع حساب
                </label>
                <select id="period-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as PeriodKind)}>
                  {KIND_OPTIONS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="period-round">
                  گرد کردن تسویه
                </label>
                <select
                  id="period-round"
                  className="input"
                  value={roundTo}
                  onChange={(e) => setRoundTo(Number(e.target.value) as RoundTo)}
                >
                  {ROUND_OPTIONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="period-currency">
                  ارز پایه
                </label>
                <CurrencySelect id="period-currency" value={currency} onChange={setCurrency} rates={fxRates} />
              </div>
              <MemberPicker
                selected={memberNames}
                onChange={setMemberNames}
                excludeNames={profile?.displayName ? [profile.displayName] : []}
                draftInputId="period-member-new"
              />
            </div>
            <div className="mt-5 flex gap-2">
              <button type="button" className="btn-ghost flex-1" onClick={() => setOpen(false)}>
                انصراف
              </button>
              <button type="button" className="btn-primary flex-1" onClick={create}>
                ساخت
              </button>
            </div>
      </Modal>
    </Shell>
  );
}
