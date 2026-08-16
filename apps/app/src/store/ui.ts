import { create } from 'zustand';

export type SyncConflictState = {
  periodId: string;
  message: string;
  serverVersion: number;
  snapshot?: unknown;
};

interface UiState {
  toast: string | null;
  online: boolean;
  syncConflict: SyncConflictState | null;
  serverAhead: boolean;
  setToast: (msg: string | null) => void;
  setOnline: (v: boolean) => void;
  setSyncConflict: (syncConflict: SyncConflictState | null) => void;
  setServerAhead: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  toast: null,
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  syncConflict: null,
  serverAhead: false,
  setToast: (toast) => {
    set({ toast });
    if (toast) setTimeout(() => set({ toast: null }), 2800);
  },
  setOnline: (online) => set({ online }),
  setSyncConflict: (syncConflict) => set({ syncConflict }),
  setServerAhead: (serverAhead) => set({ serverAhead }),
}));
