import { ApiError, api, ensureProfile } from './api';

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 4000);
    }),
  ]);
}

export async function isWebPushEnabled(): Promise<boolean> {
  if (!isPushSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  const profile = await ensureProfile();
  if (!profile.token) return false;
  try {
    const registration = await readyRegistration();
    if (!registration) return false;
    const sub = await registration.pushManager.getSubscription();
    return Boolean(sub);
  } catch {
    return false;
  }
}

export async function enableWebPush(): Promise<void> {
  if (!isPushSupported()) throw new Error('این مرورگر پوش را پشتیبانی نمی‌کند');
  const profile = await ensureProfile();
  if (!profile.token) throw new Error('برای اعلان‌ها وارد شوید');

  const vapid = await api<{ publicKey: string }>('/push/vapid');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('اجازه اعلان داده نشد');

  const registration = await readyRegistration();
  if (!registration) throw new Error('سرویس‌ورکر آماده نیست');
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as BufferSource,
    });
  }
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('سابسکریپشن نامعتبر است');
  }
  await api('/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
}

export async function disableWebPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const registration = await readyRegistration();
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    try {
      await api('/push/subscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    } catch {
      /* token may already be gone */
    }
    await subscription.unsubscribe();
  } catch {
    /* ignore */
  }
}

export async function syncPushSubscription(): Promise<void> {
  if (!isPushSupported()) return;
  if (Notification.permission !== 'granted') return;
  const profile = await ensureProfile();
  if (!profile.token) return;
  try {
    await enableWebPush();
  } catch (e) {
    if (e instanceof ApiError && e.status === 503) return;
  }
}

export function startPushListener(onEvent: (data: { type: string; url?: string }) => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => undefined;
  const handler = (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    const type = (data as { type?: string }).type;
    if (type === 'push' || type === 'push-click') onEvent(data as { type: string; url?: string });
  };
  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
}

export function pushEnableError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 503) return 'پوش روی سرور تنظیم نشده';
    return err.message;
  }
  return err instanceof Error ? err.message : 'فعال‌سازی ناموفق';
}
