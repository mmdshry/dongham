import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { flushOutbox, pullCloud } from '../lib/sync';
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

  if (!profile?.token) return null;

  let message = '';
  if (syncConflict) message = syncConflict;
  else if (!online && outboxCount > 0) message = 'آفلاین هستید؛ تغییرات بعد از اتصال ارسال می‌شود.';
  else if (online && outboxCount > 0) message = 'تغییرات این دستگاه هنوز روی سرور نیست.';
  else if (online && serverAhead && outboxCount > 0) message = 'نسخهٔ سرور با این دستگاه یکی نیست.';

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
