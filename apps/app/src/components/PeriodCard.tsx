import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CircleCheck, EllipsisVertical, List, Users } from 'lucide-react';
import { ConfirmDialog } from './Dialog';
import { Icon } from './Icon';
import { PeriodStatusBadge } from './PeriodStatusBadge';
import { UnreadDot } from './UnreadDot';
import { Money } from './ui';
import { UserAvatar } from './UserAvatar';
import { periodAnalytics } from '../lib/analytics';
import { memberAvatarSrc } from '../lib/avatarCache';
import { db, type LocalActivity, type LocalChat, type LocalExpense, type LocalMember, type LocalPayment, type LocalPeriod, type LocalProfile } from '../lib/db';
import { copyText, toPersianDigits } from '../lib/format';
import { isSelfMember } from '../lib/memberLabel';
import {
  hasUnreadChat,
  hasUnseenPeriodActivity,
  periodActivityTimestamps,
  periodHasAttention,
} from '../lib/periodAttention';
import { periodCoverSrc } from '../lib/periodCover';
import {
  actorRoleOf,
  canArchivePeriod,
  canCompleteOrDeletePeriod,
  completePeriodLocal,
  periodStatusOf,
  restorePeriodLocal,
  setPeriodArchivedLocal,
  softDeletePeriodLocal,
} from '../lib/periodLifecycle';
import { useUiStore } from '../store/ui';

