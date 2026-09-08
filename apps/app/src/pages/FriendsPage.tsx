import { useLiveQuery } from 'dexie-react-hooks';
import { nanoid } from 'nanoid';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { ConfirmDialog } from '../components/Dialog';
import { EmptyState, Shell } from '../components/ui';
import { UserAvatar } from '../components/UserAvatar';
import { useAvatarMap } from '../lib/avatarCache';
import { db } from '../lib/db';
import { pickIranContacts } from '../lib/contacts';
import { friendContactTaken, persistFriendCloud } from '../lib/friends';
import { isValidIranMobile, normalizeEmail, normalizeIranMobile, toPersianDigits } from '../lib/format';
import { usePersianDigits } from '../lib/usePersianDigits';
import { useUiStore } from '../store/ui';

export function FriendsPage() {
  const navigate = useNavigate();
  const setToast = useUiStore((s) => s.setToast);
  const persian = usePersianDigits();
  const friends = useLiveQuery(() => db.friends.toArray(), []) || [];
  const avatarByUserId = useAvatarMap(friends.map((f) => f.friendUserId));
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

  const persistCloud = persistFriendCloud;

  const save = async () => {
    if (!name.trim()) return;
    if (phone.trim() && !isValidIranMobile(phone)) {
      setToast('شماره موبایل نامعتبر است', 'error');
      return;
    }
    const taken = friendContactTaken(friends, { phone, email }, editingId || undefined);
    if (taken === 'phone') {
      setToast('این شماره قبلاً برای دوست دیگری ثبت شده', 'error');
      return;
    }
    if (taken === 'email') {
      setToast('این ایمیل قبلاً برای دوست دیگری ثبت شده', 'error');
      return;
    }
    const prev = editingId ? friends.find((row) => row.id === editingId) : undefined;
    const friend = {
      id: editingId || nanoid(),
      displayName: name.trim(),
      phone: normalizeIranMobile(phone) || undefined,
      email: normalizeEmail(email) || email.trim() || undefined,
      friendUserId: prev?.friendUserId,
    };
    await db.friends.put(friend);
    await persistFriendCloud(editingId ? 'PUT' : 'POST', friend);
    setToast(editingId ? 'دوست ویرایش شد' : 'به لیست دوستان اضافه شد', 'success');
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
    await persistFriendCloud('DELETE', { id, displayName: '' });
    if (editingId === id) resetForm();
    setDeleteId(null);
    setToast('دوست حذف شد', 'success');
  };

  return (
    <Shell title="دوستام" back={() => navigate('/profile')}>
      <div className="mx-auto max-w-lg space-y-4 animate-rise">
        <div className="card-surface space-y-3">
          <p className="text-xs text-ink-700/70">می‌توانید افراد را مستقیم به دوره هم اضافه کنید؛ لیست دوستان اختیاری است.</p>
          <div>
            <label className="label" htmlFor="friend-name">نام</label>
            <input id="friend-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label className="label" htmlFor="friend-phone">موبایل (اختیاری)</label>
            <input id="friend-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => {
              if (phone.trim() && !isValidIranMobile(phone)) setToast('شماره موبایل ایرانی معتبر نیست', 'error');
            }} dir="ltr" inputMode="tel" autoComplete="tel" />
          </div>
          <div>
            <label className="label" htmlFor="friend-email">ایمیل (اختیاری)</label>
            <input id="friend-email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" autoComplete="email" />
          </div>
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
                  added ? 'success' : 'warn',
                );
              } catch (e) {
                setToast(e instanceof Error ? e.message : 'انتخاب مخاطب ممکن نشد', 'error');
              }
            }}
          >
            ورود از مخاطبین گوشی
          </button>
        </div>
        {friends.length === 0 ? (
          <EmptyState icon={Users} title="دوستی ثبت نشده" />
        ) : (
          <ul className="space-y-2">
            {friends.map((f) => (
              <li key={f.id} className="card-surface flex items-center justify-between gap-3 text-sm">
                <UserAvatar
                  name={f.displayName}
                  src={f.friendUserId ? avatarByUserId[f.friendUserId] : undefined}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{f.displayName}</p>
                  {f.phone || f.email ? (
                    <p className="mt-0.5 text-xs text-ink-700/60" dir="ltr">
                      {f.phone || f.email}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => startEdit(f.id)}>
                    ویرایش
                  </button>
                  <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => setDeleteId(f.id)}>
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
