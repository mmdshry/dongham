import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav, DesktopNav } from './components/BottomNav';
import { CreatePeriodModal } from './components/CreatePeriodModal';
import { JoinPeriodModal } from './components/JoinPeriodModal';
import { NotificationsSheet } from './components/NotificationsSheet';
import { ToastHost } from './components/ui';
import { SESSION_EXPIRED_MESSAGE, ensureProfile, onSessionExpired } from './lib/api';
import { migrateLocalPeriodIds } from './lib/periodMigrate';
import { APP_HOME, isPublicProfilePath } from './lib/paths';
import { useKeyboardInset } from './lib/keyboard';
import { startFxLoop } from './lib/fx';
import { startSyncLoop, pullCloud } from './lib/sync';
import { startPushListener, syncPushSubscription } from './lib/webPush';
import { useDebtReminders } from './lib/useDebtReminders';
import { AuthPage } from './pages/AuthPage';
import { ExpenseFormPage } from './pages/ExpenseFormPage';
import { FriendsPage } from './pages/FriendsPage';
import { HomePage } from './pages/HomePage';
import { InvitePage } from './pages/InvitePage';
import { MorePage } from './pages/MorePage';
import { PaymentFormPage } from './pages/PaymentFormPage';
import { PeriodPage } from './pages/PeriodPage';
import { ProfilePage } from './pages/ProfilePage';
import { PublicProfilePage } from './pages/PublicProfilePage';
import { ReportsPage } from './pages/ReportsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { useUiStore } from './store/ui';

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const setOnline = useUiStore((s) => s.setOnline);
  const setToast = useUiStore((s) => s.setToast);
  const hideNav = location.pathname.startsWith('/i/') || isPublicProfilePath(location.pathname);
  useKeyboardInset();
  useDebtReminders();

  useEffect(() => {
    return startPushListener((data) => {
      if (data.type === 'push') void pullCloud();
      if (data.type === 'push-click' && data.url) navigate(data.url);
    });
  }, [navigate]);

  // Expired/revoked session: token is already cleared by api(); tell the user once and offer login.
  useEffect(() => onSessionExpired(() => setToast(SESSION_EXPIRED_MESSAGE, 'error')), [setToast]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let stopFx: (() => void) | undefined;
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    setOnline(navigator.onLine);
    void (async () => {
      await migrateLocalPeriodIds();
      await ensureProfile();
      stop = startSyncLoop();
      stopFx = startFxLoop();
      await syncPushSubscription();
    })();
    return () => {
      stop?.();
      stopFx?.();
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [setOnline]);

  return (
    <>
      {!hideNav ? <DesktopNav /> : null}
      <Routes>
        <Route path={APP_HOME} element={<HomePage />} />
        <Route path="/" element={<Navigate to={APP_HOME} replace />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/periods/:id" element={<PeriodPage />} />
        <Route path="/periods/:id/expenses/:expenseId" element={<ExpenseFormPage />} />
        <Route path="/periods/:id/payment/new" element={<PaymentFormPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/i/:token" element={<InvitePage />} />
        <Route path="/:username" element={<PublicProfilePage />} />
        <Route path="*" element={<Navigate to={APP_HOME} replace />} />
      </Routes>
      {!hideNav ? <BottomNav /> : null}
      <CreatePeriodModal />
      <JoinPeriodModal />
      <NotificationsSheet />
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
