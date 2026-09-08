import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { discardRejectedOps, flushOutbox, pullCloud } from '../lib/sync';
import { useConnectionMode } from '../lib/useConnectionMode';
import { useUiStore } from '../store/ui';

const SYNC_TOAST = 'sync';
let syncBusy = false;

/**
 * Sync is REST + outbox with last-write-wins on the server; there is no version conflict
 * to resolve. Queued writes surface as a sticky warning toast with a manual flush.
 */
export function SyncBanner({ periodId }: { periodId?: string }) {
  const { online, signedIn, autoSync } = useConnectionMode();
  const serverAhead = useUiStore((s) => s.serverAhead);
  const setToast = useUiStore((s) => s.setToast);
  const outboxRows =
    useLiveQuery(
      () => (periodId ? db.outbox.where('periodId').equals(periodId).toArray() : db.outbox.toArray()),
      [periodId],
    ) || [];
  const [lastError, setLastError] = useState<string | null>(null);
  const shownKey = useRef('');

  const outboxCount = outboxRows.length;
  const stuck = outboxRows.some((row) => (row.tries || 0) >= 3);
  const periodIds = useMemo(() => [...new Set(outboxRows.map((row) => row.periodId))], [outboxRows]);

  let message = '';
  if (signedIn && !(autoSync && online && !stuck)) {
    if (!online && outboxCount > 0) message = 'آفلاین هستید؛ تغییرات بعد از اتصال ارسال می‌شود.';
    else if (stuck) message = lastError || 'سرور بعضی از تغییرات این دستگاه را نمی‌پذیرد.';
    else if (online && outboxCount > 0) message = 'تغییرات این دستگاه هنوز روی سرور نیست.';
    else if (online && serverAhead) message = 'دادهٔ جدیدتری روی سرور است؛ بعد از ارسال تغییرات این دستگاه دریافت می‌شود.';
  }

  const key = `${message}|${online}|${stuck}|${periodId || ''}`;

  useEffect(() => {
    if (!message) {
      shownKey.current = '';
      const current = useUiStore.getState().toast;
      if (current?.source === SYNC_TOAST) setToast(null);
      return;
    }
    if (shownKey.current === key) return;
    shownKey.current = key;
    setToast(message, 'warn', {
      sticky: true,
      source: SYNC_TOAST,
      actions: online
        ? [
            {
              label: 'همگام‌سازی',
              onClick: () => {
                void (async () => {
                  if (syncBusy) return;
                  syncBusy = true;
                  try {
                    const res = await flushOutbox(periodId);
                    if (res.ok) {
                      setLastError(null);
                      await pullCloud();
                      setToast('همگام شد', 'success');
                    } else {
                      setLastError(res.error || null);
                      setToast(res.error || 'خطا', 'error');
                    }
                  } finally {
                    syncBusy = false;
                  }
                })();
              },
            },
            ...(stuck
              ? [
                  {
                    label: 'کنار گذاشتن تغییرات ردشده',
                    onClick: () => {
                      void (async () => {
                        if (syncBusy) return;
                        syncBusy = true;
                        try {
                          let dropped = 0;
                          for (const pid of periodIds) dropped += await discardRejectedOps(pid);
                          setLastError(null);
                          setToast(
                            dropped ? 'تغییرات ردشده کنار گذاشته شد' : 'چیزی برای حذف نبود',
                            dropped ? 'success' : 'info',
                          );
                          if (dropped) await pullCloud();
                        } finally {
                          syncBusy = false;
                        }
                      })();
                    },
                  },
                ]
              : []),
          ]
        : undefined,
    });
  }, [key, message, online, stuck, periodId, periodIds, setToast]);

  return null;
}
