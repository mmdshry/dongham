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

export function initTelegramMiniApp(): string | undefined {
  const tg = window.Telegram?.WebApp;
  if (!tg) return undefined;
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.('#0F766E');
  document.documentElement.classList.add('telegram-mini');
  return tg.initDataUnsafe?.start_param;
}
