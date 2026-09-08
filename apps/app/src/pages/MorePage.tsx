import { useLiveQuery } from 'dexie-react-hooks';
import { nanoid } from 'nanoid';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CardPayoutPanel } from '../components/CardPayoutPanel';
import { FxRatesPanel } from '../components/FxRatesPanel';
import { ConfirmDialog, PromptDialog } from '../components/Dialog';
import { SyncBanner } from '../components/SyncBanner';
import { ThemeToggle } from '../components/ThemeToggle';
import { ConnectionModeBadge } from '../components/ConnectionModeBadge';
import { Shell } from '../components/ui';
import { updateAccountPrefs } from '../lib/cloudProfile';
import { isAutoSyncOn } from '../lib/connectionMode';
import { useCalendarMode } from '../lib/calendarPref';
import {
  buyPremiumWeb,
  fetchPremiumPlans,
  isPremium,
  verifyZarinpalReturn,
  type PremiumPlan,
} from '../lib/billing';
import { downloadJson, exportBackup, importBackup } from '../lib/backup';
import { api } from '../lib/api';
import { db } from '../lib/db';
import { formatMoney, toPersianDigits } from '../lib/format';
import { DISPLAY_NAME_MAX, needsDisplayName, normalizeDisplayName } from '../lib/memberLabel';
import { importPeriodSnapshot, parseSnapshot } from '../lib/snapshot';
import { flushOutbox, markNotificationRead, pullCloud } from '../lib/sync';
import { useUiStore } from '../store/ui';
import {
  disableWebPush,
  enableWebPush,
  isPushSupported,
  isWebPushEnabled,
  pushEnableError,
} from '../lib/webPush';

const SUPPORT_BALE = import.meta.env.VITE_SUPPORT_BALE || 'https://ble.ir/dongham';
const SUPPORT_WA = import.meta.env.VITE_SUPPORT_WHATSAPP || '';

