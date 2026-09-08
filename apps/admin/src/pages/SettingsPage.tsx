import { useEffect, useState } from 'react';
import { PageLoading } from '../components/ui';
import { api, apiDownload, faDate, faNum } from '../lib/api';
import { useSession } from '../lib/session';
import type { AdminSettings } from '../lib/types';

export function SettingsPage() {
  const { setToast } = useSession();
  const [data, setData] = useState<AdminSettings | null>(null);
  const [phones, setPhones] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await api<AdminSettings>('/admin/settings');
    setData(res);
    setPhones(res.extraAdminPhones.join('\n'));
  };

  useEffect(() => {
    void load().catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'));
  }, [setToast]);

  if (!data) return <PageLoading />;

  const savePhones = async () => {
    const extraAdminPhones = phones
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await api<{ extraAdminPhones: string[] }>('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ extraAdminPhones }),
    });
    setPhones(res.extraAdminPhones.join('\n'));
    setData({ ...data, extraAdminPhones: res.extraAdminPhones });
    setToast('شماره‌ها ذخیره شد', 'success');
  };

  const refreshFx = async () => {
    setBusy(true);
    try {
      const fx = await api<NonNullable<AdminSettings['fx']> & { source: string }>('/admin/fx/refresh', { method: 'POST' });
      setData({ ...data, fx });
      setToast('نرخ ارز نوسازی شد', 'success');
    } finally {
      setBusy(false);
    }
  };

  const broadcast = async () => {
    await api('/admin/notifications', {
      method: 'POST',
      body: JSON.stringify({ all: true, title, body }),
    });
    setTitle('');
    setBody('');
    setToast('نوتیف همگانی ارسال شد', 'success');
  };

  return (
    <div className="animate-rise space-y-6">
      <h1 className="text-2xl font-extrabold">تنظیمات</h1>

      <section className="card grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-ink-700/70">موجودی سناتور</p>
          <p className="mt-1 text-xl font-extrabold text-brand-800">
            {!data.senator.configured
              ? 'پیکربندی نشده'
              : data.senator.error
                ? data.senator.error
                : faNum(data.senator.amount || 0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-700/70">نشست فعال</p>
          <p className="mt-1 text-xl font-extrabold text-brand-800">{faNum(data.sessions)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-700/70">کد یک‌بارمصرف در حال انقضا</p>
          <p className="mt-1 text-xl font-extrabold text-brand-800">{faNum(data.otpsActive)}</p>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">نرخ ارز</h2>
        <p className="text-xs text-ink-700/60">
          {data.fx
            ? `${data.fx.source === 'cache' || !data.fx.source ? 'کش' : data.fx.source} — ${faDate(data.fx.fetchedAt)}`
            : 'کش خالی است'}
        </p>
        {data.fx ? (
          <ul className="grid gap-1 text-sm sm:grid-cols-3">
            {Object.entries(data.fx.rates).map(([code, rate]) => (
              <li key={code}>
                {code}: {faNum(rate)}
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void refreshFx().catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'))}>
          نوسازی نرخ
        </button>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">شماره‌های ادمین</h2>
        <p className="text-xs text-ink-700/60">از محیط (ثابت): {data.envAdminPhones.join('، ') || '—'}</p>
        <label className="label">شماره‌های اضافه (هر خط یکی)</label>
        <textarea className="input min-h-28" dir="ltr" value={phones} onChange={(e) => setPhones(e.target.value)} />
        <button type="button" className="btn-primary" onClick={() => void savePhones().catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'))}>
          ذخیره شماره‌ها
        </button>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">نوتیف همگانی</h2>
        <input className="input" placeholder="عنوان" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input min-h-24" placeholder="متن" value={body} onChange={(e) => setBody(e.target.value)} />
        <button type="button" className="btn-primary" onClick={() => void broadcast().catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'))}>
          ارسال به همه
        </button>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">پشتیبان</h2>
        <p className="text-sm text-ink-700/70">خروجی JSON بدون هش رمز و بدون کد OTP.</p>
        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            void apiDownload('/admin/export', `dongham-export-${new Date().toISOString().slice(0, 10)}.json`)
              .then(() => setToast('دانلود شد', 'success'))
              .catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'))
          }
        >
          دانلود JSON
        </button>
      </section>
    </div>
  );
}
