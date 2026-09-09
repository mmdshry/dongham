/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { APP_HOME } from './lib/paths';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[];
};

const isDevSw =
  self.location.pathname.endsWith('/dev-sw.js') || self.location.search.includes('dev-sw');

self.skipWaiting();
clientsClaim();

self.addEventListener('activate', (event) => {
  event.waitUntil(onActivate());
});

async function onActivate(): Promise<void> {
  const names = await caches.keys();
  if (isDevSw) {
    await Promise.all(names.map((name) => caches.delete(name)));
    return;
  }
  await Promise.all(
    names.filter((name) => !name.startsWith('workbox-precache')).map((name) => caches.delete(name)),
  );
}

if (!isDevSw) {
  precacheAndRoute(self.__WB_MANIFEST);
  cleanupOutdatedCaches();
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('index.html'), {
      denylist: [
        /^\/$/,
        /^\/api\//,
        /^\/(features|guide|travel|faq|about|privacy|terms|compare|dorm|home)(\/|$)/,
        /\/[^/?]+\.[^/]+$/,
      ],
      // Username slugs like /mmdshry are not denylisted, so they fall through to index.html.
    }),
  );
}

type PushData = {
  title?: string;
  body?: string;
  url?: string;
  notificationId?: string;
  forceDisplay?: boolean;
};

self.addEventListener('push', (event) => {
  event.waitUntil(handlePush(event));
});

async function handlePush(event: PushEvent): Promise<void> {
  let data: PushData = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'دونگ‌هام', body: event.data?.text() || '' };
  }
  const title = data.title || 'دونگ‌هام';
  const body = data.body || '';
  const url = data.url || APP_HOME;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const focused = windows.some((client) => 'focused' in client && client.focused);
  if (focused) {
    for (const client of windows) {
      client.postMessage({ type: 'push', url, notificationId: data.notificationId });
    }
    if (!data.forceDisplay) return;
  }
  await self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    lang: 'fa',
    dir: 'rtl',
    data: { url },
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url || APP_HOME;
  event.waitUntil(openOrFocus(url));
});

async function openOrFocus(url: string): Promise<void> {
  const dest = new URL(url, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    if ('focus' in client) {
      await client.focus();
      client.postMessage({ type: 'push-click', url });
      return;
    }
  }
  await self.clients.openWindow(dest);
}
