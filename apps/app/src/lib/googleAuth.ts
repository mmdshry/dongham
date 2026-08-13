const GIS_SRC = 'https://accounts.google.com/gsi/client';

export function googleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
}

export function loadGis(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('بارگذاری گوگل ناموفق بود')));
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('بارگذاری گوگل ناموفق بود'));
    document.head.appendChild(script);
  });
}
