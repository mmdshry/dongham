import { Capacitor, registerPlugin } from '@capacitor/core';

interface WidgetPlugin {
  updateBalance(options: { owedToMe: string; iOwe: string }): Promise<void>;
}

const Widget = registerPlugin<WidgetPlugin>('DonghamWidget');

export async function pushWidgetBalance(owedToMe: string, iOwe: string) {
  try {
    localStorage.setItem('dongham_widget', JSON.stringify({ owedToMe, iOwe }));
    if (Capacitor.isNativePlatform()) {
      await Widget.updateBalance({ owedToMe, iOwe });
    }
  } catch {
    /* ignore */
  }
}
