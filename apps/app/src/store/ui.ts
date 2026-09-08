import { create } from 'zustand';
import { buildToast, toastDurationMs, type ToastKind, type ToastOpts, type ToastPayload } from '../lib/toast';

export type UiSheet = 'create' | 'join' | 'notifs';

export type { ToastKind, ToastOpts, ToastPayload };

let toastTimer: ReturnType<typeof setTimeout> | undefined;

function clearToastTimer() {
  if (toastTimer !== undefined) {
    clearTimeout(toastTimer);
    toastTimer = undefined;
  }
}

interface UiState {
  toast: ToastPayload | null;
  online: boolean;
  /** Server has newer data for a period whose local writes are still queued. */
  serverAhead: boolean;
  sheet: UiSheet | null;
  setToast: {
    (message: null): void;
    (message: string, kind: ToastKind, opts?: ToastOpts): void;
  };
  setOnline: (v: boolean) => void;
  setServerAhead: (v: boolean) => void;
  openSheet: (sheet: UiSheet) => void;
  closeSheet: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  toast: null,
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  serverAhead: false,
  sheet: null,
  setToast: ((message: string | null, kind?: ToastKind, opts?: ToastOpts) => {
    clearToastTimer();
    if (!message) {
      set({ toast: null });
      return;
    }
    const toast = buildToast(message, kind ?? 'error', opts);
    set({ toast });
    const ms = toastDurationMs(toast);
    if (ms != null) {
      toastTimer = setTimeout(() => {
        set({ toast: null });
        toastTimer = undefined;
      }, ms);
    }
  }) as UiState['setToast'],
  setOnline: (online) => set({ online }),
  setServerAhead: (serverAhead) => set({ serverAhead }),
  openSheet: (sheet) => set({ sheet }),
  closeSheet: () => set({ sheet: null }),
}));
