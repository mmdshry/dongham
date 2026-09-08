import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PageLoading, ToastHost } from './components/ui';
import { SessionProvider, useSession } from './lib/session';
import { AuditPage } from './pages/AuditPage';
import { BillingPage } from './pages/BillingPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { PeriodDetailPage } from './pages/PeriodDetailPage';
import { PeriodsPage } from './pages/PeriodsPage';
import { SettingsPage } from './pages/SettingsPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { UsersPage } from './pages/UsersPage';

function Gate() {
  const { ready, user } = useSession();
  if (!ready) {
    return (
      <div className="p-8">
        <PageLoading />
      </div>
    );
  }
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:id" element={<UserDetailPage />} />
        <Route path="/periods" element={<PeriodsPage />} />
        <Route path="/periods/:id" element={<PeriodDetailPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Gate />
        <ToastHost />
      </SessionProvider>
    </BrowserRouter>
  );
}
