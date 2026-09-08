import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { ConfirmDialog, PageLoading } from '../components/ui';
import { Icon } from '../components/Icon';
import { isPremium } from '@dongham/ledger';
import { api, faDate } from '../lib/api';
import { useSession } from '../lib/session';
import type { AdminUser } from '../lib/types';

type Notif = { id: string; title: string; body: string; read: boolean; createdAt: string };

type Detail = {
  user: AdminUser;
  avatarDataUrl?: string;
  avatarPreset?: string;
  profileCoverPreset?: string;
  profileCoverDataUrl?: string;
  periods: { id: string; title: string; currency: string; ownerId: string; createdAt: string; version: number }[];
  sessions: { id: string; deviceId: string; createdAt: string }[];
  friends: { id: string; displayName: string; phone?: string; email?: string }[];
};

function adminAvatarSrc(preset?: string, dataUrl?: string): string | undefined {
  if (dataUrl) return dataUrl;
  const match = /^(male|female|teen|child)-(0[1-9]|10)$/.exec(preset || '');
  return match ? `/avatars/${match[1]}/${match[2]}.svg` : undefined;
}

export function UserDetailPage() {
  const { id } = useParams();
  const { setToast } = useSession();
  const [data, setData] = useState<Detail | null>(null);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [name, setName] = useState('');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [confirm, setConfirm] = useState<'delete' | 'revoke' | 'impersonate' | 'premium' | 'revoke-premium' | 'ban' | 'unban' | 'avatar' | 'cover' | null>(null);
  const [friendId, setFriendId] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    const res = await api<Detail>(`/admin/users/${id}`);
    setData(res);
    setName(res.user.displayName);
    const n = await api<{ items: Notif[] }>(`/admin/users/${id}/notifications`);
    setNotifs(n.items);
  };

  useEffect(() => {
    void load().catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'));
  }, [id]);

  if (!data) return <PageLoading />;
  const u = data.user;
  const avatarSrc = adminAvatarSrc(data.avatarPreset, data.avatarDataUrl);

  const saveName = async () => {
    try {
      const res = await api<{ user: AdminUser }>(`/admin/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ displayName: name }),
      });
      setData({ ...data, user: res.user });
      setToast('ذخیره شد', 'success');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا', 'error');
    }
  };

  const grantPremium = async (days: number) => {
    const res = await api<{ user: AdminUser }>(`/admin/users/${u.id}/premium`, {
      method: 'POST',
      body: JSON.stringify({ days }),
    });
    setData({ ...data, user: res.user });
    setToast('پریمیوم اعمال شد', 'success');
  };

  const revokePremium = async () => {
    const res = await api<{ user: AdminUser }>(`/admin/users/${u.id}/premium`, {
      method: 'POST',
      body: JSON.stringify({ revoke: true }),
    });
    setData({ ...data, user: res.user });
    setToast('پریمیوم برداشته شد', 'success');
  };

  const sendNotif = async () => {
    await api('/admin/notifications', {
      method: 'POST',
      body: JSON.stringify({ userId: u.id, title: notifTitle, body: notifBody }),
    });
    setNotifTitle('');
    setNotifBody('');
    await load();
    setToast('نوتیف ارسال شد', 'success');
  };

  return (
    <div className="animate-rise space-y-5">
      <Link to="/users" className="inline-flex items-center gap-1 text-sm text-brand-800">
        <Icon icon={ChevronRight} size={16} />
        کاربران
      </Link>
      <h1 className="text-2xl font-extrabold">{u.displayName}</h1>
      {u.deletedAt ? <p className="text-sm text-danger">این حساب حذف شده است ({faDate(u.deletedAt)})</p> : null}
      {u.bannedAt ? <p className="text-sm text-danger">مسدود از {faDate(u.bannedAt)}</p> : null}

      <div className="card flex items-center gap-4">
        {avatarSrc ? (
          <img src={avatarSrc} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-lg font-extrabold text-brand-800">
            {u.displayName.slice(0, 1) || '؟'}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-700/70">{avatarSrc ? 'آواتار ثبت شده' : 'بدون آواتار'}</p>
          {avatarSrc ? (
            <button type="button" className="btn-ghost mt-2 !px-3 !py-1 !text-xs text-danger" onClick={() => setConfirm('avatar')}>
              حذف آواتار
            </button>
          ) : null}
        </div>
      </div>

      <div className="card space-y-2">
        <p className="text-sm text-ink-700/70">
          بک‌گراند:{' '}
          {data.profileCoverDataUrl ? 'عکس سفارشی' : data.profileCoverPreset ? data.profileCoverPreset : 'ثبت نشده'}
        </p>
        {data.profileCoverDataUrl ? (
          <img src={data.profileCoverDataUrl} alt="" className="h-20 w-32 rounded-xl object-cover" />
        ) : null}
        {data.profileCoverDataUrl || data.profileCoverPreset ? (
          <button type="button" className="btn-ghost !px-3 !py-1 !text-xs text-danger" onClick={() => setConfirm('cover')}>
            حذف بک‌گراند
          </button>
        ) : null}
      </div>

      <div className="card space-y-3">
        <p className="text-sm">
          یوزرنیم: <span dir="ltr">{u.username ? `@${u.username}` : '—'}</span>
        </p>
        <p className="text-sm">
          موبایل: <span dir="ltr">{u.phone || '—'}</span>
        </p>
        <p className="text-sm">ایمیل: {u.email || '—'}</p>
        <p className="text-sm">پلن: {isPremium(u) ? `پریمیوم تا ${faDate(u.premiumUntil)}` : 'رایگان'}</p>
        <p className="text-sm">ثبت: {faDate(u.createdAt)}</p>
        <div>
          <label className="label">نام نمایشی</label>
          <div className="flex gap-2">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="button" className="btn-primary" onClick={() => void saveName()}>
              ذخیره
            </button>
          </div>
        </div>
        {!u.deletedAt ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => setConfirm('premium')}>
              اعطای پریمیوم
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirm('revoke-premium')}>
              لغو پریمیوم
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirm('impersonate')}>
              ورود به جای کاربر
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirm('revoke')}>
              ابطال نشست‌ها
            </button>
            {u.bannedAt ? (
              <button type="button" className="btn-ghost" onClick={() => setConfirm('unban')}>
                رفع مسدودی
              </button>
            ) : (
              <button type="button" className="btn-danger" onClick={() => setConfirm('ban')}>
                مسدود کردن
              </button>
            )}
            <button type="button" className="btn-danger" onClick={() => setConfirm('delete')}>
              حذف حساب
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-ghost"
            onClick={() =>
              void api(`/admin/users/${u.id}/restore`, { method: 'POST' })
                .then(() => load())
                .catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'))
            }
          >
            تلاش برای بازیابی
          </button>
        )}
      </div>

      <section className="card space-y-3">
        <h2 className="font-bold">نوتیفیکیشن</h2>
        <input className="input" placeholder="عنوان" value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} />
        <textarea className="input min-h-20" placeholder="متن" value={notifBody} onChange={(e) => setNotifBody(e.target.value)} />
        <button type="button" className="btn-primary" onClick={() => void sendNotif().catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'))}>
          ارسال به این کاربر
        </button>
        <ul className="max-h-48 space-y-1 overflow-auto text-sm">
          {notifs.map((n) => (
            <li key={n.id}>
              {faDate(n.createdAt)} — {n.title}: {n.body}
            </li>
          ))}
          {!notifs.length ? <li className="text-ink-700/60">نوتیفی نیست</li> : null}
        </ul>
      </section>

      <section className="card">
        <h2 className="font-bold">دوره‌ها</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data.periods.map((p) => (
            <li key={p.id}>
              <Link className="text-brand-800" to={`/periods/${p.id}`}>
                {p.title}
              </Link>{' '}
              <span className="text-ink-700/50">({p.id})</span>
            </li>
          ))}
          {!data.periods.length ? <li className="text-ink-700/60">دوره‌ای نیست</li> : null}
        </ul>
      </section>

      <section className="card">
        <h2 className="font-bold">نشست‌ها</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data.sessions.map((s) => (
            <li key={s.id}>
              {s.deviceId} — {faDate(s.createdAt)}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="font-bold">دوستان</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data.friends.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2">
              <span>
                {f.displayName} {f.phone || f.email || ''}
              </span>
              <button type="button" className="btn-ghost text-danger" onClick={() => setFriendId(f.id)}>
                حذف
              </button>
            </li>
          ))}
          {!data.friends.length ? <li className="text-ink-700/60">ندارد</li> : null}
        </ul>
      </section>

      <ConfirmDialog
        open={Boolean(friendId)}
        title="حذف دوست"
        message="این دوست از لیست کاربر حذف می‌شود."
        confirmLabel="حذف"
        danger
        onClose={() => setFriendId(null)}
        onConfirm={() => {
          const fid = friendId;
          setFriendId(null);
          if (!fid) return;
          void api(`/admin/users/${u.id}/friends/${fid}`, { method: 'DELETE' })
            .then(() => load())
            .then(() => setToast('حذف شد', 'success'))
            .catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'));
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="حذف حساب"
        message="حساب به‌صورت نرم حذف و اطلاعات تماس پاک می‌شود."
        confirmLabel="حذف"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void api(`/admin/users/${u.id}/delete`, { method: 'POST' })
            .then(() => load())
            .then(() => setToast('حذف شد', 'success'))
            .catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'));
        }}
      />
      <ConfirmDialog
        open={confirm === 'ban'}
        title="مسدود کردن"
        message="کاربر از همه دستگاه‌ها خارج می‌شود و دیگر وارد نمی‌شود."
        confirmLabel="مسدود"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void api<{ user: AdminUser }>(`/admin/users/${u.id}/ban`, { method: 'POST' })
            .then((res) => setData({ ...data, user: res.user }))
            .then(() => load())
            .then(() => setToast('مسدود شد', 'success'))
            .catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'));
        }}
      />
      <ConfirmDialog
        open={confirm === 'unban'}
        title="رفع مسدودی"
        message="کاربر دوباره می‌تواند وارد شود."
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void api<{ user: AdminUser }>(`/admin/users/${u.id}/unban`, { method: 'POST' })
            .then((res) => setData({ ...data, user: res.user }))
            .then(() => load())
            .then(() => setToast('رفع شد', 'success'))
            .catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'));
        }}
      />
      <ConfirmDialog
        open={confirm === 'revoke'}
        title="ابطال نشست‌ها"
        message="کاربر از همه دستگاه‌ها خارج می‌شود."
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void api(`/admin/users/${u.id}/revoke-sessions`, { method: 'POST' })
            .then(() => load())
            .then(() => setToast('نشست‌ها باطل شد', 'success'))
            .catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'));
        }}
      />
      <ConfirmDialog
        open={confirm === 'impersonate'}
        title="ورود به جای کاربر"
        message="اپ در تب جدید با نشست یک‌ساعته پشتیبانی باز می‌شود."
        confirmLabel="باز کردن اپ"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void api<{ appUrl: string }>(`/admin/users/${u.id}/impersonate`, { method: 'POST' })
            .then((res) => {
              window.open(res.appUrl, '_blank', 'noopener');
              setToast('لینک ورود پشتیبانی باز شد', 'success');
            })
            .catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'));
        }}
      />
      <ConfirmDialog
        open={confirm === 'avatar'}
        title="حذف آواتار"
        message="عکس پروفایل این کاربر پاک می‌شود."
        confirmLabel="حذف"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void api<{ user: AdminUser }>(`/admin/users/${u.id}/avatar`, { method: 'DELETE' })
            .then((res) =>
              setData({ ...data, user: res.user, avatarDataUrl: undefined, avatarPreset: undefined }),
            )
            .then(() => setToast('آواتار حذف شد', 'success'))
            .catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'));
        }}
      />
      <ConfirmDialog
        open={confirm === 'cover'}
        title="حذف بک‌گراند"
        message="بک‌گراند پروفایل این کاربر پاک می‌شود."
        confirmLabel="حذف"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void api<{ user: AdminUser }>(`/admin/users/${u.id}/cover`, { method: 'DELETE' })
            .then((res) =>
              setData({ ...data, user: res.user, profileCoverDataUrl: undefined, profileCoverPreset: undefined }),
            )
            .then(() => setToast('بک‌گراند حذف شد', 'success'))
            .catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'));
        }}
      />
      <ConfirmDialog
        open={confirm === 'premium'}
        title="اعطای پریمیوم"
        message="۳۰ روز پریمیوم برای این کاربر ثبت شود؟ (پس از تأیید می‌توانید یک سال هم بدهید)"
        confirmLabel="۳۰ روز"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void grantPremium(30).catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'));
        }}
      />
      <ConfirmDialog
        open={confirm === 'revoke-premium'}
        title="لغو پریمیوم"
        message="پلن کاربر به رایگان برمی‌گردد."
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void revokePremium().catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'));
        }}
      />
      {!u.deletedAt ? (
        <div className="flex gap-2 text-xs text-ink-700/60">
          <button type="button" className="btn-ghost" onClick={() => void grantPremium(365).catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'))}>
            اعطای یک‌ساله
          </button>
        </div>
      ) : null}
    </div>
  );
}
