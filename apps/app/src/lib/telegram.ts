import { resolveTheme, THEME_META_DARK, THEME_META_LIGHT } from './themePref';

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  initDataUnsafe?: { start_param?: string };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function syncTelegramChrome() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  tg.setHeaderColor?.(resolveTheme() === 'dark' ? THEME_META_DARK : THEME_META_LIGHT);
}

export function initTelegramMiniApp(): string | undefined {
  const tg = window.Telegram?.WebApp;
  if (!tg) return undefined;
  tg.ready();
  tg.expand();
  syncTelegramChrome();
  window.addEventListener('dongham-theme', () => syncTelegramChrome());
  document.documentElement.classList.add('telegram-mini');
  return tg.initDataUnsafe?.start_param;
}
