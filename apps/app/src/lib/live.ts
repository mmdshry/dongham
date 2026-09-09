import { ApiError, api, ensureProfile } from './api';
import { db, type LocalChat, type LocalNotification } from './db';
import { pullCloud, pullFriends, pullPeriod, setLiveConnected } from './sync';

export type LiveEvent =
  | { type: 'chat'; periodId: string; message: Omit<LocalChat, 'synced'> }
  | { type: 'period'; periodId: string; version: number }
  | { type: 'notification'; notification: LocalNotification }
  | { type: 'friends' };

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export async function applyLiveEvents(events: LiveEvent[]): Promise<void> {
  const stillPending = new Set<string>();
  try {
    const row = await db.meta.get('pendingNotificationReads');
    const parsed = row?.value ? (JSON.parse(row.value) as unknown) : [];
    if (Array.isArray(parsed)) {
      for (const id of parsed) if (typeof id === 'string') stillPending.add(id);
    }
  } catch {
    /* ignore */
  }
  const periodIds = new Set<string>();
  let friends = false;
  for (const ev of events) {
    if (ev.type === 'chat' && ev.message) {
      await db.chat.put({ ...ev.message, synced: true });
    } else if (ev.type === 'period' && ev.periodId) {
      periodIds.add(ev.periodId);
    } else if (ev.type === 'notification' && ev.notification) {
      await db.notifications.put({
        ...ev.notification,
        read: ev.notification.read || stillPending.has(ev.notification.id),
      });
    } else if (ev.type === 'friends') {
      friends = true;
    }
  }
  for (const periodId of periodIds) {
    try {
      await pullPeriod(periodId);
    } catch {
      /* snapshot may 404 if access was revoked */
    }
  }
  if (friends) {
    try {
      await pullFriends();
    } catch {
      /* optional */
    }
  }
}

export function startLiveLoop(): () => void {
  const ac = new AbortController();
  let stopped = false;
  let backoff = 1000;

  const run = async () => {
    while (!stopped && !ac.signal.aborted) {
      const profile = await ensureProfile();
      if (!profile.token || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        setLiveConnected(false);
        await sleep(1000, ac.signal);
        continue;
      }
      try {
        const { events } = await api<{ events: LiveEvent[] }>('/live?wait=25', { signal: ac.signal });
        setLiveConnected(true);
        backoff = 1000;
        if (events?.length) await applyLiveEvents(events);
      } catch (e) {
        if (stopped || ac.signal.aborted) return;
        setLiveConnected(false);
        if (e instanceof ApiError && e.status === 401) {
          await sleep(5000, ac.signal);
          continue;
        }
        await sleep(backoff, ac.signal);
        backoff = Math.min(backoff * 2, 15_000);
      }
    }
  };
  void run();

  const onVisible = () => {
    if (document.visibilityState === 'visible') void pullCloud();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    setLiveConnected(false);
    ac.abort();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
