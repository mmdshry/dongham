import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { flushOutbox, pullCloud, resolveSyncConflict } from '../lib/sync';
import { useUiStore } from '../store/ui';

export function SyncBanner({ periodId }: { periodId?: string }) {
  const online = useUiStore((s) => s.online);
  const syncConflict = useUiStore((s) => s.syncConflict);
  const serverAhead = useUiStore((s) => s.serverAhead);
  const setToast = useUiStore((s) => s.setToast);
  const profile = useLiveQuery(() => db.profile.get('self'));
  const outboxCount =
    useLiveQuery(
      () => (periodId ? db.outbox.where('periodId').equals(periodId).count() : db.outbox.count()),
      [periodId],
    ) || 0;
  const [busy, setBusy] = useState(false);

  if (!profile?.token) return null;

  const conflictVisible = syncConflict && (!periodId || syncConflict.periodId === periodId);

  const resolve = async (choice: 'keep-local' | 'take-server') => {
    setBusy(true);
    try {
      const res = await resolveSyncConflict(choice);
      if (res.ok) await pullCloud();
      setToast(
        res.ok ? (choice === 'take-server' ? 'دادهٔ سرور اعمال شد' : 'همگام شد') : res.error || 'خطا',
      );
    } finally {
      setBusy(false);
    }
  };

  if (conflictVisible && syncConflict) {
    return (
      <div className="mb-4 rounded-2xl bg-amber-50 px-3 py-3 text-sm text-amber-950">
        <p>{syncConflict.message}</p>
        <p className="mt-1 text-amber-900/80">تغییرات این دستگاه و سرور با هم فرق دارند. کدام را نگه می‌دارید؟</p>
        {online ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost !py-1 !text-xs"
              disabled={busy}
              onClick={() => void resolve('keep-local')}
            >
              نگه‌داشتن لوکال
            </button>
            <button
              type="button"
              className="btn-ghost !py-1 !text-xs"
              disabled={busy}
              onClick={() => void resolve('take-server')}
            >
              گرفتن سرور
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  let message = '';
  if (!online && outboxCount > 0) message = 'آفلاین هستید؛ تغییرات بعد از اتصال ارسال می‌شود.';
  else if (online && serverAhead) message = 'نسخهٔ سرور با این دستگاه یکی نیست.';
  else if (online && outboxCount > 0) message = 'تغییرات این دستگاه هنوز روی سرور نیست.';

  if (!message) return null;

  return (
    <div className="mb-4 rounded-2xl bg-amber-50 px-3 py-3 text-sm text-amber-950">
      <p>{message}</p>
      {online ? (
        <button
          type="button"
          className="btn-ghost mt-2 !py-1 !text-xs"
          onClick={async () => {
            const res = await flushOutbox(periodId);
            if (res.ok) await pullCloud();
            setToast(res.ok ? 'همگام شد' : res.error || 'خطا');
          }}
        >
          همگام‌سازی
        </button>
      ) : null}
    </div>
  );
}
