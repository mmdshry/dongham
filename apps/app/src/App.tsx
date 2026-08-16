import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BottomNav, DesktopNav } from './components/BottomNav';
import { ToastHost } from './components/ui';
import { ensureProfile } from './lib/api';
import { useKeyboardInset } from './lib/keyboard';
import { startFxLoop } from './lib/fx';
import { startSyncLoop } from './lib/sync';
import { AuthPage } from './pages/AuthPage';
import { ExpenseFormPage } from './pages/ExpenseFormPage';
import { FriendsPage } from './pages/FriendsPage';
import { HomePage } from './pages/HomePage';
import { InvitePage } from './pages/InvitePage';
import { MorePage } from './pages/MorePage';
import { PaymentFormPage } from './pages/PaymentFormPage';
import { PeriodPage } from './pages/PeriodPage';
import { useUiStore } from './store/ui';

function AppShell() {
  const location = useLocation();
  const setOnline = useUiStore((s) => s.setOnline);
  const hideNav = location.pathname.startsWith('/i/');
  useKeyboardInset();

  useEffect(() => {
    void ensureProfile();
    const stop = startSyncLoop();
    const stopFx = startFxLoop();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    setOnline(navigator.onLine);
    return () => {
      stop();
      stopFx();
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [setOnline]);

  return (
    <>
      {!hideNav ? <DesktopNav /> : null}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/periods/:id" element={<PeriodPage />} />
        <Route path="/periods/:id/expenses/:expenseId" element={<ExpenseFormPage />} />
        <Route path="/periods/:id/payment/new" element={<PaymentFormPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/i/:token" element={<InvitePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!hideNav ? <BottomNav /> : null}
      <ToastHost />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
