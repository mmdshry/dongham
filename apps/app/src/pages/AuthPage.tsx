import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Shell } from '../components/ui';
import { ConfirmDialog } from '../components/Dialog';
import { api, ensureProfile, getDeviceId, updateProfile } from '../lib/api';
import { applyAuthSession, rememberUserId, type AuthUser, type CloudProfile } from '../lib/cloudProfile';
import { db } from '../lib/db';
import { normalizeIranMobile, normalizeOtpCode, toPersianDigits } from '../lib/format';
import { googleClientId, loadGis } from '../lib/googleAuth';
import { flushOutbox, pullCloud } from '../lib/sync';
import { usePersianDigits } from '../lib/usePersianDigits';
import { useUiStore } from '../store/ui';

export function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setToast = useUiStore((s) => s.setToast);
  const profile = useLiveQuery(() => db.profile.get('self'));
  const persian = usePersianDigits();
  const [mode, setMode] = useState<'otp' | 'email'>('otp');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const clientId = googleClientId();

  const applySession = async (
    res: { token: string; user: AuthUser; profile?: CloudProfile },
    toast: string,
  ) => {
    await applyAuthSession(res);
    await flushOutbox();
    await pullCloud();
    setToast(toast);
    const next = searchParams.get('next') || '/';
    navigate(next, { replace: true });
  };

  useEffect(() => {
    const imp = searchParams.get('imp');
    if (!imp) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<{ token: string; user: AuthUser }>('/auth/impersonate/consume', {
          method: 'POST',
          body: JSON.stringify({ code: imp, deviceId: await getDeviceId() }),
        });
        if (cancelled) return;
        await applySession(res, 'ورود پشتیبانی');
      } catch (e) {
        if (!cancelled) setToast(e instanceof Error ? e.message : 'ورود پشتیبانی ناموفق بود');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!clientId || profile?.token) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadGis();
        if (cancelled || !googleBtnRef.current || !window.google?.accounts?.id) return;
        googleBtnRef.current.innerHTML = '';
        const width = Math.min(320, Math.max(220, googleBtnRef.current.parentElement?.clientWidth || 280));
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            try {
              const res = await api<{ token: string; user: AuthUser }>('/auth/google', {
                method: 'POST',
                body: JSON.stringify({
                  idToken: response.credential,
                  deviceId: await getDeviceId(),
                }),
              });
              await applySession(res, 'ورود با گوگل موفق — داده‌های مهمان همگام می‌شوند');
            } catch (e) {
              setToast(e instanceof Error ? e.message : 'ورود گوگل ناموفق بود');
            }
          },
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          width,
          locale: 'fa',
          text: 'signin_with',
        });
      } catch (e) {
        setToast(e instanceof Error ? e.message : 'بارگذاری گوگل ناموفق بود');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, profile?.token]);

  const requestOtp = async () => {
    const local = normalizeIranMobile(phone);
    if (!local) {
      setToast('شماره موبایل نامعتبر است');
      return;
    }
    try {
      const res = await api<{ ok: boolean; devCode?: string }>('/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ phone: local }),
      });
      setOtpSent(true);
      if (res.devCode) setDevCode(res.devCode);
      setToast('کد ارسال شد');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا');
    }
  };

  const verifyOtp = async () => {
    const local = normalizeIranMobile(phone);
    const otp = normalizeOtpCode(code);
    if (!local || !otp) {
      setToast('شماره یا کد نامعتبر است');
      return;
    }
    try {
      const res = await api<{ token: string; user: AuthUser }>('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({
          phone: local,
          code: otp,
          displayName: displayName || profile?.displayName,
          deviceId: await getDeviceId(),
        }),
      });
      await applySession(res, 'ورود موفق — داده‌های مهمان همگام می‌شوند');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا');
    }
  };

  const registerEmail = async () => {
    try {
      const res = await api<{ token: string; user: AuthUser }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          displayName: displayName || email.split('@')[0],
          deviceId: await getDeviceId(),
        }),
      });
      await applySession(res, 'ثبت‌نام موفق');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا');
    }
  };

  const loginEmail = async () => {
    try {
      const res = await api<{ token: string; user: AuthUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, deviceId: await getDeviceId() }),
      });
      await applySession(res, 'ورود موفق');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا');
    }
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* already invalid */
    }
    const current = await ensureProfile();
    await rememberUserId(current.userId);
    await updateProfile({ token: undefined, userId: undefined });
    setToast('خارج شدید — داده محلی باقی است');
  };

  const deleteAccount = async () => {
    try {
      const current = await ensureProfile();
      await rememberUserId(current.userId);
      await api('/auth/delete-account', { method: 'POST' });
      await updateProfile({ token: undefined, userId: undefined, phone: undefined, email: undefined });
      setToast('حساب حذف شد');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا');
    }
  };

  return (
    <Shell title="حساب کاربری">
      <div className="mx-auto max-w-lg space-y-4 animate-rise">
        <div className="card-surface">
          <p className="text-sm text-ink-700/70">وضعیت فعلی</p>
          <p className="mt-1 text-lg font-bold">{profile?.displayName || 'مهمان'}</p>
          <p className="mt-1 text-xs text-ink-700/60">
            {profile?.token ? 'وارد شده — همگام‌سازی ابری فعال' : 'حالت مهمان آفلاین'}
          </p>
          {profile?.token ? (
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn-ghost" onClick={logout}>
                خروج
              </button>
              <button type="button" className="btn-ghost text-rose-700" onClick={() => setConfirmDelete(true)}>
                حذف حساب
              </button>
            </div>
          ) : null}
        </div>

        {!profile?.token ? (
          <>
            {clientId ? (
              <div className="card-surface space-y-2">
                <p className="text-sm font-semibold">ورود با گوگل</p>
                <div ref={googleBtnRef} className="flex w-full max-w-full justify-center overflow-hidden" />
              </div>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                className={`chip flex-1 ${mode === 'otp' ? 'bg-brand-700 text-white' : 'bg-surface/80 ring-1 ring-brand-700/10'}`}
                onClick={() => setMode('otp')}
              >
                موبایل
              </button>
              <button
                type="button"
                className={`chip flex-1 ${mode === 'email' ? 'bg-brand-700 text-white' : 'bg-surface/80 ring-1 ring-brand-700/10'}`}
                onClick={() => setMode('email')}
              >
                ایمیل / رمز
              </button>
            </div>

            <div className="card-surface space-y-3">
              <div>
                <label className="label">نام نمایشی</label>
                <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={profile?.displayName} />
              </div>
              {mode === 'otp' ? (
                <>
                  <div>
                    <label className="label">شماره موبایل</label>
                    <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="۰۹۱۲xxxxxxx" dir="ltr" inputMode="tel" />
                  </div>
                  {!otpSent ? (
                    <button type="button" className="btn-primary w-full" onClick={requestOtp}>
                      دریافت کد
                    </button>
                  ) : (
                    <>
                      {devCode ? (
                        <p className="text-xs text-brand-800">کد توسعه: {toPersianDigits(devCode, persian)}</p>
                      ) : null}
                      <div>
                        <label className="label">کد تأیید</label>
                        <input className="input" value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" inputMode="numeric" />
                      </div>
                      <button type="button" className="btn-primary w-full" onClick={verifyOtp}>
                        تأیید و ورود
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="label">ایمیل</label>
                    <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
                  </div>
                  <div>
                    <label className="label">رمز</label>
                    <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-ghost flex-1" onClick={loginEmail}>
                      ورود
                    </button>
                    <button type="button" className="btn-primary flex-1" onClick={registerEmail}>
                      ثبت‌نام
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="حذف حساب"
        message="حساب ابری حذف می‌شود. دادهٔ محلی روی این دستگاه باقی می‌ماند."
        confirmLabel="حذف حساب"
        danger
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteAccount();
        }}
      />
    </Shell>
  );
}
