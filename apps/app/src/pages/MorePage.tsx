import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { CardPayoutPanel } from '../components/CardPayoutPanel';
import { FxRatesPanel } from '../components/FxRatesPanel';
import { ConfirmDialog, PromptDialog } from '../components/Dialog';
import { SyncBanner } from '../components/SyncBanner';
import { Shell } from '../components/ui';
import { updateProfile } from '../lib/api';
import {
  buyPremiumBazaar,
  buyPremiumMyket,
  buyPremiumWeb,
  isPremium,
  verifyZarinpalReturn,
} from '../lib/billing';
import { downloadJson, exportBackup, importBackup } from '../lib/backup';
import { db } from '../lib/db';
import { toPersianDigits } from '../lib/format';
import { importPeriodSnapshot, parseSnapshot } from '../lib/snapshot';
import { flushOutbox, pullCloud } from '../lib/sync';
import { useUiStore } from '../store/ui';

const SUPPORT_TG = import.meta.env.VITE_SUPPORT_TELEGRAM || 'https://t.me/dongham';
const SUPPORT_BALE = import.meta.env.VITE_SUPPORT_BALE || 'https://ble.ir/dongham';
const SUPPORT_WA = import.meta.env.VITE_SUPPORT_WHATSAPP || 'https://wa.me/';

