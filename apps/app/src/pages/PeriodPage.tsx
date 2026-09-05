import { useLiveQuery } from 'dexie-react-hooks';
import { nanoid } from 'nanoid';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { inviteExpiresAt, isPeriodOwner, nextRecurringAt } from '@dongham/ledger';
import { PromptDialog } from '../components/Dialog';
import { MessengerShare } from '../components/MessengerShare';
import { MemberPicker } from '../components/MemberPicker';
import { SyncBanner } from '../components/SyncBanner';
import { TagPicker, uniqueTags } from '../components/TagPicker';
import { EmptyState, Money, Shell } from '../components/ui';
import { downloadJson } from '../lib/backup';
import { api, ensureProfile } from '../lib/api';
import { decryptMaybe } from '../lib/crypto';
import { db, POT_DISPLAY_NAME, type LocalMember, type RecurringCadence } from '../lib/db';
import { periodAnalytics } from '../lib/analytics';
import { useCalendarMode } from '../lib/calendarPref';
import { copyText, formatCalendarDate, formatCalendarDateTime, formatMoney, normalizeEmail, normalizeIranMobile, toPersianDigits } from '../lib/format';
import { fetchFxRates } from '../lib/fx';
import { loanEquivalentNow } from '../lib/goldIndex';
import { defaultPayout } from '../lib/payout';
import { shareCardImage, settlementPaySentence } from '../lib/share';
import { buildPeriodSnapshot, serializeSnapshot, snapshotQrDataUrl } from '../lib/snapshot';
import { applyPeriodSnapshot, flushOutbox, logActivity, queueOp, upsertPayment, upsertRecurring } from '../lib/sync';
import {
  canConfirmPayment,
  canMarkPaid,
  canRecordWithoutConfirm,
  hasPendingForEdge,
} from '../lib/settlementGuard';
import { CADENCE_OPTIONS } from '../lib/templates';
import { useUiStore } from '../store/ui';

type Tab = 'expenses' | 'balance' | 'chat' | 'activity' | 'more';

async function payoutOf(member: LocalMember | undefined, profileCard?: string, profileSheba?: string, profileHolder?: string, profileBank?: string) {
  if (!member) return { card: '', sheba: '', holder: '', bank: '' };
  const profile = await ensureProfile();
  const isSelf = member.guestKey === profile.guestKey || (profile.userId && member.userId === profile.userId);
  if (isSelf) {
    return {
      card: await decryptMaybe(profileCard || profile.cardNumber),
      sheba: await decryptMaybe(profileSheba || profile.sheba),
      holder: profileHolder || profile.cardHolderName || '',
      bank: profileBank || profile.bankName || '',
    };
  }
  return {
    card: await decryptMaybe(member.cardNumber),
    sheba: await decryptMaybe(member.sheba),
    holder: member.cardHolderName || '',
    bank: member.bankName || '',
  };
}

