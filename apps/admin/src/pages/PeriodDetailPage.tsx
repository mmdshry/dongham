import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { ConfirmDialog, Modal, PageLoading } from '../components/ui';
import { Icon } from '../components/Icon';
import { api, faDate, faNum } from '../lib/api';
import { useSession } from '../lib/session';
import type {
  AttachmentRow,
  ChatRow,
  Expense,
  InviteRow,
  Member,
  Payment,
  PeriodListItem,
  RecurringRule,
} from '../lib/types';

type Detail = {
  period: PeriodListItem & { visibility?: 'private' | 'public'; kind?: string; template?: string; encrypted?: boolean };
  members: Member[];
  expenses: Expense[];
  payments: Payment[];
  chat: ChatRow[];
  recurring: RecurringRule[];
  invites: InviteRow[];
  attachments: AttachmentRow[];
  activity: { id: string; actorName: string; summary: string; createdAt: string }[];
};

const KINDS = [
  { id: 'split', label: 'تقسیم کلاسیک' },
  { id: 'banker', label: 'گنجه‌بان' },
  { id: 'pot', label: 'صندوق مشترک' },
];

const TEMPLATES = [
  { id: 'travel', label: 'سفر دوستانه' },
  { id: 'household', label: 'هم‌خانگی' },
  { id: 'work', label: 'ناهار محل کار' },
  { id: 'family', label: 'خانواده' },
  { id: 'dorm', label: 'خوابگاه' },
  { id: 'ziarat', label: 'سفر زیارتی' },
  { id: 'wedding', label: 'جشن / عروسی' },
  { id: 'building', label: 'شارژ ساختمان' },
  { id: 'custom', label: 'سفارشی' },
];