export function PeriodCard({
  period,
  members,
  expenses = [],
  payments = [],
  chat = [],
  activity = [],
  persianDigits = true,
  avatarByUserId = {},
  profile,
}: {
  period: LocalPeriod;
  members: LocalMember[];
  expenses?: LocalExpense[];
  payments?: LocalPayment[];
  chat?: LocalChat[];
  activity?: LocalActivity[];
  persianDigits?: boolean;
  avatarByUserId?: Record<string, string>;
  profile?: LocalProfile | null;
}) {
  const setToast = useUiStore((s) => s.setToast);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<'complete' | 'delete' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pref = useLiveQuery(() => db.periodPrefs.get(period.id), [period.id]);
  const people = members.filter((m) => !m.isPot);
  const shown = people.slice(0, 4);
  const extra = Math.max(0, people.length - shown.length);
  const coverSrc = periodCoverSrc(period);
  const transactionCount =
    expenses.filter((e) => !e.deletedAt).length + payments.filter((pay) => !pay.deletedAt).length;
  const analytics = useMemo(
    () => periodAnalytics(expenses, payments, members, period.roundTo || 0),
    [expenses, payments, members, period.roundTo],
  );
  const me = members.find((m) => isSelfMember(m, profile));
  const selfMemberIds = members.filter((m) => isSelfMember(m, profile)).map((m) => m.id);
  const unreadChat = hasUnreadChat({
    messages: chat,
    selfMemberIds,
    lastReadAt: pref?.chatLastReadAt,
    muted: Boolean(pref?.chatMutedAt),
  });
  const unseenActivity = hasUnseenPeriodActivity({
    lastSeenAt: pref?.lastSeenAt,
    timestamps: periodActivityTimestamps({
      expenses,
      payments,
      activity,
      completedAt: period.completedAt,
      deletedAt: period.deletedAt,
    }),
  });
  const attention = periodHasAttention(unreadChat, unseenActivity);
  const myBalance = me ? analytics.balances[me.id] ?? 0 : null;
  const settled = myBalance != null && Math.abs(myBalance) <= 0.5;
  const role = actorRoleOf(period, members, profile);
  const status = periodStatusOf(period, {
    archivedAt: pref?.archivedAt,
    expenses,
    payments,
  });
  const canArchive = canArchivePeriod(role) && status !== 'deleted';
  const canManage = canCompleteOrDeletePeriod(role);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setMenu(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const onMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu((v) => !v);
  };

  const run = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      setToast(ok, 'success');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
    }
  };

  return (
    <article className="card-surface relative flex min-w-0 items-stretch gap-2 !p-3 sm:gap-3">
      <div className="flex min-w-0 flex-1 items-stretch gap-1 sm:gap-2">
        <div ref={menuRef} className="relative shrink-0 self-start">
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full text-ink-700/60 duration-150 hover:bg-brand-100 hover:text-ink-900 active:bg-brand-100"
            aria-label="گزینه‌های دوره"
            aria-expanded={menu}
            aria-haspopup="menu"
            onClick={onMenu}
          >
            <Icon icon={EllipsisVertical} size={20} />
          </button>
          {menu ? (
            <div
              role="menu"
              className="absolute start-0 top-full z-10 mt-1 min-w-40 rounded-2xl bg-surface p-1 shadow-soft ring-1 ring-brand-800/20"
            >
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-xl px-3 py-2.5 text-start text-sm hover:bg-brand-50 active:bg-brand-100"
                onClick={() => {
                  void copyText(period.id).then((ok) => setToast(ok ? 'شناسه کپی شد' : 'کپی نشد', ok ? 'success' : 'error'));
                  setMenu(false);
                }}
              >
                کپی شناسه دوره
              </button>
              {canArchive ? (
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-xl px-3 py-2.5 text-start text-sm hover:bg-brand-50 active:bg-brand-100"
                  onClick={() => {
                    setMenu(false);
                    void run(
                      () => setPeriodArchivedLocal(period.id, status !== 'archived'),
                      status === 'archived' ? 'از آرشیو خارج شد' : 'آرشیو شد',
                    );
                  }}
                >
                  {status === 'archived' ? 'خروج از آرشیو' : 'آرشیو'}
                </button>
              ) : null}
              {canManage && status !== 'deleted' && status !== 'completed' ? (
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-xl px-3 py-2.5 text-start text-sm hover:bg-brand-50 active:bg-brand-100"
                  onClick={() => {
                    setMenu(false);
                    setConfirm('complete');
                  }}
                >
                  اتمام دوره
                </button>
              ) : null}
              {canManage && status === 'deleted' ? (
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-xl px-3 py-2.5 text-start text-sm hover:bg-brand-50 active:bg-brand-100"
                  onClick={() => {
                    setMenu(false);
                    void run(() => restorePeriodLocal(period, profile), 'دوره بازیابی شد');
                  }}
                >
                  بازیابی دوره
                </button>
              ) : null}
              {canManage && status !== 'deleted' ? (
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-xl px-3 py-2.5 text-start text-sm text-danger hover:bg-danger-muted active:bg-danger-muted"
                  onClick={() => {
                    setMenu(false);
                    setConfirm('delete');
                  }}
                >
                  حذف دوره
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <Link to={`/periods/${period.id}`} className="flex min-w-0 flex-1 flex-col gap-2 py-1 sm:flex-row sm:items-stretch">
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2">
              <span className="truncate text-base font-extrabold text-ink-900">{period.title}</span>
              {attention ? <UnreadDot /> : null}
              {attention ? <span className="sr-only">خوانده‌نشده</span> : null}
            </p>
            <p className="mt-1">
              <PeriodStatusBadge status={status} />
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-700/70">
              <span className="inline-flex items-center gap-1">
                <Icon icon={Users} size={14} />
                {toPersianDigits(people.length, persianDigits)} عضو
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon icon={List} size={14} />
                {toPersianDigits(transactionCount, persianDigits)} تراکنش
              </span>
            </p>
            <div className="mt-3 flex items-center">
              {shown.map((m, i) => (
                <UserAvatar
                  key={m.id}
                  name={m.displayName}
                  src={memberAvatarSrc(m, profile, avatarByUserId)}
                  size="sm"
                  className={`ring-2 ring-surface ${i === 0 ? '' : '-ms-2'}`}
                  title={m.displayName}
                />
              ))}
              {extra > 0 ? (
                <span className="ms-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-[10px] font-bold text-on-brand ring-2 ring-surface">
                  +{toPersianDigits(extra, persianDigits)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:max-w-[11rem] sm:flex-col sm:items-end sm:justify-center">
            <span className="inline-flex max-w-full flex-wrap items-center justify-end gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-ink-900">
              جمع
              <Money amount={analytics.total} currency={period.currency} />
            </span>
            {myBalance == null ? null : settled ? (
              <span className="inline-flex max-w-full flex-wrap items-center justify-end gap-1 rounded-full bg-success-muted px-2.5 py-1 text-[11px] font-bold text-success">
                <Icon icon={CircleCheck} size={14} strokeWidth={2.4} />
                تسویه
              </span>
            ) : myBalance > 0 ? (
              <span className="inline-flex max-w-full flex-wrap items-center justify-end gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-[11px] font-bold text-brand-800">
                طلب شما
                <Money amount={myBalance} currency={period.currency} />
              </span>
            ) : (
              <span className="inline-flex max-w-full flex-wrap items-center justify-end gap-1 rounded-full bg-danger-muted px-2.5 py-1 text-[11px] font-bold text-danger">
                بدهی شما
                <Money amount={Math.abs(myBalance)} currency={period.currency} />
              </span>
            )}
          </div>
        </Link>
      </div>
      <Link
        to={`/periods/${period.id}`}
        className="relative size-[4.75rem] shrink-0 self-start overflow-hidden rounded-2xl sm:size-[6.75rem]"
      >
        <img src={coverSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
      </Link>
      <ConfirmDialog
        open={confirm === 'complete'}
        title="اتمام دوره"
        message="همهٔ اعضا از اتمام دوره مطلع می‌شوند. فقط مالک یا مدیر با ثبت هزینهٔ جدید می‌تواند دوره را دوباره فعال کند."
        confirmLabel="اتمام"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void run(() => completePeriodLocal(period, profile), 'دوره به اتمام رسید');
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="حذف دوره"
        message="دوره برای همهٔ اعضا حذف می‌شود. این حذف نرم است و مالک یا مدیر می‌تواند آن را بازیابی کند."
        confirmLabel="حذف"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void run(() => softDeletePeriodLocal(period, profile), 'دوره حذف شد');
        }}
      />
    </article>
  );
}
