import { useState } from 'react';
import { api, getDeviceId, normalizeIranMobile, normalizeOtp } from '../lib/api';
import { useSession } from '../lib/session';
import { useThemePref, type ThemePref } from '../lib/themePref';
import type { AdminUser } from '../lib/types';

const themeOptions: { id: ThemePref; label: string }[] = [
  { id: 'light', label: 'روشن' },
  { id: 'dark', label: 'تیره' },
  { id: 'system', label: 'سیستم' },
];

export function LoginPage() {
  const { login, setToast, toast } = useSession();
  const [themePref, setThemePref] = useThemePref();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const request = async () => {
    const local = normalizeIranMobile(phone);
    if (!local) {
      setToast('شماره موبایل نامعتبر است');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; devCode?: string }>('/admin/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ phone: local }),
      });
      setSent(true);
      setDevCode(res.devCode || '');
      setToast('کد با پیامک ارسال شد — اگر نرسید ۳۰ ثانیه صبر کنید و دوباره بگیرید');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const local = normalizeIranMobile(phone);
    const otp = normalizeOtp(code);
    if (!local || otp.length !== 6) {
      setToast('شماره یا کد نامعتبر است');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ token: string; user: AdminUser }>('/admin/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone: local, code: otp, deviceId: getDeviceId() }),
      });
      login(res.token, res.user);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <div className="mb-3 flex gap-1 self-end rounded-xl bg-brand-50 p-1">
        {themeOptions.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold ${
              themePref === opt.id ? 'bg-brand-700 text-white' : 'text-ink-800'
            }`}
            onClick={() => setThemePref(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="card animate-rise space-y-4">
        <div>
          <p className="text-xs font-semibold text-brand-700">admin.dongham.ir</p>
          <h1 className="mt-1 text-2xl font-extrabold text-brand-900">ورود ادمین</h1>
          <p className="mt-1 text-sm text-ink-700/70">فقط شماره‌های مجاز با کد یک‌بارمصرف وارد می‌شوند.</p>
        </div>
        <div>
          <label className="label">شماره موبایل</label>
          <input className="input" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0919xxxxxxx" />
        </div>
        {!sent ? (
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => void request()}>
            دریافت کد
          </button>
        ) : (
          <>
            {devCode ? <p className="text-xs text-brand-800">کد توسعه: {devCode}</p> : null}
            <div>
              <label className="label">کد تأیید</label>
              <input className="input" dir="ltr" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => void verify()}>
              ورود
            </button>
          </>
        )}
      </div>
      {toast ? (
        <p className={`mt-4 text-center text-sm ${toast.includes('پیامک') ? 'text-brand-800' : 'text-rose-700'}`}>
          {toast}
        </p>
      ) : null}
    </div>
  );
}