export function MorePage() {
  const navigate = useNavigate();
  const setToast = useUiStore((s) => s.setToast);
  const [params, setParams] = useSearchParams();
  const profile = useLiveQuery(() => db.profile.get('self'));
  const notifications = useLiveQuery(() => db.notifications.orderBy('createdAt').reverse().limit(20).toArray(), []) || [];
  const outboxCount = useLiveQuery(() => db.outbox.count(), []) || 0;
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [importRaw, setImportRaw] = useState('');
  const [importPass, setImportPass] = useState<string | undefined>();
  const [importPassOpen, setImportPassOpen] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);

  useEffect(() => {
    const authority = params.get('Authority') || params.get('authority');
    const status = params.get('Status') || params.get('status');
    if (!authority || !status) return;
    void (async () => {
      const res = await verifyZarinpalReturn(authority, status);
      setToast(res.ok ? 'اشتراک وب فعال شد' : res.error || 'پرداخت تأیید نشد');
      setParams({}, { replace: true });
    })();
  }, [params, setParams, setToast]);

  useEffect(() => {
    if (window.location.hash === '#fx') {
      document.getElementById('fx')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const saveName = async (displayName: string) => {
    await updateProfile({ displayName });
    setToast('ذخیره شد');
  };

  const toggleDigits = async () => {
    await updateProfile({ usePersianDigits: !profile?.usePersianDigits });
  };

  const testNotif = async () => {
    const n = {
      id: crypto.randomUUID(),
      title: 'دونگ‌هام',
      body: 'نوتیفیکیشن آزمایشی',
      read: false,
      createdAt: new Date().toISOString(),
    };
    await db.notifications.put(n);
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.requestPermissions();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Date.now() % 100000,
            title: n.title,
            body: n.body,
            schedule: { at: new Date(Date.now() + 1000) },
          },
        ],
      });
    } else if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') new Notification(n.title, { body: n.body });
    }
    setToast('نوتیفیکیشن ثبت شد');
  };

  const wipeLocal = async () => {
    await db.delete();
    location.reload();
  };

  const doBackup = async () => {
    const data = await exportBackup();
    downloadJson(`dongham-backup-${new Date().toISOString().slice(0, 10)}.json`, data);
    setToast('پشتیبان ذخیره شد');
  };

  const doRestore = async (file: File) => {
    const text = await file.text();
    const json = JSON.parse(text);
    await importBackup(json);
    setToast('بازیابی شد');
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
    setToast('دوره وارد شد');
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
      setToast(e instanceof Error ? e.message : 'ورود اسنپ‌شات ناموفق');
    }
  };

  return (
    <Shell title="بیشتر">
      <div className="mx-auto max-w-lg space-y-4 animate-rise">
        <SyncBanner />
        <div className="card-surface space-y-3">
          <h2 className="section-title">پروفایل محلی</h2>
          <input
            className="input"
            defaultValue={profile?.displayName}
            onBlur={(e) => saveName(e.target.value)}
            aria-label="نام نمایشی"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!profile?.usePersianDigits} onChange={toggleDigits} />
            اعداد فارسی
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={profile?.debtReminders !== false}
              onChange={() => updateProfile({ debtReminders: profile?.debtReminders === false })}
            />
            یادآوری بدهی
          </label>
        </div>

        <FxRatesPanel />

        <CardPayoutPanel />

        <div className="card-surface space-y-2">
          <h2 className="font-bold">اشتراک</h2>
          <p className="text-xs text-ink-700/70">
            {isPremium(profile) ? 'نسخه پرمیوم فعال است — بدون تبلیغ.' : 'نسخه رایگان. وب‌اپ با زرین‌پال؛ اندروید با بازار یا مایکت.'}
          </p>
          {!isPremium(profile) ? (
            <>
              <button type="button" className="btn-primary w-full" onClick={async () => setToast((await buyPremiumWeb('premium_monthly')).error || 'در حال انتقال به درگاه…')}>
                اشتراک ماهانه وب (زرین‌پال)
              </button>
              <button type="button" className="btn-ghost w-full" onClick={async () => setToast((await buyPremiumWeb('premium_yearly')).error || 'در حال انتقال به درگاه…')}>
                اشتراک سالانه وب
              </button>
              {Capacitor.isNativePlatform() ? (
                <>
                  <button type="button" className="btn-ghost w-full" onClick={async () => setToast((await buyPremiumBazaar()).ok ? 'فعال شد' : 'خطا')}>
                    خرید از بازار
                  </button>
                  <button type="button" className="btn-ghost w-full" onClick={async () => setToast((await buyPremiumMyket()).ok ? 'فعال شد' : 'خطا')}>
                    خرید از مایکت
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="card-surface space-y-2">
          <h2 className="font-bold">پشتیبانی</h2>
          <a className="btn-ghost w-full" href={SUPPORT_WA} target="_blank" rel="noreferrer">
            واتساپ پشتیبانی
          </a>
          <a className="btn-ghost w-full" href={SUPPORT_TG} target="_blank" rel="noreferrer">
            تلگرام پشتیبانی
          </a>
          <a className="btn-ghost w-full" href={SUPPORT_BALE} target="_blank" rel="noreferrer">
            بله پشتیبانی
          </a>
        </div>

        <div className="card-surface space-y-2">
          <h2 className="font-bold">همگام‌سازی</h2>
          <p className="text-xs text-ink-700/70">
            {profile?.token
              ? `${toPersianDigits(outboxCount, profile?.usePersianDigits ?? true)} عملیات در صف`
              : 'حالت مهمان — برای همگام‌سازی ابری وارد شوید'}
          </p>
          <button
            type="button"
            className="btn-primary w-full"
            onClick={async () => {
              if (!profile?.token) {
                navigate('/auth?next=/more');
                return;
              }
              const res = await flushOutbox();
              if (!res.ok) {
                setToast(res.error === 'وارد نشده‌اید' ? 'نشست منقضی شده؛ دوباره وارد شوید' : res.error || 'خطا');
                return;
              }
              const pulled = await pullCloud();
              if (!pulled.ok) {
                setToast(pulled.error === 'وارد نشده‌اید' ? 'نشست منقضی شده؛ دوباره وارد شوید' : pulled.error || 'خطا');
                return;
              }
              setToast('همگام شد');
            }}
          >
            همگام‌سازی همه دوره‌ها
          </button>
          <Link to="/auth" className="btn-ghost w-full">
            {profile?.token ? 'حساب کاربری' : 'ورود / ارتقا مهمان'}
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
              <li key={n.id} className="rounded-2xl bg-brand-50 px-3 py-2">
                <p className="font-semibold">{n.title}</p>
                <p className="text-ink-700/70">{n.body}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="card-surface space-y-2">
          <h2 className="font-bold">حریم خصوصی</h2>
          <p className="text-xs text-ink-700/70">
            کارت و شبا روی دستگاه با AES-GCM رمز می‌شود. اسنپ‌شات خروجی فقط در صورت وارد کردن عبارت عبور رمز می‌شود. می‌توانید داده دستگاه را پاک کنید یا حساب ابری را حذف کنید.
          </p>
          <button type="button" className="btn-ghost w-full text-rose-700" onClick={() => setConfirmWipe(true)}>
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
            setToast(e instanceof Error ? e.message : 'ورود اسنپ‌شات ناموفق');
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
            setToast(e instanceof Error ? e.message : 'ورود اسنپ‌شات ناموفق');
          });
        }}
      />
    </Shell>
  );
}
