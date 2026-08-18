import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from '../lib/api';
import type { AdminUser } from '../lib/types';

type SessionCtx = {
  ready: boolean;
  user: AdminUser | null;
  toast: string;
  setToast: (msg: string) => void;
  login: (token: string, user: AdminUser) => void;
  logout: () => Promise<void>;
};

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

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
    [ready, user, toast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('session');
  return ctx;
}
