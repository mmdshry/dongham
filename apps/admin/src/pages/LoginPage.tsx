import { Monitor, Moon, Phone, Sun } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { Icon } from '../components/Icon';
import { useState } from 'react';
import { api, getDeviceId, normalizeIranMobile, normalizeOtp } from '../lib/api';
import { useSession } from '../lib/session';
import { useThemePref, type ThemePref } from '../lib/themePref';
import type { AdminUser } from '../lib/types';

const themeOptions: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'روشن', icon: Sun },
  { id: 'dark', label: 'تیره', icon: Moon },
  { id: 'system', label: 'سیستم', icon: Monitor },
];

export function LoginPage() {
  const { login, setToast } = useSession();
  const [themePref, setThemePref] = useThemePref();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const request = async () => {
    const local = normalizeIranMobile(phone);
    if (!local) {
      setToast('شماره موبایل نامعتبر است', 'error');
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
      setToast('کد با پیامک ارسال شد — اگر نرسید ۳۰ ثانیه صبر کنید و دوباره بگیرید', 'success');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const local = normalizeIranMobile(phone);
    const otp = normalizeOtp(code);
    if (!local || otp.length !== 6) {
      setToast('شماره یا کد نامعتبر است', 'error');
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
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
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
            className={`inline-flex min-h-11 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${
              themePref === opt.id ? 'bg-brand-700 text-on-brand' : 'text-ink-800'
            }`}
            aria-pressed={themePref === opt.id}
            onClick={() => setThemePref(opt.id)}
          >
            <Icon icon={opt.icon} size={12} />
            {opt.label}
          </button>
        ))}
      </div>
      <div className="card animate-rise space-y-4">
        <div className="flex flex-col items-center">
          <BrandLogo size="lg" />
          <h1 className="mt-4 inline-flex items-center gap-2 text-2xl font-extrabold text-ink-900">
            <Icon icon={Phone} size={22} className="text-brand-700" />
            ورود ادمین
          </h1>
          <p className="mt-1 text-center text-sm text-ink-700/70">فقط شماره‌های مجاز با کد یک‌بارمصرف وارد می‌شوند.</p>
        </div>
        <div>
          <label className="label" htmlFor="admin-phone">شماره موبایل</label>
          <input id="admin-phone" className="input" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0919xxxxxxx" autoComplete="tel" />
        </div>
        {!sent ? (
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => void request()}>
            دریافت کد
          </button>
        ) : (
          <>
            {devCode ? <p className="text-xs text-brand-800">کد توسعه: {devCode}</p> : null}
            <div>
              <label className="label" htmlFor="admin-otp">کد تأیید</label>
              <input id="admin-otp" className="input" dir="ltr" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
            </div>
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => void verify()}>
              ورود
            </button>
          </>
        )}
      </div>
    </div>
  );
}
