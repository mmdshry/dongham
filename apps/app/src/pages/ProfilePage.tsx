import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { ChevronLeft, Copy, Settings, UserRound, Users } from 'lucide-react';
import { parseUsername, USERNAME_ERROR_FA } from '@dongham/ledger';
import { AvatarPicker } from '../components/AvatarPicker';
import { Icon } from '../components/Icon';
import { PeriodMediaPicker } from '../components/PeriodMediaPicker';
import { UserAvatar } from '../components/UserAvatar';
import { ConnectionModeBadge } from '../components/ConnectionModeBadge';
import { Shell } from '../components/ui';
import { compressAvatar } from '../lib/avatar';
import { api } from '../lib/api';
import { pushAvatar, pushAvatarPreset, removeAvatar } from '../lib/avatarCache';
import { db } from '../lib/db';
import { pushProfileCover, pushProfileCoverPreset, removeProfileCover, saveUsername } from '../lib/profileCloud';
import { hasUserAvatar, userAvatarSrc } from '../lib/userAvatarPresets';
import { useUiStore } from '../store/ui';

export function ProfilePage() {
  const profile = useLiveQuery(() => db.profile.get('self'));
  const setToast = useUiStore((s) => s.setToast);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameHint, setUsernameHint] = useState<string | null>(null);
  const [usernameOk, setUsernameOk] = useState(false);
  const name = profile?.displayName || 'شما';
  const src = userAvatarSrc(profile);
  const hasAvatar = hasUserAvatar(profile);
  const loggedIn = Boolean(profile?.token);
  const publicPath = profile?.username ? `/${profile.username}` : '';

  useEffect(() => {
    setUsernameDraft(profile?.username || '');
  }, [profile?.username]);

  useEffect(() => {
    if (!loggedIn) return;
    const raw = usernameDraft.trim();
    if (!raw || raw === profile?.username) {
      setUsernameHint(null);
      setUsernameOk(false);
      return;
    }
    const parsed = parseUsername(raw);
    if (!parsed.ok) {
      setUsernameHint(USERNAME_ERROR_FA[parsed.reason]);
      setUsernameOk(false);
      return;
    }
    const t = window.setTimeout(() => {
      void api<{ available: boolean; error?: string }>(
        `/auth/username/available?u=${encodeURIComponent(parsed.username)}`,
      )
        .then((res) => {
          setUsernameOk(res.available);
          setUsernameHint(res.available ? `dongham.ir/${parsed.username}` : res.error || 'گرفته شده');
        })
        .catch((e) => {
          setUsernameOk(false);
          setUsernameHint(e instanceof Error ? e.message : 'بررسی ممکن نشد');
        });
    }, 280);
    return () => window.clearTimeout(t);
  }, [usernameDraft, loggedIn, profile?.username]);

  const onPick = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const dataUrl = await compressAvatar(file);
      await pushAvatar(dataUrl);
      setPicker(false);
      setToast('آواتار ذخیره شد', 'success');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'آپلود آواتار ممکن نشد', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onPreset = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await pushAvatarPreset(id);
      setToast('آواتار ذخیره شد', 'success');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'ذخیره آواتار ممکن نشد', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    if (busy || !hasAvatar) return;
    setBusy(true);
    try {
      await removeAvatar();
      setPicker(false);
      setToast('آواتار حذف شد', 'success');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'حذف آواتار ممکن نشد', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onCoverChange = async (next: { coverPreset?: string; coverDataUrl?: string }) => {
    if (busy || !loggedIn) return;
    if (next.coverDataUrl && next.coverDataUrl === profile?.profileCoverDataUrl) return;
    if (!next.coverDataUrl && next.coverPreset && next.coverPreset === profile?.profileCoverPreset) return;
    setBusy(true);
    try {
      if (next.coverDataUrl) await pushProfileCover(next.coverDataUrl);
      else if (next.coverPreset) await pushProfileCoverPreset(next.coverPreset);
      setToast('بک‌گراند ذخیره شد', 'success');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'ذخیره بک‌گراند ممکن نشد', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onSaveUsername = async () => {
    if (busy || !loggedIn) return;
    const raw = usernameDraft.trim();
    if (raw) {
      const parsed = parseUsername(raw);
      if (!parsed.ok) {
        setToast(USERNAME_ERROR_FA[parsed.reason], 'error');
        return;
      }
    }
    setBusy(true);
    try {
      const parsed = raw ? parseUsername(raw) : null;
      await saveUsername(parsed && parsed.ok ? parsed.username : '');
      setToast(raw ? 'یوزرنیم ذخیره شد' : 'یوزرنیم برداشته شد', 'success');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'ذخیره یوزرنیم ممکن نشد', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!publicPath) return;
    const url = `${window.location.origin}${publicPath}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast('لینک پروفایل کپی شد', 'success');
    } catch {
      setToast(url, 'info');
    }
  };

  return (
    <Shell title="پروفایل" chrome="app">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="card-surface flex items-center gap-3">
          <div className="relative shrink-0">
            <button
              type="button"
              className="inline-flex shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
              aria-label="تغییر آواتار"
              disabled={busy}
              onClick={() => setPicker(true)}
            >
              <UserAvatar name={name} src={src} size="lg" />
              {busy ? (
                <span className="absolute inset-0 rounded-full bg-ink-900/40" aria-hidden />
              ) : null}
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold">{name}</p>
            {profile?.username ? (
              <p className="mt-0.5 text-sm text-ink-700/70" dir="ltr">
                @{profile.username}
              </p>
            ) : null}
            <p className="mt-1">
              <ConnectionModeBadge />
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={busy}
                onClick={() => setPicker(true)}
              >
                {hasAvatar ? 'تغییر آواتار' : 'انتخاب آواتار'}
              </button>
              {hasAvatar ? (
                <button
                  type="button"
                  className="btn-ghost btn-sm text-danger"
                  disabled={busy}
                  onClick={() => void onRemove()}
                >
                  حذف عکس
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <section className="card-surface space-y-3">
          <h2 className="section-title">یوزرنیم و صفحهٔ عمومی</h2>
          {loggedIn ? (
            <>
              <label className="label" htmlFor="profile-username">
                یوزرنیم
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="profile-username"
                  className="input min-w-0 flex-1"
                  dir="ltr"
                  placeholder="mmdshry"
                  value={usernameDraft}
                  maxLength={20}
                  onChange={(e) => setUsernameDraft(e.target.value)}
                />
                <button type="button" className="btn-primary shrink-0" disabled={busy} onClick={() => void onSaveUsername()}>
                  ذخیره
                </button>
              </div>
              {usernameHint ? (
                <p className={`text-xs ${usernameOk ? 'text-success' : 'text-ink-700/70'}`} dir="ltr">
                  {usernameHint}
                </p>
              ) : (
                <p className="text-xs text-ink-700/70">با حرف انگلیسی شروع شود؛ فقط حرف و رقم انگلیسی. ۳ تا ۲۰ کاراکتر.</p>
              )}
              {publicPath ? (
                <div className="flex flex-wrap gap-2">
                  <Link to={publicPath} className="btn-ghost btn-sm">
                    مشاهدهٔ صفحهٔ عمومی
                  </Link>
                  <button type="button" className="btn-ghost btn-sm inline-flex items-center gap-1" onClick={() => void copyLink()}>
                    <Icon icon={Copy} size={14} />
                    کپی لینک
                  </button>
                  {profile?.profileCoverPreset || profile?.profileCoverDataUrl ? (
                    <button
                      type="button"
                      className="btn-ghost btn-sm text-danger"
                      disabled={busy}
                      onClick={() => {
                        void removeProfileCover()
                          .then(() => setToast('بک‌گراند حذف شد', 'success'))
                          .catch((e) => setToast(e instanceof Error ? e.message : 'حذف ممکن نشد', 'error'));
                      }}
                    >
                      حذف بک‌گراند
                    </button>
                  ) : null}
                </div>
              ) : null}
              <PeriodMediaPicker
                label="بک‌گراند پروفایل"
                disabled={busy}
                value={{
                  coverPreset: profile?.profileCoverPreset,
                  coverDataUrl: profile?.profileCoverDataUrl,
                }}
                onChange={(next) => void onCoverChange(next)}
              />
            </>
          ) : (
            <p className="text-sm leading-6 text-ink-700/80">
              برای داشتن یوزرنیم و صفحهٔ عمومی، از حساب کاربری وارد شوید.
            </p>
          )}
        </section>

        <nav className="space-y-2" aria-label="حساب">
          <Link to="/auth" className="card-surface flex items-center justify-between !py-4">
            <span className="inline-flex items-center gap-3 font-bold">
              <Icon icon={UserRound} size={20} className="text-brand-700" />
              حساب کاربری
            </span>
            <Icon icon={ChevronLeft} size={18} className="text-ink-700/40" />
          </Link>
          <Link to="/friends" className="card-surface flex items-center justify-between !py-4">
            <span className="inline-flex items-center gap-3 font-bold">
              <Icon icon={Users} size={20} className="text-brand-700" />
              دوستام
            </span>
            <Icon icon={ChevronLeft} size={18} className="text-ink-700/40" />
          </Link>
          <Link to="/more" className="card-surface flex items-center justify-between !py-4">
            <span className="inline-flex items-center gap-3 font-bold">
              <Icon icon={Settings} size={20} className="text-brand-700" />
              تنظیمات و ابزار
            </span>
            <Icon icon={ChevronLeft} size={18} className="text-ink-700/40" />
          </Link>
        </nav>
      </div>
      <AvatarPicker
        open={picker}
        onClose={() => setPicker(false)}
        selectedPreset={profile?.avatarDataUrl ? undefined : profile?.avatarPreset}
        hasAvatar={hasAvatar}
        busy={busy}
        onSelectPreset={(id) => void onPreset(id)}
        onPickFile={(file) => void onPick(file)}
        onRemove={() => void onRemove()}
      />
    </Shell>
  );
}
