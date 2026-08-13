import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { detectBank } from '@dongham/ledger';
import { FxRatesPanel } from '../components/FxRatesPanel';
import { ConfirmDialog } from '../components/Dialog';
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
import { decryptMaybe } from '../lib/crypto';
import { db } from '../lib/db';
import { formatCardGrouped, formatShebaGrouped, toPersianDigits } from '../lib/format';
import { listPayouts, removePayoutMethod, savePayoutMethod } from '../lib/payout';
import { importPeriodSnapshot, parseSnapshot } from '../lib/snapshot';
import { flushOutbox } from '../lib/sync';
import { useUiStore } from '../store/ui';

const SUPPORT_TG = import.meta.env.VITE_SUPPORT_TELEGRAM || 'https://t.me/dongham';
const SUPPORT_BALE = import.meta.env.VITE_SUPPORT_BALE || 'https://ble.ir/dongham';
const SUPPORT_WA = import.meta.env.VITE_SUPPORT_WHATSAPP || 'https://wa.me/';

export function MorePage() {
  const setToast = useUiStore((s) => s.setToast);
  const [params, setParams] = useSearchParams();
  const profile = useLiveQuery(() => db.profile.get('self'));
  const notifications = useLiveQuery(() => db.notifications.orderBy('createdAt').reverse().limit(20).toArray(), []) || [];
  const outboxCount = useLiveQuery(() => db.outbox.count(), []) || 0;
  const [payouts, setPayouts] = useState<Awaited<ReturnType<typeof listPayouts>>>([]);
  const [card, setCard] = useState('');
  const [sheba, setSheba] = useState('');
  const [holder, setHolder] = useState('');
  const [bankHint, setBankHint] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);

  useEffect(() => {
    void listPayouts(profile).then(setPayouts);
  }, [profile]);

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

  useEffect(() => {
    const detected = detectBank(card, sheba);
    setBankHint(detected?.name || '');
  }, [card, sheba]);

  const saveName = async (displayName: string) => {
    await updateProfile({ displayName });
    setToast('ذخیره شد');
  };

  const toggleDigits = async () => {
    await updateProfile({ usePersianDigits: !profile?.usePersianDigits });
  };

  const addPayout = async () => {
    const res = await savePayoutMethod({
      card,
      sheba,
      holder: holder || profile?.cardHolderName,
      bank: bankHint,
      isDefault: payouts.length === 0,
    });
    setToast(res.ok ? 'کارت ذخیره شد' : res.error || 'خطا');
    if (res.ok) {
      setCard('');
      setSheba('');
      setPayouts(await listPayouts());
    }
  };

  const revealCard = async () => {
    const def = payouts.find((p) => p.isDefault) || payouts[0];
    if (def) {
      setToast(
        [def.card && `کارت: ${formatCardGrouped(def.card)}`, def.sheba && `شبا: ${formatShebaGrouped(def.sheba)}`]
          .filter(Boolean)
          .join(' · ') || 'چیزی ذخیره نشده',
      );
      return;
    }
    const c = await decryptMaybe(profile?.cardNumber);
    const s = await decryptMaybe(profile?.sheba);
    setToast([c && `کارت: ${c}`, s && `شبا: ${s}`].filter(Boolean).join(' · ') || 'چیزی ذخیره نشده');
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

  const importSnap = async (file: File) => {
    try {
      const raw = await file.text();
      const snap = await parseSnapshot(raw);
      const id = await importPeriodSnapshot(snap);
      setToast(`دوره وارد شد`);
      window.location.href = `/periods/${id}`;
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'ورود اسنپ‌شات ناموفق');
    }
  };

  return (
    <Shell title="بیشتر">
      <div className="mx-auto max-w-lg space-y-4 animate-rise">
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

        <div className="card-surface space-y-3">
          <h2 className="font-bold">کارت و شبا</h2>
          <p className="text-xs text-ink-700/70">چند کارت ذخیره کنید؛ بانک از شماره کارت/شبا تشخیص داده می‌شود.</p>
          {payouts.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-2xl bg-brand-50 px-3 py-2 text-sm">
              <span>
                {p.bank || 'کارت'} {p.isDefault ? '· پیش‌فرض' : ''}
                <span className="mt-1 block text-xs text-ink-700/60" dir="ltr">
                  {p.card ? formatCardGrouped(p.card) : p.sheba ? formatShebaGrouped(p.sheba) : ''}
                </span>
              </span>
              <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => void removePayoutMethod(p.id).then(() => listPayouts().then(setPayouts))}>
                حذف
              </button>
            </div>
          ))}
          <input className="input" placeholder="شماره کارت ۱۶ رقمی" dir="ltr" value={card} onChange={(e) => setCard(e.target.value)} />
          <input className="input" placeholder="شبا IR..." dir="ltr" value={sheba} onChange={(e) => setSheba(e.target.value)} />
          <input className="input" placeholder="نام صاحب حساب" value={holder} onChange={(e) => setHolder(e.target.value)} />
          {bankHint ? <p className="text-xs text-brand-800">بانک تشخیص‌داده‌شده: {bankHint}</p> : null}
          <button type="button" className="btn-primary w-full" onClick={() => void addPayout()}>
            افزودن کارت
          </button>
          <button type="button" className="btn-ghost w-full" onClick={() => void revealCard()}>
            نمایش کارت و شبا
          </button>
        </div>

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
          <p className="text-xs text-ink-700/70">{toPersianDigits(outboxCount, profile?.usePersianDigits ?? true)} عملیات در صف</p>
          <button
            type="button"
            className="btn-primary w-full"
            onClick={async () => {
              const res = await flushOutbox();
              setToast(res.ok ? 'همگام شد' : res.error || 'خطا');
            }}
          >
            همگام‌سازی همه دوره‌ها
          </button>
          <Link to="/auth" className="btn-ghost w-full">
            ورود / ارتقا مهمان
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
    </Shell>
  );
}
