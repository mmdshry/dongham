import { nanoid } from 'nanoid';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../components/ui';
import { api, ensureProfile } from '../lib/api';
import { currencyLabel } from '../lib/currencies';
import { db } from '../lib/db';
import { isInviteExpired } from '@dongham/ledger';
import { needsDisplayName, normalizeDisplayName } from '../lib/memberLabel';
import { applyPeriodSnapshot, type PeriodSnapshot } from '../lib/sync';
import { useUiStore } from '../store/ui';

export function InvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const setToast = useUiStore((s) => s.setToast);
  const [info, setInfo] = useState<{
    period?: { id: string; title: string; currency: string };
    members?: { displayName: string }[];
  } | null>(null);
  const [localOnly, setLocalOnly] = useState(false);

  useEffect(() => {
    (async () => {
      const fromDexie = async () => {
        const local = await db.invites.get(token);
        if (local && isInviteExpired(local)) {
          setInfo(null);
          return;
        }
        if (!local) {
          setInfo(null);
          return;
        }
        const period = await db.periods.get(local.periodId);
        const members = await db.members.where('periodId').equals(local.periodId).toArray();
        setInfo({ period: period || undefined, members });
        setLocalOnly(true);
      };
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await fromDexie();
        return;
      }
      try {
        const res = await api<{
          period: { id: string; title: string; currency: string };
          members: { displayName: string }[];
        }>(`/invites/${token}`);
        setInfo(res);
        setLocalOnly(false);
      } catch {
        await fromDexie();
      }
    })();
  }, [token]);

  const join = async () => {
    const profile = await ensureProfile();
    const displayName = normalizeDisplayName(profile.displayName);
    if (needsDisplayName(displayName)) {
      setToast('نام لازم است', 'error');
      return;
    }
    if (localOnly && info?.period) {
      const already = (await db.members.where('periodId').equals(info.period.id).toArray()).find(
        (m) => m.guestKey === profile.guestKey || (profile.userId && m.userId === profile.userId),
      );
      if (!already) {
        await db.members.put({
          id: nanoid(),
          periodId: info.period.id,
          displayName,
          guestKey: profile.guestKey,
          userId: profile.userId,
          weightDefault: 1,
          role: 'member',
        });
      }
      setToast('به دوره محلی پیوستید', 'success');
      navigate(`/periods/${info.period.id}`);
      return;
    }
    if (!profile.token) {
      setToast('برای پیوستن از گوشی دیگر ابتدا وارد شوید', 'warn');
      navigate(`/auth?next=/i/${token}`);
      return;
    }
    try {
      const res = await api<{ memberId: string; periodId: string }>(`/invites/${token}/join`, {
        method: 'POST',
        body: JSON.stringify({
          displayName,
          guestKey: profile.guestKey,
        }),
      });
      const snap = await api<PeriodSnapshot>(`/periods/${res.periodId}/snapshot`);
      await applyPeriodSnapshot(snap);
      setToast('به دوره پیوستید', 'success');
      navigate(`/periods/${res.periodId}`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا در پیوستن', 'error');
    }
  };

  return (
    <Shell title="دعوت به دوره">
      <div className="mx-auto max-w-lg card-surface animate-rise space-y-4">
        {!info?.period ? (
          <p>دعوت نامعتبر یا منقضی است.</p>
        ) : (
          <>
            <div>
              <p className="text-xs text-brand-700">دونگ‌هام</p>
              <h2 className="text-2xl font-extrabold">{info.period.title}</h2>
              <p className="mt-1 text-sm text-ink-700/70">ارز: {currencyLabel(info.period.currency)}</p>
              <p className="mt-2 text-sm">اعضا: {(info.members || []).map((m) => m.displayName).join('، ')}</p>
            </div>
            <button type="button" className="btn-primary w-full" onClick={() => void join()}>
              پیوستن و شروع ثبت هزینه
            </button>
          </>
        )}
      </div>
    </Shell>
  );
}
