import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Shell } from '../components/ui';
import { ConnectionModeBadge } from '../components/ConnectionModeBadge';
import { ConfirmDialog } from '../components/Dialog';
import { api, ensureProfile, getDeviceId, updateProfile } from '../lib/api';
import { applyAuthSession, rememberUserId, type AuthUser, type CloudProfile } from '../lib/cloudProfile';
import { db } from '../lib/db';
import { normalizeEmail, normalizeIranMobile, normalizeOtpCode, toPersianDigits } from '../lib/format';
import { googleClientId, loadGis } from '../lib/googleAuth';
import { APP_HOME } from '../lib/paths';
import { DISPLAY_NAME_MAX, needsDisplayName, normalizeDisplayName } from '../lib/memberLabel';
import { isAutoSyncOn } from '../lib/connectionMode';
import { flushOutbox, pullCloud } from '../lib/sync';
import { disableWebPush, syncPushSubscription } from '../lib/webPush';
import { usePersianDigits } from '../lib/usePersianDigits';
import { useUiStore } from '../store/ui';

export function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setToast = useUiStore((s) => s.setToast);
  const profile = useLiveQuery(() => db.profile.get('self'));
  const persian = usePersianDigits();
  const [mode, setMode] = useState<'otp' | 'email'>('otp');
  const [emailSub, setEmailSub] = useState<'otp' | 'password'>('otp');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailDevCode, setEmailDevCode] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkEmailCode, setLinkEmailCode] = useState('');
  const [linkEmailDev, setLinkEmailDev] = useState('');
  const [linkEmailSent, setLinkEmailSent] = useState(false);
  const [linkPhone, setLinkPhone] = useState('');
  const [linkPhoneCode, setLinkPhoneCode] = useState('');
  const [linkPhoneDev, setLinkPhoneDev] = useState('');
  const [linkPhoneSent, setLinkPhoneSent] = useState(false);
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
    await syncPushSubscription();
    setToast(toast, 'success');
    const next = searchParams.get('next') || APP_HOME;
    navigate(next, { replace: true });
  };

  const applyLinked = async (res: { user: AuthUser; profile?: CloudProfile }, toast: string) => {
    await updateProfile({
      phone: res.user.phone,
      email: res.user.email,
      displayName: res.user.displayName,
      plan: res.user.plan || 'free',
      premiumUntil: res.user.premiumUntil,
    });
    await flushOutbox();
    await pullCloud();
    setLinkEmailSent(false);
    setLinkPhoneSent(false);
    setLinkEmailCode('');
    setLinkPhoneCode('');
    setLinkEmailDev('');
    setLinkPhoneDev('');
    setToast(toast, 'success');
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
        if (!cancelled) setToast(e instanceof Error ? e.message : 'ورود پشتیبانی ناموفق بود', 'error');
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
              await applySession(res, 'ورود با گوگل موفق — داده‌های این دستگاه همگام می‌شوند');
            } catch (e) {
              setToast(e instanceof Error ? e.message : 'ورود گوگل ناموفق بود', 'error');
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
        setToast(e instanceof Error ? e.message : 'بارگذاری گوگل ناموفق بود', 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, profile?.token]);

  const resolvedDisplayName = () => {
    const fromForm = normalizeDisplayName(displayName);
    if (!needsDisplayName(fromForm)) return fromForm;
    return normalizeDisplayName(profile?.displayName);
  };

  const requestOtp = async () => {
    const local = normalizeIranMobile(phone);
    if (!local) {
      setToast('شماره موبایل نامعتبر است', 'error');
      return;
    }
    try {
      const res = await api<{ ok: boolean; devCode?: string }>('/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ phone: local }),
      });
      setOtpSent(true);
      if (res.devCode) setDevCode(res.devCode);
      setToast('کد ارسال شد', 'success');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
    }
  };

  const verifyOtp = async () => {
    const local = normalizeIranMobile(phone);
    const otp = normalizeOtpCode(code);
    if (!local || !otp) {
      setToast('شماره یا کد نامعتبر است', 'error');
      return;
    }
    const name = resolvedDisplayName();
    if (needsDisplayName(name)) {
      setToast('نام نمایشی لازم است', 'error');
      return;
    }
    try {
      const res = await api<{ token: string; user: AuthUser }>('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({
          phone: local,
          code: otp,
          displayName: name,
          deviceId: await getDeviceId(),
        }),
      });
      await applySession(res, 'ورود موفق — داده‌های این دستگاه همگام می‌شوند');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
    }
  };

  const requestEmailOtp = async () => {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      setToast('ایمیل نامعتبر است', 'error');
      return;
    }
    try {
      const res = await api<{ ok: boolean; devCode?: string }>('/auth/email-otp/request', {
        method: 'POST',
        body: JSON.stringify({ email: normalized }),
      });
      setEmailOtpSent(true);
      setEmailDevCode(res.devCode || '');
      setToast('کد به ایمیل ارسال شد', 'success');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
    }
  };

  const verifyEmailOtp = async () => {
    const normalized = normalizeEmail(email);
    const otp = normalizeOtpCode(emailCode);
    if (!normalized || !otp) {
      setToast('ایمیل یا کد نامعتبر است', 'error');
      return;
    }
    const name = resolvedDisplayName();
    if (needsDisplayName(name)) {
      setToast('نام نمایشی لازم است', 'error');
      return;
    }
    try {
      const res = await api<{ token: string; user: AuthUser }>('/auth/email-otp/verify', {
        method: 'POST',
        body: JSON.stringify({
          email: normalized,
          code: otp,
          displayName: name,
          deviceId: await getDeviceId(),
        }),
      });
      await applySession(res, 'ورود موفق — داده‌های این دستگاه همگام می‌شوند');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
    }
  };

  const registerEmail = async () => {
    const name = resolvedDisplayName();
    if (needsDisplayName(name)) {
      setToast('نام نمایشی لازم است', 'error');
      return;
    }
    try {
      const res = await api<{ token: string; user: AuthUser }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          displayName: name,
          deviceId: await getDeviceId(),
        }),
      });
      await applySession(res, 'ثبت‌نام موفق');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
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
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
    }
  };

  const requestLinkEmail = async () => {
    const normalized = normalizeEmail(linkEmail);
    if (!normalized) {
      setToast('ایمیل نامعتبر است', 'error');
      return;
    }
    try {
      const res = await api<{ ok: boolean; devCode?: string }>('/auth/link/email/request', {
        method: 'POST',
        body: JSON.stringify({ email: normalized }),
      });
      setLinkEmailSent(true);
      setLinkEmailDev(res.devCode || '');
      setToast('کد به ایمیل ارسال شد', 'success');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
    }
  };

  const verifyLinkEmail = async () => {
    const normalized = normalizeEmail(linkEmail);
    const otp = normalizeOtpCode(linkEmailCode);
    if (!normalized || !otp) {
      setToast('ایمیل یا کد نامعتبر است', 'error');
      return;
    }
    try {
      const res = await api<{ user: AuthUser; profile?: CloudProfile }>('/auth/link/email/verify', {
        method: 'POST',
        body: JSON.stringify({ email: normalized, code: otp }),
      });
      await applyLinked(res, 'ایمیل به حساب وصل شد');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
    }
  };

  const requestLinkPhone = async () => {
    const local = normalizeIranMobile(linkPhone);
    if (!local) {
      setToast('شماره موبایل نامعتبر است', 'error');
      return;
    }
    try {
      const res = await api<{ ok: boolean; devCode?: string }>('/auth/link/phone/request', {
        method: 'POST',
        body: JSON.stringify({ phone: local }),
      });
      setLinkPhoneSent(true);
      setLinkPhoneDev(res.devCode || '');
      setToast('کد ارسال شد', 'success');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
    }
  };

  const verifyLinkPhone = async () => {
    const local = normalizeIranMobile(linkPhone);
    const otp = normalizeOtpCode(linkPhoneCode);
    if (!local || !otp) {
      setToast('شماره یا کد نامعتبر است', 'error');
      return;
    }
    try {
      const res = await api<{ user: AuthUser; profile?: CloudProfile }>('/auth/link/phone/verify', {
        method: 'POST',
        body: JSON.stringify({ phone: local, code: otp }),
      });
      await applyLinked(res, 'شماره به حساب وصل شد');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
    }
  };

  const logout = async () => {
    await disableWebPush();
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* already invalid */
    }
    const current = await ensureProfile();
    await rememberUserId(current.userId);
    await updateProfile({ token: undefined, userId: undefined });
    setToast('خارج شدید — داده محلی باقی است', 'info');
  };

  const deleteAccount = async () => {
    try {
      const current = await ensureProfile();
      await rememberUserId(current.userId);
      await disableWebPush();
      await api('/auth/delete-account', { method: 'POST' });
      await updateProfile({ token: undefined, userId: undefined, phone: undefined, email: undefined });
      setToast('حساب حذف شد', 'success');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
    }
  };

  const phoneLabel = profile?.phone ? toPersianDigits(profile.phone, persian) : null;

  return (
    <Shell title="حساب کاربری" back={() => navigate('/profile')}>
      <div className="mx-auto max-w-lg space-y-4 animate-rise">
        <div className="card-surface">
          <p className="text-sm text-ink-700/70">وضعیت فعلی</p>
          <p className="mt-1 text-lg font-bold">
            {needsDisplayName(profile?.displayName) ? 'شما' : profile?.displayName}
          </p>
          <div className="mt-2">
            <ConnectionModeBadge />
          </div>
          {profile?.token ? (
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-700/70">موبایل</dt>
                <dd className="font-semibold" dir="ltr">{phoneLabel || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-700/70">ایمیل</dt>
                <dd className="min-w-0 truncate font-semibold" dir="ltr">{profile.email || '—'}</dd>
              </div>
            </dl>
          ) : null}
          <p className="mt-2 text-xs text-ink-700/60">
            {profile?.token
              ? isAutoSyncOn(profile)
                ? 'همگام‌سازی خودکار فعال است'
                : 'همگام‌سازی دستی — از تنظیمات می‌توانید خودکار کنید'
              : 'برای همگام‌سازی ابری وارد شوید'}
          </p>
          {profile?.token ? (
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn-ghost" onClick={logout}>
                خروج
              </button>
              <button type="button" className="btn-ghost text-danger" onClick={() => setConfirmDelete(true)}>
                حذف حساب
              </button>
            </div>
          ) : null}
        </div>

        {profile?.token && !profile.phone ? (
          <div className="card-surface space-y-3">
            <p className="text-sm font-semibold">اتصال شماره موبایل</p>
            <p className="text-xs text-ink-700/70">با تأیید شماره می‌توانید بعداً با پیامک هم وارد شوید.</p>
            <div>
              <label className="label" htmlFor="link-phone">شماره موبایل</label>
              <input
                id="link-phone"
                className="input"
                value={linkPhone}
                onChange={(e) => setLinkPhone(e.target.value)}
                placeholder="۰۹۱۲xxxxxxx"
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            {!linkPhoneSent ? (
              <button type="button" className="btn-primary w-full" onClick={() => void requestLinkPhone()}>
                دریافت کد
              </button>
            ) : (
              <>
                {linkPhoneDev ? (
                  <p className="text-xs text-brand-800">کد توسعه: {toPersianDigits(linkPhoneDev, persian)}</p>
                ) : null}
                <div>
                  <label className="label" htmlFor="link-phone-otp">کد تأیید</label>
                  <input
                    id="link-phone-otp"
                    className="input"
                    value={linkPhoneCode}
                    onChange={(e) => setLinkPhoneCode(e.target.value)}
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </div>
                <button type="button" className="btn-primary w-full" onClick={() => void verifyLinkPhone()}>
                  تأیید و اتصال
                </button>
              </>
            )}
          </div>
        ) : null}

        {profile?.token && !profile.email ? (
          <div className="card-surface space-y-3">
            <p className="text-sm font-semibold">اتصال ایمیل</p>
            <p className="text-xs text-ink-700/70">با تأیید ایمیل می‌توانید بعداً با کد ایمیل هم وارد شوید.</p>
            <div>
              <label className="label" htmlFor="link-email">ایمیل</label>
              <input
                id="link-email"
                className="input"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                dir="ltr"
                autoComplete="email"
              />
            </div>
            {!linkEmailSent ? (
              <button type="button" className="btn-primary w-full" onClick={() => void requestLinkEmail()}>
                دریافت کد
              </button>
            ) : (
              <>
                {linkEmailDev ? (
                  <p className="text-xs text-brand-800">کد توسعه: {toPersianDigits(linkEmailDev, persian)}</p>
                ) : null}
                <div>
                  <label className="label" htmlFor="link-email-otp">کد تأیید</label>
                  <input
                    id="link-email-otp"
                    className="input"
                    value={linkEmailCode}
                    onChange={(e) => setLinkEmailCode(e.target.value)}
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </div>
                <button type="button" className="btn-primary w-full" onClick={() => void verifyLinkEmail()}>
                  تأیید و اتصال
                </button>
              </>
            )}
          </div>
        ) : null}

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
                className={`chip flex-1 ${mode === 'otp' ? 'bg-brand-700 text-on-brand' : 'bg-surface/80 ring-1 ring-brand-800/20'}`}
                onClick={() => setMode('otp')}
              >
                موبایل
              </button>
              <button
                type="button"
                className={`chip flex-1 ${mode === 'email' ? 'bg-brand-700 text-on-brand' : 'bg-surface/80 ring-1 ring-brand-800/20'}`}
                onClick={() => setMode('email')}
              >
                ایمیل
              </button>
            </div>

            <div className="card-surface space-y-3">
              <div>
                <label className="label" htmlFor="auth-display-name">نام نمایشی</label>
                <input
                  id="auth-display-name"
                  className="input"
                  value={displayName}
                  maxLength={DISPLAY_NAME_MAX}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={needsDisplayName(profile?.displayName) ? 'مثلاً محمد' : profile?.displayName}
                />
              </div>
              {mode === 'otp' ? (
                <>
                  <div>
                    <label className="label" htmlFor="auth-phone">شماره موبایل</label>
                    <input id="auth-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="۰۹۱۲xxxxxxx" dir="ltr" inputMode="tel" autoComplete="tel" />
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
                        <label className="label" htmlFor="auth-otp">کد تأیید</label>
                        <input id="auth-otp" className="input" value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" inputMode="numeric" autoComplete="one-time-code" />
                      </div>
                      <button type="button" className="btn-primary w-full" onClick={verifyOtp}>
                        تأیید و ورود
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`chip flex-1 ${emailSub === 'otp' ? 'bg-brand-700 text-on-brand' : 'bg-surface/80 ring-1 ring-brand-800/20'}`}
                      onClick={() => setEmailSub('otp')}
                    >
                      کد ایمیل
                    </button>
                    <button
                      type="button"
                      className={`chip flex-1 ${emailSub === 'password' ? 'bg-brand-700 text-on-brand' : 'bg-surface/80 ring-1 ring-brand-800/20'}`}
                      onClick={() => setEmailSub('password')}
                    >
                      رمز عبور
                    </button>
                  </div>
                  <div>
                    <label className="label" htmlFor="auth-email">ایمیل</label>
                    <input id="auth-email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" autoComplete="email" />
                  </div>
                  {emailSub === 'otp' ? (
                    !emailOtpSent ? (
                      <button type="button" className="btn-primary w-full" onClick={() => void requestEmailOtp()}>
                        دریافت کد
                      </button>
                    ) : (
                      <>
                        {emailDevCode ? (
                          <p className="text-xs text-brand-800">کد توسعه: {toPersianDigits(emailDevCode, persian)}</p>
                        ) : null}
                        <div>
                          <label className="label" htmlFor="auth-email-otp">کد تأیید</label>
                          <input
                            id="auth-email-otp"
                            className="input"
                            value={emailCode}
                            onChange={(e) => setEmailCode(e.target.value)}
                            dir="ltr"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                          />
                        </div>
                        <button type="button" className="btn-primary w-full" onClick={() => void verifyEmailOtp()}>
                          تأیید و ورود
                        </button>
                      </>
                    )
                  ) : (
                    <>
                      <div>
                        <label className="label" htmlFor="auth-password">رمز</label>
                        <input id="auth-password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" autoComplete="current-password" />
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