export function MorePage() {
  const navigate = useNavigate();
  const setToast = useUiStore((s) => s.setToast);
  const online = useUiStore((s) => s.online);
  const [params, setParams] = useSearchParams();
  const profile = useLiveQuery(() => db.profile.get('self'));
  const calendarMode = useCalendarMode();
  const notifications = useLiveQuery(() => db.notifications.orderBy('createdAt').reverse().limit(20).toArray(), []) || [];
  const outboxCount = useLiveQuery(() => db.outbox.count(), []) || 0;
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [importRaw, setImportRaw] = useState('');
  const [importPass, setImportPass] = useState<string | undefined>();
  const [importPassOpen, setImportPassOpen] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const pushSupported = isPushSupported();
  const [nameDraft, setNameDraft] = useState('');
  const [plans, setPlans] = useState<PremiumPlan[]>([]);
  const persian = profile?.usePersianDigits !== false;
  const planLabel = (sku: string, fallback: string) => {
    const plan = plans.find((p) => p.sku === sku);
    return plan ? `${fallback} — ${formatMoney(plan.toman, 'IRT', persian)}` : fallback;
  };

  useEffect(() => {
    if (!online || isPremium(profile)) return;
    void fetchPremiumPlans().then(setPlans);
  }, [online, profile]);

  useEffect(() => {
    const authority = params.get('Authority') || params.get('authority');
    const status = params.get('Status') || params.get('status');
    if (!authority || !status) return;
    void (async () => {
      const res = await verifyZarinpalReturn(authority, status);
      setToast(res.ok ? 'اشتراک وب فعال شد' : res.error || 'پرداخت تأیید نشد', res.ok ? 'success' : 'error');
      setParams({}, { replace: true });
    })();
  }, [params, setParams, setToast]);

  useEffect(() => {
    setNameDraft(profile?.displayName || '');
  }, [profile?.displayName]);

  useEffect(() => {
    void isWebPushEnabled().then(setPushOn);
  }, [profile?.token]);

  useEffect(() => {
    const id = window.location.hash === '#theme' ? 'theme' : window.location.hash === '#fx' ? 'fx' : '';
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const saveName = async (displayName: string) => {
    const name = normalizeDisplayName(displayName);
    if (needsDisplayName(name)) {
      setNameDraft(profile?.displayName || '');
      setToast('نام لازم است', 'error');
      return;
    }
    await updateAccountPrefs({ displayName: name });
    setToast('ذخیره شد', 'success');
  };

  const toggleDigits = async () => {
    await updateAccountPrefs({ usePersianDigits: !profile?.usePersianDigits });
  };

  const toggleAutoSync = async () => {
    if (!profile?.token) {
      navigate('/auth?next=/more');
      return;
    }
    const next = !isAutoSyncOn(profile);
    await updateAccountPrefs({ autoSync: next });
    if (next && online) {
      const res = await flushOutbox();
      if (res.ok) await pullCloud();
      setToast(res.ok ? 'همگام‌سازی خودکار روشن شد' : res.error || 'خطا', res.ok ? 'success' : 'error');
      return;
    }
    setToast(next ? 'همگام‌سازی خودکار روشن شد' : 'همگام‌سازی خودکار خاموش شد', 'info');
  };

  const togglePush = async () => {
    if (!profile?.token) {
      navigate('/auth?next=/more');
      return;
    }
    if (pushOn) {
      await disableWebPush();
      setPushOn(false);
      setToast('اعلان‌های مرورگر خاموش شد', 'info');
      return;
    }
    try {
      await enableWebPush();
      setPushOn(true);
      setToast('اعلان‌های مرورگر روشن شد', 'success');
    } catch (e) {
      setPushOn(false);
      setToast(pushEnableError(e), 'error');
    }
  };

  const testNotif = async () => {
    if (profile?.token && Notification.permission === 'granted') {
      try {
        await api('/push/test', { method: 'POST' });
        await pullCloud();
        setToast('نوتیفیکیشن ثبت شد', 'success');
        return;
      } catch {
        /* fall through to local */
      }
    }
    const n = {
      id: nanoid(),
      title: 'دونگ‌هام',
      body: 'نوتیفیکیشن آزمایشی',
      read: false,
      createdAt: new Date().toISOString(),
    };
    await db.notifications.put(n);
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') new Notification(n.title, { body: n.body });
    }
        setToast('نوتیفیکیشن ثبت شد', 'success');
  };

  const wipeLocal = async () => {
    await db.delete();
    location.reload();
  };

  const doBackup = async () => {
    const data = await exportBackup();
    downloadJson(`dongham-backup-${new Date().toISOString().slice(0, 10)}.json`, data);
    setToast('پشتیبان ذخیره شد', 'success');
  };

  const doRestore = async (file: File) => {
    const text = await file.text();
    const json = JSON.parse(text);
    await importBackup(json);
    setToast('بازیابی شد', 'success');
  };

  const finishImport = async (raw: string, passphrase?: string, allowOverwrite = false) => {
    const snap = await parseSnapshot(raw, passphrase);
    const exists = await db.periods.get(snap.period.id);
    if (exists && !allowOverwrite) {
      setImportRaw(raw);
      setImportPass(passphrase);
      setOverwriteOpen(true);
      return;
    }
    const id = await importPeriodSnapshot(snap);
    setToast('دوره وارد شد', 'success');
    window.location.href = `/periods/${id}`;
  };

  const importSnap = async (file: File) => {
    try {
      const raw = await file.text();
      if (raw.trim().startsWith('DH1:')) {
        setImportRaw(raw);
        setImportPassOpen(true);
        return;
      }
      await finishImport(raw);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'ورود اسنپ‌شات ناموفق', 'error');
    }
  };

  return (
    <Shell title="بیشتر" back={() => navigate('/profile')}>
      <div className="mx-auto max-w-lg space-y-4 animate-rise">
        <SyncBanner />
        <div className="card-surface space-y-3">
          <h2 className="section-title">پروفایل</h2>
          <label className="label" htmlFor="more-display-name">نام نمایشی</label>
          <input
            id="more-display-name"
            className="input"
            value={nameDraft}
            maxLength={DISPLAY_NAME_MAX}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={(e) => saveName(e.target.value)}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={!!profile?.usePersianDigits} onChange={toggleDigits} />
            اعداد فارسی
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={profile?.debtReminders !== false}
              onChange={() => updateAccountPrefs({ debtReminders: profile?.debtReminders === false })}
            />
            یادآوری بدهی
          </label>
          {pushSupported ? (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={pushOn} onChange={() => void togglePush()} />
              اعلان‌های مرورگر
            </label>
          ) : null}
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={calendarMode === 'gregorian'}
              onChange={() =>
                updateAccountPrefs({ calendarMode: calendarMode === 'gregorian' ? 'jalali' : 'gregorian' })
              }
            />
            تقویم میلادی (به‌جای شمسی)
          </label>
          <div id="theme">
            <ThemeToggle />
          </div>
        </div>

        <FxRatesPanel />

        <CardPayoutPanel />

        <div className="card-surface space-y-2">
          <h2 className="font-bold">اشتراک پریمیوم</h2>
          <p className="text-xs text-ink-700/70">
            {isPremium(profile)
              ? 'اشتراک پریمیوم فعال است.'
              : 'نسخه رایگان. پرداخت با درگاه زرین‌پال؛ مبالغ به تومان است (درگاه همان مبلغ را به ریال نشان می‌دهد).'}
          </p>
          {!isPremium(profile) ? (
            <>
              <button
                type="button"
                className="btn-primary w-full"
                onClick={async () => {
                  const res = await buyPremiumWeb('premium_monthly');
                  setToast(res.error || 'در حال انتقال به درگاه…', res.error ? 'error' : 'info');
                }}
              >
                {planLabel('premium_monthly', 'اشتراک ماهانه')}
              </button>
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={async () => {
                  const res = await buyPremiumWeb('premium_yearly');
                  setToast(res.error || 'در حال انتقال به درگاه…', res.error ? 'error' : 'info');
                }}
              >
                {planLabel('premium_yearly', 'اشتراک سالانه')}
              </button>
            </>
          ) : null}
        </div>

        <div className="card-surface space-y-2">
          <h2 className="font-bold">پشتیبانی</h2>
          {SUPPORT_WA && SUPPORT_WA !== 'https://wa.me/' ? (
            <a className="btn-ghost w-full" href={SUPPORT_WA} target="_blank" rel="noreferrer">
              واتساپ پشتیبانی
            </a>
          ) : null}
          <a className="btn-ghost w-full" href={SUPPORT_BALE} target="_blank" rel="noreferrer">
            بله پشتیبانی
          </a>
        </div>

        <div className="card-surface space-y-2">
          <h2 className="font-bold">همگام‌سازی</h2>
          <ConnectionModeBadge />
          <p className="text-xs text-ink-700/70">
            {profile?.token
              ? `${toPersianDigits(outboxCount, profile?.usePersianDigits ?? true)} عملیات در صف`
              : 'برای همگام‌سازی ابری وارد شوید'}
          </p>
          <label className={`flex min-h-11 items-center gap-2 text-sm ${profile?.token ? '' : 'opacity-60'}`}>
            <input
              type="checkbox"
              checked={Boolean(profile?.token) && isAutoSyncOn(profile)}
              disabled={!profile?.token}
              onChange={() => void toggleAutoSync()}
            />
            همگام‌سازی خودکار
          </label>
          {!profile?.token ? (
            <p className="text-xs text-ink-700/60">پس از ورود فعال می‌شود</p>
          ) : (
            <p className="text-xs text-ink-700/60">
              {isAutoSyncOn(profile)
                ? 'در حالت ابری تغییرات بدون پرسش با سرور همگام می‌شود.'
                : 'تغییرات در صف می‌ماند تا همگام‌سازی را بزنید.'}
            </p>
          )}
          <button
            type="button"
            className="btn-primary w-full"
            onClick={async () => {
              if (!profile?.token) {
                navigate('/auth?next=/more');
                return;
              }
              // api() already maps a rejected token to SESSION_EXPIRED_MESSAGE and clears it.
              const res = await flushOutbox();
              if (!res.ok) {
                setToast(res.error || 'خطا', 'error');
                return;
              }
              const pulled = await pullCloud();
              if (!pulled.ok) {
                setToast(pulled.error || 'خطا', 'error');
                return;
              }
              setToast('همگام شد', 'success');
            }}
          >
            همگام‌سازی همه دوره‌ها
          </button>
          <Link to="/auth" className="btn-ghost w-full">
            {profile?.token ? 'حساب کاربری' : 'ورود / ثبت‌نام'}
          </Link>
        </div>

        <div className="card-surface space-y-2">
          <h2 className="font-bold">پشتیبان و QR آفلاین</h2>
          <button type="button" className="btn-ghost w-full" onClick={() => void doBackup()}>
            خروجی JSON
          </button>
          <label className="btn-ghost w-full cursor-pointer text-center">
            بازیابی از فایل
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void doRestore(e.target.files[0])}
            />
          </label>
          <label className="btn-ghost w-full cursor-pointer text-center">
            ورود اسنپ‌شات دوره (QR/فایل)
            <input
              type="file"
              accept="application/json,text/plain"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void importSnap(e.target.files[0])}
            />
          </label>
        </div>

        <div className="card-surface space-y-2">
          <h2 className="font-bold">اعلان‌ها</h2>
          <button type="button" className="btn-ghost w-full" onClick={() => void testNotif()}>
            تست نوتیفیکیشن
          </button>
          <ul className="space-y-2 text-sm">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={`w-full rounded-2xl px-3 py-2 text-right ${n.read ? 'bg-brand-50' : 'bg-brand-100 ring-1 ring-brand-200'}`}
                  onClick={() => void markNotificationRead(n.id)}
                >
                  <p className="font-semibold">{n.title}</p>
                  <p className="text-ink-700/70">{n.body}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card-surface space-y-2">
          <h2 className="font-bold">حریم خصوصی</h2>
          <p className="text-xs text-ink-700/70">
            کارت و شبا روی این دستگاه با AES-GCM رمز می‌شود. پس از ورود، نسخهٔ خوانا برای همگام‌سازی ابری به سرور فرستاده می‌شود. اسنپ‌شات خروجی فقط در صورت وارد کردن عبارت عبور رمز می‌شود. اگر «رمز دوره» روشن باشد، سرور یادداشت، رسید، چت و کارت/شبا را در ستون‌های حساس با AES-256-GCM نگه می‌دارد. می‌توانید داده دستگاه را پاک کنید یا حساب ابری را حذف کنید.
          </p>
          <button type="button" className="btn-ghost w-full text-danger" onClick={() => setConfirmWipe(true)}>
            پاک‌سازی داده محلی
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmWipe}
        title="پاک‌سازی داده محلی"
        message="همه دوره‌ها، هزینه‌ها و تنظیمات این دستگاه حذف می‌شوند. این کار برگشت‌پذیر نیست."
        confirmLabel="پاک کردن"
        danger
        onClose={() => setConfirmWipe(false)}
        onConfirm={() => {
          setConfirmWipe(false);
          void wipeLocal();
        }}
      />
      <PromptDialog
        open={importPassOpen}
        title="رمز اسنپ‌شات"
        message="این فایل رمز دارد."
        placeholder="رمز دوره"
        inputType="password"
        confirmLabel="ورود"
        onClose={() => {
          setImportPassOpen(false);
          setImportRaw('');
        }}
        onSubmit={(value) => {
          setImportPassOpen(false);
          void finishImport(importRaw, value).catch((e) => {
            setToast(e instanceof Error ? e.message : 'ورود اسنپ‌شات ناموفق', 'error');
          });
        }}
      />
      <ConfirmDialog
        open={overwriteOpen}
        title="بازنویسی دوره"
        message="دوره‌ای با همین شناسه هست. بازنویسی شود؟"
        confirmLabel="بازنویسی"
        danger
        onClose={() => {
          setOverwriteOpen(false);
          setImportRaw('');
        }}
        onConfirm={() => {
          setOverwriteOpen(false);
          void finishImport(importRaw, importPass, true).catch((e) => {
            setToast(e instanceof Error ? e.message : 'ورود اسنپ‌شات ناموفق', 'error');
          });
        }}
      />
    </Shell>
  );
}