function ReceiptPreview({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void api<{ dataUrl?: string }>(path)
      .then((row) => {
        if (!cancelled) setUrl(row.dataUrl || null);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (!url) return null;
  if (url.startsWith('data:image')) {
    return <img src={url} alt="رسید" className="mt-1 max-h-24 rounded border" />;
  }
  return (
    <a href={url} download className="mt-1 inline-block text-xs text-brand-800">
      دانلود رسید
    </a>
  );
}

type DeleteTarget =
  | { type: 'expense' | 'payment' | 'member' | 'chat' | 'recurring' | 'attachment' | 'receipt'; id: string }
  | { type: 'invite'; id: string }
  | { type: 'period'; id: string };

export function PeriodDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setToast } = useSession();
  const [data, setData] = useState<Detail | null>(null);
  const [title, setTitle] = useState('');
  const [currency, setCurrency] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [kind, setKind] = useState('split');
  const [template, setTemplate] = useState('custom');
  const [encrypted, setEncrypted] = useState(false);
  const [ownerId, setOwnerId] = useState('');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const load = async () => {
    if (!id) return;
    const res = await api<Detail>(`/admin/periods/${id}`);
    setData(res);
    setTitle(res.period.title);
    setCurrency(res.period.currency);
    setVisibility(res.period.visibility === 'public' ? 'public' : 'private');
    setKind(res.period.kind || 'split');
    setTemplate(res.period.template || 'custom');
    setEncrypted(Boolean(res.period.encrypted));
    setOwnerId(res.period.ownerId);
  };

  useEffect(() => {
    void load().catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'));
  }, [id]);

  if (!data) return <PageLoading />;
  const p = data.period;
  const memberName = (mid: string) => data.members.find((m) => m.id === mid)?.displayName || mid;

  const savePeriod = async () => {
    await api(`/admin/periods/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title, currency, visibility, kind, template, encrypted, ownerId }),
    });
    await load();
    setToast('دوره ذخیره شد', 'success');
  };

  const saveExpense = async () => {
    if (!editingExpense) return;
    await api(`/admin/periods/${p.id}/expenses/${editingExpense.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: expTitle, amount: Number(expAmount) }),
    });
    setEditingExpense(null);
    await load();
    setToast('هزینه ذخیره شد', 'success');
  };

  const deletePath = (target: DeleteTarget) => {
    if (target.type === 'expense') return `/admin/periods/${p.id}/expenses/${target.id}`;
    if (target.type === 'payment') return `/admin/periods/${p.id}/payments/${target.id}`;
    if (target.type === 'member') return `/admin/periods/${p.id}/members/${target.id}`;
    if (target.type === 'chat') return `/admin/periods/${p.id}/chat/${target.id}`;
    if (target.type === 'recurring') return `/admin/periods/${p.id}/recurring/${target.id}`;
    if (target.type === 'invite') return `/admin/periods/${p.id}/invites/${encodeURIComponent(target.id)}`;
    if (target.type === 'attachment') return `/admin/periods/${p.id}/attachments/${target.id}`;
    if (target.type === 'receipt') return `/admin/periods/${p.id}/expenses/${target.id}/attachment`;
    return `/admin/periods/${p.id}`;
  };

  const runDelete = async () => {
    if (!deleteTarget) return;
    const wasPeriod = deleteTarget.type === 'period';
    await api(deletePath(deleteTarget), { method: 'DELETE' });
    setDeleteTarget(null);
    if (wasPeriod) {
      setToast('دوره حذف شد', 'success');
      navigate('/periods');
      return;
    }
    await load();
    setToast('حذف شد', 'success');
  };

  return (
    <div className="animate-rise space-y-5">
      <Link to="/periods" className="inline-flex items-center gap-1 text-sm text-brand-800">
        <Icon icon={ChevronRight} size={16} />
        دوره‌ها
      </Link>
      <h1 className="text-2xl font-extrabold">{p.title}</h1>
      <p className="text-xs text-ink-700/60">
        نسخه {faNum(p.version)} — {p.id}
      </p>

      <div className="card grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">عنوان</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">ارز</label>
          <input className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </div>
        <div>
          <label className="label">نمایش</label>
          <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as 'private' | 'public')}>
            <option value="private">خصوصی</option>
            <option value="public">عمومی</option>
          </select>
        </div>
        <div>
          <label className="label">نوع</label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">قالب</label>
          <select className="input" value={template} onChange={(e) => setTemplate(e.target.value)}>
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">صاحب (شناسه کاربر)</label>
          <input className="input" dir="ltr" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={encrypted} onChange={(e) => setEncrypted(e.target.checked)} />
          رمز ستون‌های حساس روی سرور (یادداشت، رسید، چت، کارت/شبا)
        </label>
        <div className="sm:col-span-3 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => void savePeriod().catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'))}>
            ذخیره مشخصات
          </button>
          <button type="button" className="btn-danger" onClick={() => setDeleteTarget({ type: 'period', id: p.id })}>
            حذف کل دوره
          </button>
        </div>
      </div>

      <section>
        <h2 className="mb-2 font-bold">اعضا</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>نام</th>
                <th>نقش</th>
                <th>موبایل</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.id}>
                  <td>{m.displayName}</td>
                  <td>
                    <select
                      className="input"
                      value={m.role}
                      onChange={(e) =>
                        void api(`/admin/periods/${p.id}/members/${m.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ role: e.target.value }),
                        })
                          .then(() => load())
                          .catch((err) => setToast(err instanceof Error ? err.message : 'خطا', 'error'))
                      }
                    >
                      <option value="owner">صاحب</option>
                      <option value="manager">مدیر</option>
                      <option value="member">عضو</option>
                      <option value="viewer">بیننده</option>
                    </select>
                  </td>
                  <td dir="ltr">{m.phone || '—'}</td>
                  <td>
                    <button type="button" className="btn-ghost text-danger" onClick={() => setDeleteTarget({ type: 'member', id: m.id })}>
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">هزینه‌ها</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>عنوان</th>
                <th>مبلغ</th>
                <th>تاریخ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.expenses.map((e) => (
                <tr key={e.id} className={e.deletedAt ? 'opacity-50' : ''}>
                  <td>
                    {e.title}
                    {e.deletedAt ? <span className="mr-2 text-xs">حذف‌شده</span> : null}
                    {e.hasAttachment ? (
                      <span className="mr-2 text-xs text-brand-800">رسید</span>
                    ) : null}
                    {e.hasAttachment ? (
                      <ReceiptPreview path={`/admin/periods/${p.id}/expenses/${e.id}/receipt`} />
                    ) : null}
                  </td>
                  <td>
                    {faNum(e.amount)} {e.currency}
                  </td>
                  <td>{faDate(e.createdAt)}</td>
                  <td className="space-x-2 space-x-reverse">
                    {!e.deletedAt ? (
                      <>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => {
                            setEditingExpense(e);
                            setExpTitle(e.title);
                            setExpAmount(String(e.amount));
                          }}
                        >
                          ویرایش
                        </button>
                        {e.hasAttachment ? (
                          <button type="button" className="btn-ghost" onClick={() => setDeleteTarget({ type: 'receipt', id: e.id })}>
                            حذف رسید
                          </button>
                        ) : null}
                        <button type="button" className="btn-ghost text-danger" onClick={() => setDeleteTarget({ type: 'expense', id: e.id })}>
                          حذف
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">تسویه / قرض</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>از</th>
                <th>به</th>
                <th>مبلغ</th>
                <th>وضعیت</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((pay) => (
                <tr key={pay.id} className={pay.deletedAt ? 'opacity-50' : ''}>
                  <td>{memberName(pay.fromMemberId)}</td>
                  <td>{memberName(pay.toMemberId)}</td>
                  <td>
                    {faNum(pay.amount)} {pay.currency}
                    {pay.hasReceipt ? (
                      <ReceiptPreview path={`/admin/periods/${p.id}/payments/${pay.id}/receipt`} />
                    ) : null}
                  </td>
                  <td>
                    {!pay.deletedAt ? (
                      <select
                        className="input"
                        value={pay.status || 'settled'}
                        onChange={(e) =>
                          void api(`/admin/periods/${p.id}/payments/${pay.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: e.target.value }),
                          })
                            .then(() => load())
                            .catch((err) => setToast(err instanceof Error ? err.message : 'خطا', 'error'))
                        }
                      >
                        <option value="sent">ارسال‌شده</option>
                        <option value="pending_confirm">در انتظار تأیید</option>
                        <option value="settled">تسویه‌شده</option>
                      </select>
                    ) : (
                      'حذف‌شده'
                    )}
                  </td>
                  <td>
                    {!pay.deletedAt ? (
                      <button type="button" className="btn-ghost text-danger" onClick={() => setDeleteTarget({ type: 'payment', id: pay.id })}>
                        حذف
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">چت</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>فرستنده</th>
                <th>پیام</th>
                <th>تاریخ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.chat.map((m) => (
                <tr key={m.id}>
                  <td>{memberName(m.senderMemberId)}</td>
                  <td className="max-w-xs truncate">{m.body}</td>
                  <td>{faDate(m.createdAt)}</td>
                  <td>
                    <button type="button" className="btn-ghost text-danger" onClick={() => setDeleteTarget({ type: 'chat', id: m.id })}>
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
              {!data.chat.length ? (
                <tr>
                  <td colSpan={4} className="text-ink-700/60">
                    پیامی نیست
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">هزینه تکراری</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>عنوان</th>
                <th>مبلغ</th>
                <th>بعدی</th>
                <th>وضعیت</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.recurring.map((r) => (
                <tr key={r.id}>
                  <td>{r.title}</td>
                  <td>
                    {faNum(r.amount)} {r.currency}
                  </td>
                  <td>{faDate(r.nextAt)}</td>
                  <td>{r.active ? 'فعال' : 'خاموش'}</td>
                  <td className="space-x-2 space-x-reverse">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() =>
                        void api(`/admin/periods/${p.id}/recurring/${r.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ active: !r.active }),
                        })
                          .then(() => load())
                          .then(() => setToast(r.active ? 'خاموش شد' : 'فعال شد', 'success'))
                          .catch((err) => setToast(err instanceof Error ? err.message : 'خطا', 'error'))
                      }
                    >
                      {r.active ? 'خاموش' : 'فعال'}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() =>
                        void api(`/admin/periods/${p.id}/recurring/${r.id}/run`, { method: 'POST' })
                          .then(() => load())
                          .then(() => setToast('اجرا شد', 'success'))
                          .catch((err) => setToast(err instanceof Error ? err.message : 'خطا', 'error'))
                      }
                    >
                      اجرا
                    </button>
                    <button type="button" className="btn-ghost text-danger" onClick={() => setDeleteTarget({ type: 'recurring', id: r.id })}>
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
              {!data.recurring.length ? (
                <tr>
                  <td colSpan={5} className="text-ink-700/60">
                    موردی نیست
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">دعوت‌ها</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>توکن</th>
                <th>تاریخ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.invites.map((inv) => (
                <tr key={inv.token}>
                  <td dir="ltr">{inv.token}</td>
                  <td>{faDate(inv.createdAt)}</td>
                  <td>
                    <button type="button" className="btn-ghost text-danger" onClick={() => setDeleteTarget({ type: 'invite', id: inv.token })}>
                      ابطال
                    </button>
                  </td>
                </tr>
              ))}
              {!data.invites.length ? (
                <tr>
                  <td colSpan={3} className="text-ink-700/60">
                    دعوتی نیست
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">پیوست‌ها</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>شناسه</th>
                <th>نوع</th>
                <th>حجم</th>
                <th>تاریخ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.attachments.map((a) => (
                <tr key={a.id}>
                  <td dir="ltr">{a.id}</td>
                  <td>{a.mime}</td>
                  <td>{faNum(a.bytes)}</td>
                  <td>{faDate(a.createdAt)}</td>
                  <td>
                    <button type="button" className="btn-ghost text-danger" onClick={() => setDeleteTarget({ type: 'attachment', id: a.id })}>
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
              {!data.attachments.length ? (
                <tr>
                  <td colSpan={5} className="text-ink-700/60">
                    پیوستی نیست
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="font-bold">فعالیت دوره</h2>
        <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs text-ink-700/80">
          {data.activity
            .slice()
            .reverse()
            .map((a) => (
              <li key={a.id}>
                {faDate(a.createdAt)} — {a.actorName}: {a.summary}
              </li>
            ))}
        </ul>
      </section>

      <Modal open={Boolean(editingExpense)} onClose={() => setEditingExpense(null)} title="ویرایش هزینه">
        <div className="mt-3 space-y-3">
          <div>
            <label className="label" htmlFor="admin-exp-title">عنوان</label>
            <input id="admin-exp-title" className="input" value={expTitle} onChange={(e) => setExpTitle(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="admin-exp-amount">مبلغ</label>
            <input id="admin-exp-amount" className="input" dir="ltr" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setEditingExpense(null)}>
              انصراف
            </button>
            <button type="button" className="btn-primary" onClick={() => void saveExpense().catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'))}>
              ذخیره
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.type === 'period' ? 'حذف کل دوره' : 'حذف'}
        message={
          deleteTarget?.type === 'period'
            ? 'دوره و همهٔ اعضا، هزینه، چت، دعوت و پیوست‌های وابسته حذف می‌شوند.'
            : 'این مورد از دفتر حذف می‌شود و نسخهٔ دوره بالا می‌رود تا دستگاه‌ها همگام شوند.'
        }
        confirmLabel="حذف"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void runDelete().catch((e) => setToast(e instanceof Error ? e.message : 'خطا', 'error'))}
      />
    </div>
  );
}
