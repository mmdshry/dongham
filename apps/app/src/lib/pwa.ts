import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';

const UPDATE_INTERVAL_MS = 15 * 60 * 1000;

export type InitPwaOptions = {
  isDev?: boolean;
  reload?: () => void;
};

async function clearServiceWorkersAndCaches(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  return hadController || registrations.length > 0;
}

async function checkForSwUpdate(swUrl: string, registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.installing || typeof navigator === 'undefined') return;
  if ('onLine' in navigator && !navigator.onLine) return;
  try {
    const resp = await fetch(swUrl, {
      cache: 'no-store',
      headers: {
        cache: 'no-store',
        'cache-control': 'no-cache',
      },
    });
    if (resp.status === 200) await registration.update();
  } catch {
    /* offline or origin unreachable */
  }
}

function registerWebPwa(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;

      const run = () => {
        void checkForSwUpdate(swUrl, registration);
      };

      run();
      setInterval(run, UPDATE_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') run();
      });
      window.addEventListener('online', run);
    },
  });
}

export function initPwa(_options: InitPwaOptions = {}): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  if (Capacitor.isNativePlatform()) {
    void clearServiceWorkersAndCaches();
    return;
  }

  registerWebPwa();
}
