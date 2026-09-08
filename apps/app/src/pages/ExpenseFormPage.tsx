import { useLiveQuery } from 'dexie-react-hooks';
import { nanoid } from 'nanoid';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SplitMode } from '@dongham/ledger';
import { describeSplitError, evenPercentShares, expenseTotal, validateShares } from '@dongham/ledger';
import { ConfirmDialog } from '../components/Dialog';
import { CurrencySelect } from '../components/CurrencySelect';
import { FxRatesPanel } from '../components/FxRatesPanel';
import { JalaliDatePicker } from '../components/JalaliDatePicker';
import { MoneyInput } from '../components/MoneyInput';
import { SplitEditor, type ShareDraft } from '../components/SplitEditor';
import { TagPicker, uniqueTags } from '../components/TagPicker';
import { Shell } from '../components/ui';
import { db, noneCharge } from '../lib/db';
import { isSelfMember } from '../lib/memberLabel';
import { fetchFxSnapshot, rateToPeriod } from '../lib/fx';
import { compressImage, parseReceiptHeuristic } from '../lib/ocr';
import { formatGrouped, formatMoney, parseMoneyInput, toLatinDigits, toPersianDigits, tomanToRial } from '../lib/format';
import { currencyLabel } from '../lib/currencies';
import { templateById } from '../lib/templates';
import { api, ensureProfile } from '../lib/api';
import { actorRoleOf, PERIOD_COMPLETED_REOPEN_HINT, periodWriteMessage } from '../lib/periodLifecycle';
import { upsertExpense } from '../lib/sync';
import { useUiStore } from '../store/ui';

type ChargeType = 'none' | 'percent' | 'amount';

