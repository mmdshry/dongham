import { useLiveQuery } from 'dexie-react-hooks';
import { nanoid } from 'nanoid';
import { useState } from 'react';
import { ConfirmDialog } from '../components/Dialog';
import { EmptyState, Shell } from '../components/ui';
import { api, ensureProfile } from '../lib/api';
import { db } from '../lib/db';
import { pickIranContacts } from '../lib/contacts';
import { friendContactTaken } from '../lib/friends';
import { isValidIranMobile, normalizeEmail, normalizeIranMobile, toPersianDigits } from '../lib/format';
import { usePersianDigits } from '../lib/usePersianDigits';
import { useUiStore } from '../store/ui';

export function FriendsPage() {
  const setToast = useUiStore((s) => s.setToast);
  const persian = usePersianDigits();
  const friends = useLiveQuery(() => db.friends.toArray(), []) || [];
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setEditingId(null);
  };

  const persistCloud = async (
    method: 'POST' | 'PUT' | 'DELETE',
    friend: { id: string; displayName: string; phone?: string; email?: string },
  ) => {
    const profile = await ensureProfile();
    if (!profile.token) return;
    const path = method === 'POST' ? '/friends' : `/friends/${friend.id}`;
    try {
      await api(path, {
        method,
        body: method === 'DELETE' ? undefined : JSON.stringify(friend),
      });
    } catch {
      /* offline ok */
    }
  };

  const save = async () => {
    if (!name.trim()) return;
    if (phone.trim() && !isValidIranMobile(phone)) {
      setToast('شماره موبایل نامعتبر است');
      return;
    }
    const taken = friendContactTaken(friends, { phone, email }, editingId || undefined);
    if (taken === 'phone') {
      setToast('این شماره قبلاً برای دوست دیگری ثبت شده');
      return;
    }
    if (taken === 'email') {
      setToast('این ایمیل قبلاً برای دوست دیگری ثبت شده');
      return;
    }
    const friend = {
      id: editingId || nanoid(),
      displayName: name.trim(),
      phone: normalizeIranMobile(phone) || undefined,
      email: normalizeEmail(email) || email.trim() || undefined,
    };
    await db.friends.put(friend);
    await persistCloud(editingId ? 'PUT' : 'POST', friend);
    setToast(editingId ? 'دوست ویرایش شد' : 'به لیست دوستان اضافه شد');
    resetForm();
  };

  const startEdit = (id: string) => {
    const f = friends.find((row) => row.id === id);
    if (!f) return;
    setEditingId(f.id);
    setName(f.displayName);
    setPhone(f.phone || '');
    setEmail(f.email || '');
  };

  const remove = async () => {
    if (!deleteId) return;
    const id = deleteId;
    await db.friends.delete(id);
    await persistCloud('DELETE', { id, displayName: '' });
    if (editingId === id) resetForm();
    setDeleteId(null);
    setToast('دوست حذف شد');
  };

  return (
    <Shell title="دوستام">
      <div className="mx-auto max-w-lg space-y-4 animate-rise">
        <div className="card-surface space-y-3">
          <p className="text-xs text-ink-700/70">می‌توانید افراد را مستقیم به دوره هم اضافه کنید؛ لیست دوستان اختیاری است.</p>
          <input className="input" placeholder="نام" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="موبایل (اختیاری) ۰۹۱۲…" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" />
          {phone.trim() && !isValidIranMobile(phone) ? <p className="text-xs text-amber-800">شماره موبایل ایرانی معتبر نیست</p> : null}
          <input className="input" placeholder="ایمیل (اختیاری)" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
          <button type="button" className="btn-primary w-full" onClick={() => void save()}>
            {editingId ? 'ذخیره تغییرات' : 'افزودن'}
          </button>
          {editingId ? (
            <button type="button" className="btn-ghost w-full" onClick={resetForm}>
              انصراف از ویرایش
            </button>
          ) : null}
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={async () => {
              try {
                const rows = await pickIranContacts();
                const next = [...friends];
                let added = 0;
                for (const r of rows) {
                  const phone = normalizeIranMobile(r.phone) || undefined;
                  if (friendContactTaken(next, { phone })) continue;
                  const row = { id: nanoid(), displayName: r.displayName, phone };
                  await db.friends.put(row);
                  next.push(row);
                  added += 1;
                  void persistCloud('POST', row);
                }
                setToast(
                  added
                    ? `${toPersianDigits(added, persian)} مخاطب اضافه شد`
                    : 'مخاطب جدیدی اضافه نشد؛ شماره تکراری بود',
                );
              } catch (e) {
                setToast(e instanceof Error ? e.message : 'انتخاب مخاطب ممکن نشد');
              }
            }}
          >
            ورود از مخاطبین گوشی
          </button>
        </div>
        {friends.length === 0 ? (
          <EmptyState title="دوستی ثبت نشده" />
        ) : (
          <ul className="space-y-2">
            {friends.map((f) => (
              <li key={f.id} className="card-surface flex items-center justify-between gap-3 text-sm">
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clay/25 text-sm font-bold text-clay-800"
                  aria-hidden
                >
                  {f.displayName.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{f.displayName}</p>
                  {f.phone || f.email ? (
                    <p className="mt-0.5 text-xs text-ink-700/60" dir="ltr">
                      {f.phone || f.email}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="btn-ghost !px-3 !py-1 !text-xs" onClick={() => startEdit(f.id)}>
                    ویرایش
                  </button>
                  <button type="button" className="btn-ghost !px-3 !py-1 !text-xs text-rose-700" onClick={() => setDeleteId(f.id)}>
                    حذف
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={!!deleteId}
        title="حذف دوست"
        message="این فرد از دفترچه دوستان حذف می‌شود. عضوهای دوره تغییر نمی‌کنند."
        confirmLabel="حذف"
        danger
        onClose={() => setDeleteId(null)}
        onConfirm={() => void remove()}
      />
    </Shell>
  );
}
