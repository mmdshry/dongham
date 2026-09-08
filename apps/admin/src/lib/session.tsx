import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from './api';
import { buildToast, toastDurationMs, type ToastKind, type ToastOpts, type ToastPayload } from './toast';
import type { AdminUser } from './types';

type SetToast = {
  (message: null): void;
  (message: string, kind: ToastKind, opts?: ToastOpts): void;
};

type SessionCtx = {
  ready: boolean;
  user: AdminUser | null;
  toast: ToastPayload | null;
  setToast: SetToast;
  login: (token: string, user: AdminUser) => void;
  logout: () => Promise<void>;
};

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [toast, setToastState] = useState<ToastPayload | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const setToast = useCallback<SetToast>((message: string | null, kind?: ToastKind, opts?: ToastOpts) => {
    if (toastTimer.current !== undefined) {
      window.clearTimeout(toastTimer.current);
      toastTimer.current = undefined;
    }
    if (!message) {
      setToastState(null);
      return;
    }
    const next = buildToast(message, kind ?? 'error', opts);
    setToastState(next);
    const ms = toastDurationMs(next);
    if (ms != null) {
      toastTimer.current = window.setTimeout(() => {
        setToastState(null);
        toastTimer.current = undefined;
      }, ms);
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setReady(true);
      return;
    }
    void (async () => {
      try {
        const res = await api<{ user: AdminUser }>('/admin/auth/me');
        setUser(res.user);
      } catch {
        setToken(null);
        setUser(null);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const value = useMemo<SessionCtx>(
    () => ({
      ready,
      user,
      toast,
      setToast,
      login: (token, next) => {
        setToken(token);
        setUser(next);
      },
      logout: async () => {
        try {
          await api('/admin/auth/logout', { method: 'POST' });
        } catch {
          /* ignore */
        }
        setToken(null);
        setUser(null);
      },
    }),
    [ready, user, toast, setToast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('session');
  return ctx;
}