function parseFxRateInput(raw: string): number | null {
  const latin = toLatinDigits(raw).replace(/[^\d.]/g, '');
  if (!latin || latin === '.') return null;
  const n = Number(latin);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function ExpenseFormPage() {
  const { id: periodId = '', expenseId } = useParams();
  const isNew = !expenseId || expenseId === 'new';
  const navigate = useNavigate();
  const setToast = useUiStore((s) => s.setToast);

  const period = useLiveQuery(() => db.periods.get(periodId), [periodId]);
  const members = useLiveQuery(() => db.members.where('periodId').equals(periodId).toArray(), [periodId]) || [];
  const periodExpenses =
    useLiveQuery(() => db.expenses.where('periodId').equals(periodId).toArray(), [periodId]) || [];
  const profile = useLiveQuery(() => db.profile.get('self'));
  const existing = useLiveQuery(
    () => (isNew ? undefined : db.expenses.get(expenseId!)),
    [expenseId, isNew],
  );

  const people = members.filter((m) => !m.isPot);
  const actorRole = actorRoleOf(period, members, profile);
  const isViewer = members.some((m) => m.role === 'viewer' && isSelfMember(m, profile));
  const writeDenied = periodWriteMessage(period, actorRole, isNew ? 'expense' : 'other');
  const reopenHint = Boolean(isNew && period?.completedAt && !period.deletedAt && !writeDenied);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState('IRT');
  const [payerId, setPayerId] = useState('');
  const [useMultiPayer, setUseMultiPayer] = useState(false);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, number>>({});
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [shares, setShares] = useState<ShareDraft[]>([]);
  const [taxType, setTaxType] = useState<ChargeType>('none');
  const [taxValue, setTaxValue] = useState(0);
  const [serviceType, setServiceType] = useState<ChargeType>('none');
  const [serviceValue, setServiceValue] = useState(0);
  const [tipType, setTipType] = useState<ChargeType>('none');
  const [tipValue, setTipValue] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [attachment, setAttachment] = useState<string | undefined>();
  const [fxRate, setFxRate] = useState(1);
  const [fxDraft, setFxDraft] = useState<string | null>(null);
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString());
  const [itemSplits, setItemSplits] = useState<{ name: string; amount: number; memberId: string }[]>([]);
  const [needManualFx, setNeedManualFx] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fxRates, setFxRates] = useState<Record<string, number>>({});

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setAmount(existing.amount);
      setCurrency(existing.currency);
      setPayerId(existing.payerId);
      setSplitMode(existing.splitMode);
      setShares(existing.shares);
      setTaxType(existing.tax?.type || 'none');
      setTaxValue(existing.tax?.value || 0);
      setServiceType(existing.service?.type || 'none');
      setServiceValue(existing.service?.value || 0);
      setTipType(existing.tip?.type || 'none');
      setTipValue(existing.tip?.value || 0);
      setTags(existing.tags || []);
      setNote(existing.note || '');
      setAttachment(existing.attachmentDataUrl);
      setFxRate(existing.fxRate);
      setFxDraft(null);
      setOccurredAt(existing.occurredAt || existing.createdAt);
      if (existing.payers?.length) {
        setUseMultiPayer(true);
        const map: Record<string, number> = {};
        for (const p of existing.payers) map[p.memberId] = p.amount;
        setPayerAmounts(map);
      }
    }
  }, [existing]);

  useEffect(() => {
    void fetchFxSnapshot().then((s) => setFxRates(s.rates));
  }, []);

  useEffect(() => {
    if (!isNew || !people.length) return;
    const defaultPayer =
      period?.kind === 'banker' && period.bankerMemberId ? period.bankerMemberId : people[0].id;
    if (!payerId) setPayerId(defaultPayer);
    setShares((prev) => {
      const byId = new Map(prev.map((s) => [s.memberId, s]));
      return people.map((m) => {
        const existingShare = byId.get(m.id);
        if (existingShare) return existingShare;
        return {
          memberId: m.id,
          value: m.weightDefault || 1,
          excluded: !!m.excludeFromNew,
        };
      });
    });
    if (period?.currency) setCurrency(period.currency);
    // people is derived; members.length is the stable trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members.length, isNew, period]);

  const persian = profile?.usePersianDigits ?? true;
  const modeHint = useMemo(() => {
    if (splitMode === 'weight')
      return 'ضریب هر نفر را وارد کنید (مثلاً ۱.۲۵۰ یعنی یک‌و‌ربع برابر؛ تا ۳ رقم اعشار)';
    if (splitMode === 'exact') return 'مبلغ دقیق سهم هر نفر — جمع باید برابر مبلغ کل (+سرویس/مالیات/انعام) باشد';
    if (splitMode === 'percent') return 'درصد سهم هر نفر — جمع باید ۱۰۰ باشد';
    return 'تقسیم مساوی بین افراد فعال';
  }, [splitMode]);

  const onReceipt = async (file: File) => {
    const dataUrl = await compressImage(file);
    setAttachment(dataUrl);
    const ocr = await parseReceiptHeuristic(file.name);
    if (ocr.title) setTitle((t) => t || ocr.title);
    if (ocr.amountToman && (currency === 'IRT' || currency === 'IRR')) {
      setAmount(currency === 'IRR' ? tomanToRial(ocr.amountToman) : ocr.amountToman);
    }
    if (ocr.items.length && people[0]) {
      setItemSplits(
        ocr.items.map((it) => ({
          name: it.name,
          amount: it.amountToman,
          memberId: people[0].id,
        })),
      );
      setToast(`مبلغ از نام فایل حدس زده شد (اطمینان ${toPersianDigits(Math.round(ocr.confidence * 100), persian)}٪)`, 'info');
    }
  };

  const applyItemSplits = () => {
    if (!itemSplits.length) return;
    const byMember = new Map<string, number>();
    for (const it of itemSplits) {
      byMember.set(it.memberId, (byMember.get(it.memberId) || 0) + it.amount);
    }
    const total = [...byMember.values()].reduce((s, n) => s + n, 0);
    setAmount(total);
    setSplitMode('exact');
    setShares(
      people.map((m) => ({
        memberId: m.id,
        value: byMember.get(m.id) || 0,
        excluded: !byMember.has(m.id),
      })),
    );
    setToast('تقسیم آیتمی اعمال شد', 'success');
  };

  const grandTotal = expenseTotal({
    id: 'tmp',
    title: title || 'x',
    amount,
    currency,
    payerId: payerId || 'x',
    splitMode,
    shares,
    tax: { type: taxType, value: taxValue },
    service: { type: serviceType, value: serviceValue },
    tip: { type: tipType, value: tipValue },
  });
  const payersSum = useMultiPayer
    ? people.reduce((s, m) => s + Math.round(payerAmounts[m.id] || 0), 0)
    : grandTotal;

  const applyFreeFx = async (from = currency) => {
    if (!period) return;
    const snap = await fetchFxSnapshot();
    const rate = rateToPeriod(snap.rates, from, period.currency);
    if (!rate) {
      setNeedManualFx(true);
      setToast('نرخ این ارز موجود نیست — قیمت را وارد کنید', 'warn');
      return;
    }
    setFxRate(rate);
    setFxDraft(null);
    setNeedManualFx(false);
    setToast('نرخ آزاد اعمال شد', 'success');
  };

  const onCurrencyChange = (next: string) => {
    if ((currency === 'IRT' && next === 'IRR') || (currency === 'IRR' && next === 'IRT')) {
      const msg = next === 'IRR' ? 'تبدیل تومان به ریال معمولاً ×۱۰ است' : 'تبدیل ریال به تومان معمولاً ÷۱۰ است';
      setToast(msg, 'warn', {
        source: 'currency-warn',
        action: {
          label: 'اعمال تبدیل',
          onClick: () => {
            setAmount((a) => (next === 'IRR' ? Math.round(a * 10) : Math.round(a / 10)));
          },
        },
      });
    }
    setCurrency(next);
    if (!period) return;
    if (next === period.currency) {
      setFxRate(1);
      setFxDraft(null);
      setNeedManualFx(false);
      return;
    }
    // تومان↔ریال is a fixed ×10 — never depends on a network rate and never stays at 1.
    const fixed = rateToPeriod({}, next, period.currency);
    if (fixed) {
      setFxRate(fixed);
      setFxDraft(null);
      setNeedManualFx(false);
      return;
    }
    void applyFreeFx(next);
  };

  const save = async () => {
    if (isViewer) {
      setToast('نقش بیننده اجازهٔ ذخیره ندارد', 'error');
      return;
    }
    const denied = periodWriteMessage(period, actorRole, isNew ? 'expense' : 'other');
    if (denied) {
      setToast(denied, 'error');
      return;
    }
    if (!title.trim() || amount <= 0 || !payerId) {
      setToast('عنوان، مبلغ و پرداخت‌کننده لازم است', 'error');
      return;
    }
    let savedFxRate = fxRate;
    if (period && currency !== period.currency) {
      // تومان↔ریال: always store the fixed 10 / 0.1 rate so balances never see a 10× error.
      const fixed = rateToPeriod({}, currency, period.currency);
      if (fixed) {
        savedFxRate = fixed;
      } else if (!fxRate || fxRate === 1) {
        setToast('نرخ تبدیل به ارز دوره لازم است', 'error');
        return;
      }
    }
    const check = validateShares(splitMode, grandTotal, shares);
    if (!check.ok) {
      setToast(describeSplitError(check.error), 'error');
      return;
    }
    // Ledger credits payers exactly what they typed, so it must add up to the taxed total.
    if (useMultiPayer && payersSum !== grandTotal) {
      setToast('جمع پرداخت‌کننده‌ها باید با مبلغ کل (با مالیات و سرویس) برابر باشد', 'error');
      return;
    }
    const now = new Date().toISOString();
    let attachmentId = existing?.attachmentId;
    let attachmentDataUrl = attachment || undefined;
    if (attachment) {
      const profile = await ensureProfile();
      if (profile.token && (typeof navigator === 'undefined' || navigator.onLine)) {
        const comma = attachment.indexOf(',');
        const header = comma >= 0 ? attachment.slice(0, comma) : '';
        const dataBase64 = comma >= 0 ? attachment.slice(comma + 1) : attachment;
        const mime = /data:([^;]+)/.exec(header)?.[1] || 'image/jpeg';
        try {
          const uploaded = await api<{ id: string }>('/attachments', {
            method: 'POST',
            body: JSON.stringify({ periodId, mime, dataBase64 }),
          });
          attachmentId = uploaded.id;
        } catch {
          /* keep local data URL */
        }
      }
    }
    const payers = useMultiPayer
      ? people
          .map((m) => ({ memberId: m.id, amount: payerAmounts[m.id] || 0 }))
          .filter((p) => p.amount > 0)
      : [];
    await upsertExpense({
      id: isNew ? nanoid() : expenseId!,
      periodId,
      title: title.trim(),
      amount: Math.round(amount),
      currency,
      payerId,
      payers,
      splitMode,
      shares,
      tax: { type: taxType, value: taxValue },
      service: { type: serviceType, value: serviceValue },
      tip: { type: tipType, value: tipValue },
      tags: uniqueTags(tags),
      note: note || undefined,
      attachmentId,
      attachmentDataUrl,
      fxRate: savedFxRate,
      createdAt: existing?.createdAt || now,
      occurredAt,
      updatedAt: now,
      version: (existing?.version || 0) + 1,
    });
    setToast('هزینه ذخیره شد', 'success');
    navigate(`/periods/${periodId}`);
  };

  const remove = async () => {
    if (isNew || isViewer) return;
    const denied = periodWriteMessage(period, actorRole, 'other');
    if (denied) {
      setToast(denied, 'error');
      return;
    }
    const now = new Date().toISOString();
    const row = await db.expenses.get(expenseId!);
    if (!row) return;
    await upsertExpense({
      ...row,
      service: row.service || noneCharge(),
      tip: row.tip || noneCharge(),
      payers: row.payers || [],
      occurredAt: row.occurredAt || row.createdAt,
      deletedAt: now,
      updatedAt: now,
      version: row.version + 1,
    });
    setToast('هزینه حذف شد', 'success');
    navigate(`/periods/${periodId}`);
  };

  const chargeSelect = (
    id: string,
    label: string,
    type: ChargeType,
    setType: (t: ChargeType) => void,
    value: number,
    setValue: (n: number) => void,
  ) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor={id}>
          {label}
        </label>
        <select id={id} className="input" value={type} onChange={(e) => setType(e.target.value as ChargeType)}>
          <option value="none">ندارد</option>
          <option value="percent">درصدی</option>
          <option value="amount">مبلغی</option>
        </select>
      </div>
      {type !== 'none' ? (
        <MoneyInput id={`${id}-val`} label="مقدار" value={value} onChange={setValue} />
      ) : null}
    </div>
  );

  const tagSuggestions = useMemo(() => {
    const fromTemplate =
      period?.template && period.template !== 'custom' ? templateById(period.template).tags : [];
    const fromExpenses = periodExpenses.filter((e) => !e.deletedAt).flatMap((e) => e.tags || []);
    return uniqueTags([...fromTemplate, ...fromExpenses]);
  }, [period, periodExpenses]);

  const hasExtras =
    useMultiPayer ||
    taxType !== 'none' ||
    serviceType !== 'none' ||
    tipType !== 'none' ||
    !!note ||
    !!attachment;

  return (
    <Shell title={isNew ? 'هزینه جدید' : 'ویرایش هزینه'} back={() => navigate(`/periods/${periodId}`)}>
      <div className="mx-auto grid max-w-3xl gap-4 animate-rise pb-4">
        {writeDenied ? <p className="text-sm leading-6 text-danger">{writeDenied}</p> : null}
        {reopenHint ? <p className="text-sm leading-6 text-ink-700/70">{PERIOD_COMPLETED_REOPEN_HINT}</p> : null}
        <div className="card-surface space-y-3">
          <h2 className="section-title">مشخصات</h2>
          <div>
            <label className="label" htmlFor="exp-title">
              عنوان
            </label>
            <input id="exp-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <JalaliDatePicker iso={occurredAt} onChange={setOccurredAt} label="تاریخ هزینه" />
          <MoneyInput id="exp-amount" label="مبلغ" value={amount} onChange={setAmount} />
          <div>
            <label className="label" htmlFor="payer">
              پرداخت‌کننده
            </label>
            <select id="payer" className="input" value={payerId} onChange={(e) => setPayerId(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="card-surface space-y-3">
          <h2 className="section-title">تقسیم بین افراد</h2>
          <p className="text-xs text-ink-700/70">{modeHint}</p>
          <SplitEditor
            mode={splitMode}
            onModeChange={(m) => {
              setSplitMode(m);
              // Percent defaults must add up to exactly 100 over the included members.
              const included = people.filter((mem) => !mem.excludeFromNew);
              const percents = evenPercentShares(included.length);
              setShares(
                people.map((mem) => {
                  const idx = included.indexOf(mem);
                  return {
                    memberId: mem.id,
                    value:
                      m === 'percent' ? (idx >= 0 ? percents[idx] : 0) : m === 'exact' ? 0 : mem.weightDefault || 1,
                    excluded: !!mem.excludeFromNew,
                  };
                }),
              );
            }}
            members={people}
            shares={shares}
            onChange={setShares}
            totalAmount={grandTotal}
          />
        </div>

        <div className="card-surface space-y-3">
          <h2 className="section-title">ارز</h2>
          <div>
            <label className="label" htmlFor="exp-currency">
              ارز هزینه
            </label>
            <CurrencySelect id="exp-currency" value={currency} onChange={onCurrencyChange} rates={fxRates} />
          </div>
          {currency !== period?.currency ? (
            <div className="space-y-2">
              <label className="label" htmlFor="fx-rate">
                نرخ تبدیل به {period ? currencyLabel(period.currency) : ''}
              </label>
              <input
                id="fx-rate"
                className="input"
                inputMode="decimal"
                dir="ltr"
                value={fxDraft ?? toPersianDigits(String(fxRate), persian)}
                onChange={(e) => {
                  const raw = e.target.value;
                  setFxDraft(raw);
                  const n = parseFxRateInput(raw);
                  if (n != null) setFxRate(n);
                }}
                onBlur={() => setFxDraft(null)}
              />
              <button type="button" className="btn-ghost text-sm" onClick={() => void applyFreeFx()}>
                نرخ آزاد
              </button>
              {needManualFx ? <FxRatesPanel compact /> : null}
              {period && currency !== period.currency && fxRate > 0 ? (
                <p className="text-sm text-brand-800">
                  معادل {formatMoney(Math.round(amount * fxRate), period.currency, persian)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="card-surface space-y-3">
          <h2 className="section-title">تگ‌ها</h2>
          <TagPicker
            selected={tags}
            onChange={setTags}
            suggestions={tagSuggestions}
            idPrefix="exp-tag"
          />
        </div>

        <details className="more-panel card-surface space-y-3" open={hasExtras || undefined}>
          <summary>تنظیمات بیشتر</summary>
          <div className="space-y-3 pb-1 pt-2">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={useMultiPayer} onChange={(e) => setUseMultiPayer(e.target.checked)} />
              چند پرداخت‌کننده
            </label>
            {useMultiPayer ? (
              <>
                {people.map((m) => (
                  <MoneyInput
                    key={m.id}
                    id={`payer-${m.id}`}
                    label={`پرداخت ${m.displayName}`}
                    value={payerAmounts[m.id] || 0}
                    onChange={(n) => setPayerAmounts((prev) => ({ ...prev, [m.id]: n }))}
                  />
                ))}
                {payersSum === grandTotal ? (
                  <p className="text-xs text-brand-800" role="status">
                    جمع پرداخت‌کننده‌ها با مبلغ کل برابر است
                  </p>
                ) : null}
              </>
            ) : null}
            {chargeSelect('service-type', 'حق سرویس', serviceType, setServiceType, serviceValue, setServiceValue)}
            {chargeSelect('tax-type', 'مالیات', taxType, setTaxType, taxValue, setTaxValue)}
            {chargeSelect('tip-type', 'انعام', tipType, setTipType, tipValue, setTipValue)}
            <div>
              <label className="label" htmlFor="note">
                یادداشت
              </label>
              <textarea id="note" className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="receipt">
                عکس رسید / تشخیص مبلغ از نام فایل
              </label>
              <input
                id="receipt"
                type="file"
                accept="image/*"
                className="block w-full text-sm"
                onChange={(e) => e.target.files?.[0] && onReceipt(e.target.files[0])}
              />
              {attachment ? (
                <img src={attachment} alt="رسید" className="mt-3 max-h-48 w-full max-w-full rounded-2xl object-cover" />
              ) : null}
            </div>
          </div>
        </details>

        {itemSplits.length ? (
          <div className="card-surface space-y-3">
            <h2 className="font-bold">تقسیم آیتمی (از نام فایل)</h2>
            {itemSplits.map((it, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_7rem_auto]">
                <input
                  className="input !py-2"
                  value={it.name}
                  onChange={(e) => {
                    const next = [...itemSplits];
                    next[idx] = { ...it, name: e.target.value };
                    setItemSplits(next);
                  }}
                />
                <input
                  className="input !py-2"
                  inputMode="numeric"
                  dir="ltr"
                  value={it.amount ? formatGrouped(it.amount, persian) : ''}
                  onChange={(e) => {
                    const next = [...itemSplits];
                    next[idx] = { ...it, amount: parseMoneyInput(e.target.value) };
                    setItemSplits(next);
                  }}
                />
                <select
                  className="input !py-2"
                  value={it.memberId}
                  onChange={(e) => {
                    const next = [...itemSplits];
                    next[idx] = { ...it, memberId: e.target.value };
                    setItemSplits(next);
                  }}
                >
                  {people.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button type="button" className="btn-ghost" onClick={applyItemSplits}>
              اعمال به سهم‌ها
            </button>
          </div>
        ) : null}

        <div className="sticky z-20 -mx-4 mt-1 flex gap-2 border-t border-brand-800/20 bg-surface/90 px-4 py-3 backdrop-blur bottom-[max(7.25rem,calc(var(--keyboard-inset,0px)+0.5rem))] md:bottom-0">
          {!isNew && !isViewer && !writeDenied ? (
            <button type="button" className="btn-ghost text-danger" onClick={() => setConfirmDelete(true)}>
              حذف
            </button>
          ) : null}
          <button type="button" className="btn-primary flex-1" onClick={save} disabled={isViewer || Boolean(writeDenied)}>
            ذخیره
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="حذف هزینه"
        message="این هزینه از دوره حذف می‌شود."
        confirmLabel="حذف"
        danger
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void remove();
        }}
      />
    </Shell>
  );
}
