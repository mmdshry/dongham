import { create } from 'zustand';

interface UiState {
  toast: string | null;
  online: boolean;
  setToast: (msg: string | null) => void;
  setOnline: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  toast: null,
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  setToast: (toast) => {
    set({ toast });
    if (toast) setTimeout(() => set({ toast: null }), 2800);
  },
  setOnline: (online) => set({ online }),
}));
