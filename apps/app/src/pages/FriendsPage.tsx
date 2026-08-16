import { useLiveQuery } from 'dexie-react-hooks';
import { nanoid } from 'nanoid';
import { useState } from 'react';
import { EmptyState, Shell } from '../components/ui';
import { api, ensureProfile } from '../lib/api';
import { db } from '../lib/db';
import { pickIranContacts } from '../lib/contacts';
import { normalizeEmail, normalizeIranMobile, toPersianDigits } from '../lib/format';
import { usePersianDigits } from '../lib/usePersianDigits';
import { useUiStore } from '../store/ui';

export function FriendsPage() {
  const setToast = useUiStore((s) => s.setToast);
  const persian = usePersianDigits();
  const friends = useLiveQuery(() => db.friends.toArray(), []) || [];
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const add = async () => {
    if (!name.trim()) return;
    const friend = {
      id: nanoid(),
      displayName: name.trim(),
      phone: normalizeIranMobile(phone) || phone.trim() || undefined,
      email: normalizeEmail(email) || email.trim() || undefined,
    };
    await db.friends.put(friend);
    const profile = await ensureProfile();
    if (profile.token) {
      try {
        await api('/friends', {
          method: 'POST',
          body: JSON.stringify({ displayName: friend.displayName, phone: friend.phone, email: friend.email }),
        });
      } catch {
        /* offline ok */
      }
    }
    setName('');
    setPhone('');
    setEmail('');
    setToast('به لیست دوستان اضافه شد');
  };

  return (
    <Shell title="دوستان">
      <div className="mx-auto max-w-lg space-y-4 animate-rise">
        <div className="card-surface space-y-3">
          <p className="text-xs text-ink-700/70">می‌توانید افراد را مستقیم به دوره هم اضافه کنید؛ لیست دوستان اختیاری است.</p>
          <input className="input" placeholder="نام" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="موبایل (اختیاری)" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" />
          <input className="input" placeholder="ایمیل (اختیاری)" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
          <button type="button" className="btn-primary w-full" onClick={add}>
            افزودن
          </button>
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={async () => {
              try {
                const rows = await pickIranContacts();
                for (const r of rows) {
                  await db.friends.put({ id: nanoid(), displayName: r.displayName, phone: r.phone });
                }
                setToast(`${toPersianDigits(rows.length, persian)} مخاطب اضافه شد`);
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
                <span className="min-w-0 truncate font-semibold">{f.displayName}</span>
                <span className="shrink-0 text-ink-700/60" dir="ltr">
                  {f.phone || f.email || ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
