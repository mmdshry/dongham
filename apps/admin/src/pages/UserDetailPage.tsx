import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ui';
import { isPremium } from '@dongham/ledger';
import { api, faDate } from '../lib/api';
import { useSession } from '../lib/session';
import type { AdminUser } from '../lib/types';

type Notif = { id: string; title: string; body: string; read: boolean; createdAt: string };

type Detail = {
  user: AdminUser;
  periods: { id: string; title: string; currency: string; ownerId: string; createdAt: string; version: number }[];
  sessions: { id: string; deviceId: string; createdAt: string }[];
  friends: { id: string; displayName: string; phone?: string; email?: string }[];
};

export function UserDetailPage() {
  const { id } = useParams();
  const { setToast } = useSession();
  const [data, setData] = useState<Detail | null>(null);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [name, setName] = useState('');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [confirm, setConfirm] = useState<'delete' | 'revoke' | 'impersonate' | 'premium' | 'revoke-premium' | 'ban' | 'unban' | null>(null);
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
    void load().catch((e) => setToast(e instanceof Error ? e.message : 'خطا'));
  }, [id]);

  if (!data) return <p className="text-sm text-ink-700/70">در حال بارگذاری…</p>;
  const u = data.user;

  const saveName = async () => {
    try {
      const res = await api<{ user: AdminUser }>(`/admin/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ displayName: name }),
      });
      setData({ ...data, user: res.user });
      setToast('ذخیره شد');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'خطا');
    }
  };

  const grantPremium = async (days: number) => {
    const res = await api<{ user: AdminUser }>(`/admin/users/${u.id}/premium`, {
      method: 'POST',
      body: JSON.stringify({ days }),
    });
    setData({ ...data, user: res.user });
    setToast('پریمیوم اعمال شد');
  };

  const revokePremium = async () => {
    const res = await api<{ user: AdminUser }>(`/admin/users/${u.id}/premium`, {
      method: 'POST',
      body: JSON.stringify({ revoke: true }),
    });
    setData({ ...data, user: res.user });
    setToast('پریمیوم برداشته شد');
  };

  const sendNotif = async () => {
    await api('/admin/notifications', {
      method: 'POST',
      body: JSON.stringify({ userId: u.id, title: notifTitle, body: notifBody }),
    });
    setNotifTitle('');
    setNotifBody('');
    await load();
    setToast('نوتیف ارسال شد');
  };

  return (
    <div className="animate-rise space-y-5">
      <Link to="/users" className="text-sm text-brand-800">
        ← کاربران
      </Link>
      <h1 className="text-2xl font-extrabold">{u.displayName}</h1>
      {u.deletedAt ? <p className="text-sm text-rose-700">این حساب حذف شده است ({faDate(u.deletedAt)})</p> : null}
      {u.bannedAt ? <p className="text-sm text-rose-700">مسدود از {faDate(u.bannedAt)}</p> : null}

      <div className="card space-y-3">
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
                .catch((e) => setToast(e instanceof Error ? e.message : 'خطا'))
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
        <button type="button" className="btn-primary" onClick={() => void sendNotif().catch((e) => setToast(e instanceof Error ? e.message : 'خطا'))}>
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
              <button type="button" className="btn-ghost text-rose-700" onClick={() => setFriendId(f.id)}>
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
            .then(() => setToast('حذف شد'))
            .catch((e) => setToast(e instanceof Error ? e.message : 'خطا'));
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
            .then(() => setToast('حذف شد'))
            .catch((e) => setToast(e instanceof Error ? e.message : 'خطا'));
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
            .then(() => setToast('مسدود شد'))
            .catch((e) => setToast(e instanceof Error ? e.message : 'خطا'));
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
            .then(() => setToast('رفع شد'))
            .catch((e) => setToast(e instanceof Error ? e.message : 'خطا'));
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
            .then(() => setToast('نشست‌ها باطل شد'))
            .catch((e) => setToast(e instanceof Error ? e.message : 'خطا'));
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
              setToast('لینک ورود پشتیبانی باز شد');
            })
            .catch((e) => setToast(e instanceof Error ? e.message : 'خطا'));
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
          void grantPremium(30).catch((e) => setToast(e instanceof Error ? e.message : 'خطا'));
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
          void revokePremium().catch((e) => setToast(e instanceof Error ? e.message : 'خطا'));
        }}
      />
      {!u.deletedAt ? (
        <div className="flex gap-2 text-xs text-ink-700/60">
          <button type="button" className="btn-ghost" onClick={() => void grantPremium(365).catch((e) => setToast(e instanceof Error ? e.message : 'خطا'))}>
            اعطای یک‌ساله
          </button>
        </div>
      ) : null}
    </div>
  );
}
