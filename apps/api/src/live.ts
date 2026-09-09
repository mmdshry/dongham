export type LiveChatMessage = {
  id: string;
  periodId: string;
  senderMemberId: string;
  body: string;
  expenseId?: string;
  createdAt: string;
};

export type LiveNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export type LiveEvent =
  | { type: 'chat'; periodId: string; message: LiveChatMessage }
  | { type: 'period'; periodId: string; version: number }
  | { type: 'notification'; notification: LiveNotification }
  | { type: 'friends' };

const MAX_QUEUE = 50;

type Waiter = { resolve: (events: LiveEvent[]) => void };

const queues = new Map<string, LiveEvent[]>();
const waiters = new Map<string, Waiter[]>();
const buffers = new Map<string, LiveEvent[]>();
let flushScheduled = false;

export function resetLiveBus(): void {
  buffers.clear();
  flushScheduled = false;
  for (const list of waiters.values()) {
    for (const w of list) w.resolve([]);
  }
  waiters.clear();
  queues.clear();
}

export function publishToUser(userId: string, event: LiveEvent): void {
  const buf = buffers.get(userId) || [];
  buf.push(event);
  buffers.set(userId, buf);
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flushLiveBuffers);
}

function flushLiveBuffers(): void {
  flushScheduled = false;
  const pending = [...buffers.entries()];
  buffers.clear();
  for (const [userId, events] of pending) {
    if (!events.length) continue;
    const sitting = waiters.get(userId);
    if (sitting?.length) {
      waiters.delete(userId);
      for (const w of sitting) w.resolve(events);
      continue;
    }
    const q = queues.get(userId) || [];
    q.push(...events);
    if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE);
    queues.set(userId, q);
  }
}

export function waitForLiveEvents(userId: string, waitMs: number, signal?: AbortSignal): Promise<LiveEvent[]> {
  const queued = queues.get(userId);
  if (queued?.length) {
    queues.delete(userId);
    return Promise.resolve(queued);
  }
  if (waitMs <= 0) return Promise.resolve([]);
  return new Promise((resolve) => {
    let done = false;
    const waiter: Waiter = { resolve: (events) => finish(events) };
    function finish(events: LiveEvent[]) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      const list = waiters.get(userId);
      if (list) {
        const next = list.filter((w) => w !== waiter);
        if (next.length) waiters.set(userId, next);
        else waiters.delete(userId);
      }
      resolve(events);
    }
    function onAbort() {
      finish([]);
    }
    const timer = setTimeout(() => finish([]), waitMs);
    const list = waiters.get(userId) || [];
    list.push(waiter);
    waiters.set(userId, list);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort);
  });
}

/** `wait` query is seconds; cap at 25s so Apache proxy does not time out. */
export function liveWaitMs(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n * 1000), 25_000);
}