export function PeriodPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const setToast = useUiStore((s) => s.setToast);
  const [tab, setTab] = useState<Tab>('expenses');
  const [sort, setSort] = useState<'new' | 'old' | 'amount'>('new');
  const [q, setQ] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [snapQr, setSnapQr] = useState<string | null>(null);
  const [pickNames, setPickNames] = useState<string[]>([]);
  const [chatBody, setChatBody] = useState('');
  const [payoutCache, setPayoutCache] = useState<Record<string, { card: string; sheba: string; holder: string; bank: string }>>({});
  const [fx, setFx] = useState<Record<string, number>>({});
  const [recurringCadence, setRecurringCadence] = useState<RecurringCadence>('jalaliMonthly');
  const [snapPrompt, setSnapPrompt] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const period = useLiveQuery(() => db.periods.get(id), [id]);
  const members = useLiveQuery(() => db.members.where('periodId').equals(id).toArray(), [id]) || [];
  const expenses =
    useLiveQuery(() => db.expenses.where('periodId').equals(id).toArray(), [id])?.filter((e) => !e.deletedAt) ||
    [];
  const payments =
    useLiveQuery(() => db.payments.where('periodId').equals(id).toArray(), [id])?.filter((p) => !p.deletedAt) ||
    [];
  const chat = useLiveQuery(() => db.chat.where('periodId').equals(id).sortBy('createdAt'), [id]) || [];
  const recurring = useLiveQuery(() => db.recurring.where('periodId').equals(id).toArray(), [id]) || [];
  const activity = useLiveQuery(() => db.activity.where('periodId').equals(id).sortBy('createdAt'), [id]) || [];
  const profile = useLiveQuery(() => db.profile.get('self'));
  const persian = profile?.usePersianDigits ?? true;
  const calendarMode = useCalendarMode();

  useEffect(() => {
    void fetchFxRates().then(setFx);
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      const local = await db.periods.get(id);
      if (local || cancelled) return;
      try {
        const snap = await api<Parameters<typeof applyPeriodSnapshot>[0]>(`/periods/${id}/snapshot`);
        if (!cancelled) await applyPeriodSnapshot(snap);
      } catch {
        /* private or missing */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const meMember = members.find(
    (m) => m.guestKey === profile?.guestKey || (profile?.userId && m.userId === profile.userId),
  );
  const me = meMember
    ? {
        id: meMember.id,
        role: meMember.role,
        userId: profile?.userId,
        guestKey: profile?.guestKey,
        ownerId: period?.ownerId,
        ownerGuestKey: period?.ownerGuestKey,
      }
    : undefined;
  const isOwner = isPeriodOwner({
    ownerId: period?.ownerId,
    ownerGuestKey: period?.ownerGuestKey,
    userId: profile?.userId,
    guestKey: profile?.guestKey,
    memberRole: me?.role,
  });
  const isViewer = me?.role === 'viewer' || (!me && period?.visibility === 'public');

  const analytics = useMemo(
    () => periodAnalytics(expenses, payments, members, period?.roundTo || 0),
    [expenses, payments, members, period?.roundTo],
  );

  const periodTags = useMemo(
    () => uniqueTags(expenses.flatMap((e) => e.tags || [])),
    [expenses],
  );

  const filteredExpenses = useMemo(() => {
    let list = expenses.filter(
      (e) =>
        !q ||
        e.title.includes(q) ||
        e.tags.some((t) => t.includes(q)) ||
        e.note?.includes(q),
    );
    if (tagFilter.length) {
      list = list.filter((e) => tagFilter.some((t) => e.tags.includes(t)));
    }
    if (sort === 'new') {
      list = [...list].sort((a, b) => (b.occurredAt || b.createdAt).localeCompare(a.occurredAt || a.createdAt));
    }
    if (sort === 'old') {
      list = [...list].sort((a, b) => (a.occurredAt || a.createdAt).localeCompare(b.occurredAt || b.createdAt));
    }
    if (sort === 'amount') list = [...list].sort((a, b) => b.amount - a.amount);
    return list;
  }, [expenses, q, sort, tagFilter]);

  const ensurePayout = async (memberId: string) => {
    if (payoutCache[memberId]) return payoutCache[memberId];
    const member = members.find((m) => m.id === memberId);
    const p = await payoutOf(member, profile?.cardNumber, profile?.sheba, profile?.cardHolderName, profile?.bankName);
    const isSelf =
      !!member &&
      (member.guestKey === profile?.guestKey || (!!profile?.userId && member.userId === profile.userId));
    if (isSelf) {
      const def = await defaultPayout(profile);
      if (def) {
        const merged = {
          card: def.card || p.card,
          sheba: def.sheba || p.sheba,
          holder: def.holder || p.holder,
          bank: def.bank || p.bank,
        };
        setPayoutCache((c) => ({ ...c, [memberId]: merged }));
        return merged;
      }
    }
    setPayoutCache((c) => ({ ...c, [memberId]: p }));
    return p;
  };

  if (!period) {
    return (
      <Shell title="دوره" back={() => navigate('/')}>
        <EmptyState title="دوره پیدا نشد" />
      </Shell>
    );
  }

  const createInvite = async () => {
    try {
      const p = await ensureProfile();
      let token: string;
      let expiresAt = inviteExpiresAt();
      if (p.token) {
        const res = await api<{ token: string; expiresAt?: string }>(`/periods/${id}/invites`, { method: 'POST' });
        token = res.token;
        expiresAt = res.expiresAt || inviteExpiresAt();
      } else {
        token = nanoid(12);
        expiresAt = inviteExpiresAt();
        setToast('برای دعوت از گوشی دیگر وارد شوید. این لینک فقط روی همین دستگاه کار می‌کند.');
      }
      await db.invites.put({ token, periodId: id, createdAt: new Date().toISOString(), expiresAt });
      const link = `${window.location.origin}/i/${token}`;
      setInviteLink(link);
      const dataUrl = await QRCode.toDataURL(link, { margin: 1, width: 280 });
      setQrUrl(dataUrl);
      await copyText(link);
      if (p.token) setToast('لینک دعوت کپی شد');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا در ساخت دعوت');
    }
  };

  const addPickedMembers = async () => {
    if (!pickNames.length || isViewer) return;
    const friends = await db.friends.toArray();
    let added = 0;
    for (const name of pickNames) {
      if (members.some((m) => m.displayName === name)) continue;
      const friend = friends.find((f) => f.displayName === name);
      const member = {
        id: nanoid(),
        periodId: id,
        displayName: name,
        phone: friend?.phone,
        email: friend?.email,
        weightDefault: 1,
        role: 'member' as const,
      };
      await db.members.put(member);
      await queueOp(id, 'member', 'upsert', member);
      await logActivity(id, profile?.displayName || 'من', 'member.add', `افزودن ${member.displayName}`);
      added += 1;
    }
    setPickNames([]);
    setToast(added ? `${toPersianDigits(added, persian)} عضو اضافه شد` : 'عضوی انتخاب نشده');
  };

  const saveMemberPhone = async (member: LocalMember, phone: string) => {
    const trimmed = phone.trim();
    if (trimmed && !normalizeIranMobile(trimmed)) {
      setToast('شماره موبایل نامعتبر است');
      return;
    }
    const next = { ...member, phone: normalizeIranMobile(trimmed) || undefined };
    await db.members.put(next);
    await queueOp(id, 'member', 'upsert', next);
  };

  const saveMemberEmail = async (member: LocalMember, email: string) => {
    const next = { ...member, email: normalizeEmail(email) || email.trim() || undefined };
    await db.members.put(next);
    await queueOp(id, 'member', 'upsert', next);
  };

  const toggleAbsent = async (member: LocalMember) => {
    const next = { ...member, excludeFromNew: !member.excludeFromNew };
    await db.members.put(next);
    await queueOp(id, 'member', 'upsert', next);
  };

  const setRole = async (member: LocalMember, role: LocalMember['role']) => {
    if (
      isViewer ||
      isPeriodOwner({
        ownerId: period.ownerId,
        ownerGuestKey: period.ownerGuestKey,
        userId: member.userId,
        guestKey: member.guestKey,
        memberRole: member.role,
      })
    ) {
      return;
    }
    const next = { ...member, role };
    await db.members.put(next);
    await queueOp(id, 'member', 'upsert', next);
  };

  const settleOne = async (
    fromMemberId: string,
    toMemberId: string,
    amount: number,
    status: 'settled' | 'pending_confirm' = 'settled',
  ) => {
    if (busyKey) return;
    if (status === 'pending_confirm') {
      if (!canMarkPaid(me, fromMemberId)) {
        setToast('فقط بدهکار می‌تواند این پرداخت را ثبت کند');
        return;
      }
    } else if (!canRecordWithoutConfirm(me, fromMemberId)) {
      setToast('فقط بدهکار می‌تواند این پرداخت را ثبت کند');
      return;
    }
    if (hasPendingForEdge(payments, fromMemberId, toMemberId)) {
      setToast('برای این تسویه درخواست در انتظار تأیید هست');
      return;
    }
    const key = `${fromMemberId}:${toMemberId}:${status}`;
    setBusyKey(key);
    try {
      const now = new Date().toISOString();
      await upsertPayment({
        id: nanoid(),
        periodId: id,
        fromMemberId,
        toMemberId,
        amount,
        currency: period.currency,
        kind: 'settlement',
        fxRate: 1,
        createdAt: now,
        updatedAt: now,
        version: 1,
        status,
      });
      setToast(status === 'pending_confirm' ? 'در انتظار تأیید طلبکار' : 'پرداخت ثبت شد');
    } finally {
      setBusyKey(null);
    }
  };

  const confirmPayment = async (paymentId: string) => {
    if (busyKey) return;
    const row = payments.find((p) => p.id === paymentId);
    if (!row) return;
    if (!canConfirmPayment(me, row.toMemberId)) {
      setToast('فقط طلبکار می‌تواند تأیید کند');
      return;
    }
    const key = `confirm:${paymentId}`;
    setBusyKey(key);
    try {
      await upsertPayment({ ...row, status: 'settled', updatedAt: new Date().toISOString() });
      setToast('تسویه تأیید شد');
    } finally {
      setBusyKey(null);
    }
  };

  const depositPot = async () => {
    const pot = members.find((m) => m.isPot);
    if (!pot || !me) return;
    navigate(`/periods/${id}/payment/new?kind=settlement&to=${pot.id}&from=${me.id}`);
  };

  const sendChat = async () => {
    if (!chatBody.trim()) return;
    const p = await ensureProfile();
    const sender =
      members.find((m) => m.guestKey === p.guestKey || m.userId === p.userId) || members[0];
    const msg = {
      id: nanoid(),
      periodId: id,
      senderMemberId: sender.id,
      body: chatBody.trim(),
      createdAt: new Date().toISOString(),
      synced: false,
    };
    await db.chat.put(msg);
    await queueOp(id, 'chat', 'upsert', msg);
    setChatBody('');
  };

  const syncNow = async () => {
    const res = await flushOutbox(id);
    setToast(res.ok ? 'همگام شد' : res.error || 'خطا');
  };

  const addRecurring = async () => {
    if (!members[0] || isViewer) return;
    const people = members.filter((m) => !m.isPot);
    const rule = {
      id: nanoid(),
      periodId: id,
      title: 'اجاره / قبض',
      amount: 1_000_000,
      currency: period.currency,
      payerId: period.bankerMemberId || people[0].id,
      splitMode: 'equal' as const,
      shares: people.map((m) => ({ memberId: m.id, value: 1, excluded: m.excludeFromNew })),
      intervalDays: recurringCadence === 'jalaliBimonthly' ? 60 : recurringCadence === 'jalaliMonthly' ? 30 : 30,
      cadence: recurringCadence,
      nextAt: new Date().toISOString(),
      active: true,
    };
    await upsertRecurring(rule);
    setToast('قانون تکراری اضافه شد');
  };

  const runRecurring = async () => {
    if (isViewer) return;
    const now = Date.now();
    for (const rule of recurring.filter((r) => r.active && new Date(r.nextAt).getTime() <= now)) {
      const exp = {
        id: nanoid(),
        periodId: id,
        title: rule.title,
        amount: rule.amount,
        currency: rule.currency,
        payerId: rule.payerId,
        payers: [] as { memberId: string; amount: number }[],
        splitMode: rule.splitMode,
        shares: rule.shares,
        tax: { type: 'none' as const, value: 0 },
        service: { type: 'none' as const, value: 0 },
        tip: { type: 'none' as const, value: 0 },
        tags: ['تکراری'],
        fxRate: 1,
        createdAt: new Date().toISOString(),
        occurredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      const { upsertExpense } = await import('../lib/sync');
      await upsertExpense(exp);
      const nextAt = nextRecurringAt(new Date().toISOString(), rule.cadence || 'days', rule.intervalDays);
      const nextRule = { ...rule, nextAt };
      await db.recurring.put(nextRule);
      await queueOp(id, 'recurring', 'upsert', nextRule);
    }
    setToast('هزینه‌های تکراری اجرا شد');
  };

  const rotateLunch = async () => {
    const people = members.filter((m) => !m.isPot);
    if (!people.length) return;
    const idx = Math.max(0, people.findIndex((m) => m.id === period.lunchTurnMemberId));
    const next = people[(idx + 1) % people.length];
    await db.periods.update(id, { lunchTurnMemberId: next.id });
    await queueOp(id, 'period', 'upsert', { lunchTurnMemberId: next.id });
    setToast(`نوبت ناهار: ${next.displayName}`);
  };

  const saveUnit = async (member: LocalMember, unitLabel: string) => {
    const next = { ...member, unitLabel: unitLabel.trim() || undefined };
    await db.members.put(next);
    await queueOp(id, 'member', 'upsert', next);
  };

  const exportOfflineSnap = async (pass?: string) => {
    const snap = await buildPeriodSnapshot(id);
    const raw = await serializeSnapshot(snap, pass || undefined);
    const qr = await snapshotQrDataUrl(raw);
    setSnapQr(qr);
    const blob = new Blob([raw], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dongham-period-${id}.json`;
    a.click();
    setToast(qr ? 'QR و فایل آماده است' : 'فایل ذخیره شد (برای QR بزرگ بود)');
  };

  const toggleEncrypt = async () => {
    const next = !period.encrypted;
    await db.periods.update(id, { encrypted: next });
    await queueOp(id, 'period', 'upsert', { encrypted: next });
    setToast(next ? 'رمز AES سرور برای این دوره روشن شد' : 'رمز AES سرور خاموش شد');
  };

  const setVisibility = async (visibility: 'private' | 'public') => {
    if (!isOwner || !period) return;
    await db.periods.update(id, { visibility });
    await queueOp(id, 'period', 'upsert', { visibility });
    setToast(visibility === 'public' ? 'دوره عمومی شد' : 'دوره خصوصی شد');
  };

  const saveBuildingCharge = async (value: number) => {
    await db.periods.update(id, { buildingCharge: value });
    await queueOp(id, 'period', 'upsert', { buildingCharge: value });
    for (const rule of recurring.filter((r) => r.title.includes('شارژ'))) {
      await db.recurring.update(rule.id, { amount: value });
    }
  };

  const moneyLabel = (n: number, cur = period.currency) => formatMoney(n, cur, persian);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'expenses', label: 'هزینه‌ها' },
    { id: 'balance', label: 'حساب' },
    { id: 'chat', label: 'چت' },
    { id: 'activity', label: 'تاریخچه' },
    { id: 'more', label: 'ابزار' },
  ];

  return (
    <Shell
      title={period.title}
      back={() => navigate('/')}
      action={
        isViewer ? null : (
          <Link to={`/periods/${id}/expenses/new`} className="btn-primary !py-2 !text-sm">
            هزینه جدید
          </Link>
        )
      }
    >
      <SyncBanner periodId={id} />
      <div className="-mx-4 mb-4 overflow-x-auto px-4 no-scrollbar animate-rise" role="tablist" aria-label="بخش‌های دوره">
        <div className="flex w-max min-w-full gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`chip ${tab === t.id ? 'bg-brand-700 text-white' : 'bg-surface/80 text-ink-800 ring-1 ring-brand-700/10'}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
        <div>
          {tab === 'expenses' ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="input min-w-0 flex-1"
                  placeholder="جستجو در هزینه‌ها و تگ‌ها"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <select className="input sm:!w-auto" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                  <option value="new">جدیدترین</option>
                  <option value="old">قدیمی‌ترین</option>
                  <option value="amount">بیشترین مبلغ</option>
                </select>
              </div>
              {periodTags.length ? (
                <TagPicker
                  selected={tagFilter}
                  onChange={setTagFilter}
                  suggestions={periodTags}
                  allowCreate={false}
                  label="فیلتر تگ"
                  idPrefix="period-tag"
                />
              ) : null}
              {filteredExpenses.length === 0 ? (
                <EmptyState title="هزینه‌ای نیست" hint="اولین هزینه را ثبت کنید." />
              ) : (
                <ul className="space-y-2">
                  {filteredExpenses.map((e) => (
                    <li key={e.id}>
                      <Link to={`/periods/${id}/expenses/${e.id}`} className="card-surface flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{e.title}</p>
                          <p className="mt-1 truncate text-xs text-ink-700/60">
                            {formatCalendarDate(e.occurredAt || e.createdAt, calendarMode, persian)}
                          </p>
                          {e.tags.length ? (
                            <ul className="mt-2 flex flex-wrap gap-1">
                              {e.tags.map((tag) => (
                                <li
                                  key={tag}
                                  className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-800"
                                >
                                  {tag}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-end tabular-nums">
                          <Money amount={e.amount} currency={e.currency} />
                          {e.currency !== period.currency ? (
                            <span className="mt-1 block text-[11px] font-medium text-ink-700/60">
                              معادل{' '}
                              <Money amount={Math.round(e.amount * (e.fxRate || 1))} currency={period.currency} />
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === 'balance' ? (
            <div className="space-y-4 animate-rise">
              <div className="card-surface">
                <p className="text-sm text-ink-700/70">جمع هزینه‌ها</p>
                <p className="mt-1 text-2xl font-extrabold text-brand-800">
                  <Money amount={analytics.total} currency={period.currency} />
                </p>
              </div>
              <div className="card-surface">
                <h3 className="font-bold">حساب اعضا</h3>
                <ul className="mt-3 space-y-2">
                  {Object.entries(analytics.balances).map(([mid, bal]) => {
                    const status = bal > 0.5 ? 'طلبکار' : bal < -0.5 ? 'بدهکار' : 'تسویه';
                    return (
                      <li key={mid} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">
                          {analytics.nameOf(mid)}
                          <span className="ms-2 text-xs text-ink-700/60"> · {status}</span>
                        </span>
                        <span className={`shrink-0 ${bal >= 0 ? 'text-brand-800' : 'text-rose-700'}`}>
                          <Money amount={bal} currency={period.currency} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="card-surface">
                <h3 className="font-bold">تسویه حساب</h3>
                {analytics.settlements.length > 0 ? (
                  <p className="mt-2 text-xs text-ink-700/70">برای صفر شدن حساب‌ها این پرداخت‌ها کافی است.</p>
                ) : null}
                <ul className="mt-3 space-y-2">
                  {analytics.settlements.length === 0 ? (
                    <li className="text-sm text-ink-700/70">همه‌چیز تسویه است</li>
                  ) : (
                    analytics.settlements.map((s, i) => {
                      const debtor = members.find((m) => m.id === s.fromMemberId);
                      const creditor = members.find((m) => m.id === s.toMemberId);
                      const cached = payoutCache[s.toMemberId];
                      const amountLabel = moneyLabel(s.amount);
                      const showPaid = canMarkPaid(me, s.fromMemberId);
                      const showRecord = canRecordWithoutConfirm(me, s.fromMemberId);
                      const pendingEdge = hasPendingForEdge(payments, s.fromMemberId, s.toMemberId);
                      const settleBusy = busyKey !== null;
                      return (
                        <li key={i} className="space-y-3 rounded-2xl bg-brand-50 p-3 text-sm">
                          <p className="font-semibold leading-6">
                            {settlementPaySentence(
                              analytics.nameOf(s.fromMemberId),
                              analytics.nameOf(s.toMemberId),
                              amountLabel,
                            )}
                          </p>
                          {showPaid || showRecord ? (
                            <div className="flex flex-col gap-2 sm:flex-row">
                              {pendingEdge ? (
                                <p className="w-full text-xs text-ink-700/70 sm:order-last sm:basis-full">
                                  در انتظار تأیید طلبکار
                                </p>
                              ) : null}
                              {showPaid ? (
                                <button
                                  type="button"
                                  className="btn-primary flex-1"
                                  disabled={pendingEdge || settleBusy}
                                  onClick={() =>
                                    settleOne(s.fromMemberId, s.toMemberId, s.amount, 'pending_confirm')
                                  }
                                >
                                  پرداخت کردم
                                </button>
                              ) : null}
                              {showRecord ? (
                                <button
                                  type="button"
                                  className="btn-ghost"
                                  disabled={pendingEdge || settleBusy}
                                  onClick={() => settleOne(s.fromMemberId, s.toMemberId, s.amount)}
                                >
                                  ثبت بدون تأیید
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                          <details className="more-panel rounded-2xl bg-surface/80 px-3">
                            <summary>اشتراک‌گذاری</summary>
                            <div className="flex flex-wrap gap-2 pb-3">
                              <button
                                type="button"
                                className="btn-ghost"
                                onClick={async () => {
                                  const pay = await ensurePayout(s.toMemberId);
                                  const text = [
                                    pay.card && `کارت: ${pay.card}`,
                                    pay.sheba && `شبا: ${pay.sheba}`,
                                    `مبلغ: ${amountLabel}`,
                                  ]
                                    .filter(Boolean)
                                    .join('\n');
                                  await copyText(text);
                                  setToast('کارت و مبلغ کپی شد');
                                }}
                              >
                                کپی کارت طلبکار
                              </button>
                              <button
                                type="button"
                                className="btn-ghost"
                                onClick={async () => {
                                  const pay = await ensurePayout(s.toMemberId);
                                  await shareCardImage({
                                    amountLabel,
                                    card: pay.card,
                                    sheba: pay.sheba,
                                    holder: pay.holder,
                                    bank: pay.bank,
                                    creditorName: creditor?.displayName,
                                    persianDigits: persian,
                                  });
                                }}
                              >
                                تصویر کارت طلبکار
                              </button>
                            </div>
                            <div className="pb-3">
                              <MessengerShare
                                phone={debtor?.phone}
                                debtorName={debtor?.displayName || ''}
                                creditorName={creditor?.displayName || ''}
                                amountLabel={amountLabel}
                                card={cached?.card}
                                sheba={cached?.sheba}
                                holder={cached?.holder}
                                bank={cached?.bank}
                              />
                            </div>
                          </details>
                        </li>
                      );
                    })
                  )}
                </ul>
                {payments.some((p) => p.status === 'pending_confirm') ? (
                  <div className="mt-3 space-y-2">
                    <h4 className="text-sm font-bold">در انتظار تأیید</h4>
                    {payments
                      .filter((p) => p.status === 'pending_confirm')
                      .map((p) => (
                        <div key={p.id} className="flex flex-col gap-2 rounded-2xl bg-amber-50 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                          <span className="leading-6">
                            {settlementPaySentence(
                              analytics.nameOf(p.fromMemberId),
                              analytics.nameOf(p.toMemberId),
                              moneyLabel(p.amount, p.currency),
                            )}
                          </span>
                          {canConfirmPayment(me, p.toMemberId) ? (
                            <button
                              type="button"
                              className="btn-ghost shrink-0"
                              disabled={busyKey !== null}
                              onClick={() => confirmPayment(p.id)}
                            >
                              تأیید
                            </button>
                          ) : null}
                        </div>
                      ))}
                  </div>
                ) : null}
                {payments.some((p) => p.kind === 'loan' && p.indexAsset && p.indexAsset !== 'none') ? (
                  <ul className="mt-3 space-y-1 text-xs text-ink-700/80">
                    {payments
                      .filter((p) => p.kind === 'loan' && p.indexAsset && p.indexAsset !== 'none')
                      .map((p) => {
                        const nowEq = loanEquivalentNow(p.amount, p.indexAsset, p.indexRateAtCreate, fx);
                        return (
                          <li key={p.id}>
                            قرض {analytics.nameOf(p.fromMemberId)} → {analytics.nameOf(p.toMemberId)}
                            {nowEq != null ? (
                              <>
                                {' '}
                                · معادل امروز <Money amount={nowEq} currency={period.currency} />
                              </>
                            ) : null}
                          </li>
                        );
                      })}
                  </ul>
                ) : null}
                {!isViewer ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link to={`/periods/${id}/payment/new`} className="btn-ghost text-sm">
                      پرداخت / قرض جدید
                    </Link>
                    {period.kind === 'pot' ? (
                      <button type="button" className="btn-ghost text-sm" onClick={depositPot}>
                        واریز به {POT_DISPLAY_NAME}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="card-surface">
                <h3 className="font-bold">آمار تگ‌ها</h3>
                <ul className="mt-3 space-y-1 text-sm">
                  {Object.entries(analytics.byTag).map(([tag, amount]) => (
                    <li key={tag} className="flex justify-between">
                      <span>{tag}</span>
                      <Money amount={amount} currency={period.currency} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {tab === 'chat' ? (
            <div className="card-surface flex h-[min(55dvh,calc(100dvh-13rem-var(--keyboard-inset,0px)))] flex-col animate-rise">
              <ul className="flex-1 space-y-2 overflow-y-auto">
                {chat.map((m) => (
                  <li key={m.id} className="rounded-2xl bg-brand-50 px-3 py-2 text-sm">
                    <p className="text-[11px] text-brand-800">{analytics.nameOf(m.senderMemberId)}</p>
                    <p>{m.body}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <input
                  className="input"
                  value={chatBody}
                  onChange={(e) => setChatBody(e.target.value)}
                  placeholder="پیام درباره هزینه..."
                  onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                />
                <button type="button" className="btn-primary" onClick={sendChat}>
                  ارسال
                </button>
              </div>
            </div>
          ) : null}

          {tab === 'activity' ? (
            <ul className="space-y-2 animate-rise">
              {[...activity].reverse().map((a) => {
                const related =
                  (a.entityId && expenses.find((e) => e.id === a.entityId)) ||
                  (a.entityId && payments.find((p) => p.id === a.entityId)) ||
                  undefined;
                const createdAt = related?.createdAt || a.createdAt;
                const updatedAt = related && 'updatedAt' in related ? related.updatedAt : undefined;
                return (
                  <li key={a.id} className="card-surface text-sm">
                    <p className="font-semibold">{a.summary}</p>
                    <p className="mt-1 text-xs text-ink-700/60">
                      {a.actorName} · ایجاد: {formatCalendarDateTime(createdAt, calendarMode, persian)}
                    </p>
                    {updatedAt && updatedAt !== createdAt ? (
                      <p className="mt-0.5 text-xs text-ink-700/60">تغییر: {formatCalendarDateTime(updatedAt, calendarMode, persian)}</p>
                    ) : null}
                  </li>
                );
              })}
              {activity.length === 0 ? <EmptyState title="تاریخچه‌ای نیست" /> : null}
            </ul>
          ) : null}

          {tab === 'more' ? (
            <div className="space-y-3 animate-rise">
              <div className="card-surface space-y-3">
                <h3 className="font-bold">شناسه و دسترسی</h3>
                <p className="font-mono text-sm" dir="ltr">
                  {id}
                </p>
                <button
                  type="button"
                  className="btn-ghost w-full"
                  onClick={() => void copyText(id).then((ok) => setToast(ok ? 'کپی شد' : 'کپی نشد'))}
                >
                  کپی شناسه
                </button>
                {isOwner ? (
                  <label className="flex items-center justify-between gap-2 text-sm">
                    <span>عمومی (هر کس شناسه را بداند می‌بیند)</span>
                    <input
                      type="checkbox"
                      checked={(period.visibility || 'private') === 'public'}
                      onChange={(e) => void setVisibility(e.target.checked ? 'public' : 'private')}
                    />
                  </label>
                ) : (
                  <p className="text-xs text-ink-700/70">
                    {(period.visibility || 'private') === 'public' ? 'این دوره عمومی است.' : 'این دوره خصوصی است.'}
                  </p>
                )}
              </div>
              <div className="card-surface space-y-3">
                <h3 className="font-bold">اعضا</h3>
                <p className="text-xs text-ink-700/70">برای دیدن این دوره بعد از ورود، موبایل یا ایمیل لازم است.</p>
                <ul className="space-y-3 text-sm">
                  {members.map((m) => (
                    <li key={m.id} className="space-y-2 rounded-2xl bg-brand-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {m.displayName} {m.role === 'owner' ? '· مالک' : ''} {m.isPot ? '· صندوق' : ''}
                          {m.excludeFromNew ? ' · غایب' : ''}
                          {m.unitLabel ? ` · ${m.unitLabel}` : ''}
                          {!m.isPot && m.role !== 'owner' && !m.phone && !m.email ? ' · فقط محلی — بدون دسترسی ابری' : ''}
                        </span>
                        {!isViewer && !m.isPot && m.role !== 'owner' ? (
                          <select
                            className="input !w-auto !py-1 text-xs"
                            value={m.role}
                            onChange={(e) => setRole(m, e.target.value as LocalMember['role'])}
                          >
                            <option value="member">عضو</option>
                            <option value="viewer">بیننده</option>
                          </select>
                        ) : null}
                      </div>
                      {!m.isPot ? (
                        <>
                          <input
                            className="input !py-2"
                            placeholder="موبایل ۰۹۱۲…"
                            dir="ltr"
                            defaultValue={m.phone || ''}
                            onBlur={(e) => saveMemberPhone(m, e.target.value)}
                            disabled={isViewer}
                          />
                          <input
                            className="input !py-2"
                            placeholder="ایمیل"
                            dir="ltr"
                            defaultValue={m.email || ''}
                            onBlur={(e) => saveMemberEmail(m, e.target.value)}
                            disabled={isViewer}
                          />
                          {period.template === 'building' ? (
                            <input
                              className="input !py-2"
                              placeholder="واحد (مثلاً ۱۲)"
                              defaultValue={m.unitLabel || ''}
                              onBlur={(e) => saveUnit(m, e.target.value)}
                              disabled={isViewer}
                            />
                          ) : null}
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={!!m.excludeFromNew}
                              disabled={isViewer}
                              onChange={() => toggleAbsent(m)}
                            />
                            غایب از هزینه‌های جدید
                          </label>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {!isViewer ? (
                  <div className="space-y-2">
                    <MemberPicker
                      selected={pickNames}
                      onChange={setPickNames}
                      excludeNames={members.map((m) => m.displayName)}
                      draftInputId="period-add-member"
                    />
                    <button type="button" className="btn-primary w-full" onClick={() => void addPickedMembers()}>
                      افزودن انتخاب‌شده‌ها
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="card-surface space-y-2">
                <h3 className="font-bold">دعوت لینک / QR</h3>
                <button type="button" className="btn-primary w-full" onClick={createInvite}>
                  ساخت دعوت
                </button>
                {qrUrl ? <img src={qrUrl} alt="QR دعوت" className="mx-auto mt-2 max-w-full rounded-2xl" width={220} height={220} /> : null}
                {inviteLink
                  ? members
                      .filter((m) => m.phone && !m.isPot)
                      .map((m) => (
                        <div key={m.id} className="mt-2 space-y-1">
                          <p className="text-xs text-ink-700/70">ارسال دعوت به {m.displayName}</p>
                          <MessengerShare
                            phone={m.phone}
                            debtorName=""
                            creditorName={m.displayName}
                            amountLabel={inviteLink}
                            customText={`دعوت به دوره «${period.title}» در دونگ‌هام:\n${inviteLink}`}
                          />
                        </div>
                      ))
                  : null}
              </div>
              {period.template === 'work' ? (
                <div className="card-surface space-y-2">
                  <h3 className="font-bold">نوبت ناهار</h3>
                  <p className="text-sm">
                    این هفته:{' '}
                    {members.find((m) => m.id === period.lunchTurnMemberId)?.displayName || members.find((m) => !m.isPot)?.displayName || '—'}
                  </p>
                  {!isViewer ? (
                    <button type="button" className="btn-primary w-full" onClick={() => void rotateLunch()}>
                      نوبت بعدی
                    </button>
                  ) : null}
                </div>
              ) : null}
              {period.template === 'building' ? (
                <div className="card-surface space-y-2">
                  <h3 className="font-bold">شارژ ماهانه</h3>
                  <input
                    className="input"
                    type="number"
                    defaultValue={period.buildingCharge || ''}
                    placeholder="مبلغ شارژ هر واحد"
                    onBlur={(e) => void saveBuildingCharge(Number(e.target.value) || 0)}
                    disabled={isViewer}
                  />
                </div>
              ) : null}
              <div className="card-surface space-y-2">
                <h3 className="font-bold">همگام QR آفلاین</h3>
                <p className="text-xs text-ink-700/70">بدون سرور، اسنپ‌شات دوره را با QR یا فایل بین دستگاه‌ها رد و بدل کنید. تیک زیر فقط AES ستون‌های حساس روی سرور را روشن می‌کند. عبارت عبور QR جدا و اختیاری است.</p>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!period.encrypted} onChange={() => void toggleEncrypt()} disabled={isViewer} />
                  رمز AES داده روی سرور
                </label>
                <button type="button" className="btn-ghost w-full" onClick={() => setSnapPrompt(true)}>
                  ساخت QR / فایل دوره
                </button>
                {snapQr ? <img src={snapQr} alt="QR همگام آفلاین" className="mx-auto max-w-full rounded-2xl" width={220} height={220} /> : null}
              </div>
              <div className="card-surface space-y-2">
                <h3 className="font-bold">خروجی</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={async () => {
                      const { exportExcel } = await import('../lib/export');
                      exportExcel(period, expenses, payments, members, { calendarMode });
                    }}
                  >
                    Excel
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={async () => {
                      const { exportPdf } = await import('../lib/export');
                      await exportPdf(period, expenses, payments, members, { calendarMode });
                    }}
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={async () => {
                      const { exportBalanceImage } = await import('../lib/export');
                      await exportBalanceImage(period, expenses, payments, members, { calendarMode });
                    }}
                  >
                    تصویر
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={async () => {
                      const snap = await buildPeriodSnapshot(id);
                      downloadJson(`dongham-period-${period.title}.json`, snap);
                      setToast('فایل JSON ذخیره شد');
                    }}
                  >
                    JSON
                  </button>
                </div>
              </div>
              {!isViewer ? (
                <div className="card-surface space-y-2">
                  <h3 className="font-bold">هزینه تکراری</h3>
                  <p className="text-xs text-ink-700/70">{toPersianDigits(recurring.length, persian)} قانون فعال — اجاره و شارژ روی ماه شمسی است.</p>
                  <select
                    className="input"
                    value={recurringCadence}
                    onChange={(e) => setRecurringCadence(e.target.value as RecurringCadence)}
                  >
                    {CADENCE_OPTIONS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-ghost" onClick={addRecurring}>
                      افزودن نمونه
                    </button>
                    <button type="button" className="btn-primary" onClick={runRecurring}>
                      اجرا
                    </button>
                  </div>
                </div>
              ) : null}
              <button type="button" className="btn-primary w-full" onClick={syncNow}>
                همگام‌سازی اکنون
              </button>
            </div>
          ) : null}
        </div>

        <aside className="hidden md:block">
          <div className="card-surface sticky top-8 space-y-3">
            <h3 className="font-bold">خلاصه تبلت</h3>
            <p className="text-sm text-ink-700/70">اعضا: {toPersianDigits(members.length, persian)}</p>
            <p className="text-sm text-ink-700/70">هزینه‌ها: {toPersianDigits(expenses.length, persian)}</p>
            <p className="text-sm">
              جمع: <Money amount={analytics.total} currency={period.currency} />
            </p>
            {!isViewer ? (
              <Link to={`/periods/${id}/expenses/new`} className="btn-primary w-full">
                ثبت سریع هزینه
              </Link>
            ) : null}
          </div>
        </aside>
      </div>
      <PromptDialog
        open={snapPrompt}
        title="رمز اسنپ‌شات"
        message="خالی بگذارید تا بدون رمز ذخیره شود."
        placeholder="رمز اختیاری"
        inputType="password"
        confirmLabel="ساخت فایل"
        onClose={() => setSnapPrompt(false)}
        onSubmit={(value) => {
          setSnapPrompt(false);
          void exportOfflineSnap(value.trim() || undefined);
        }}
      />
    </Shell>
  );
}
