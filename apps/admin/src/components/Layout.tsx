import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../lib/session';
import { useThemePref, type ThemePref } from '../lib/themePref';

const themeOptions: { id: ThemePref; label: string }[] = [
  { id: 'light', label: 'روشن' },
  { id: 'dark', label: 'تیره' },
  { id: 'system', label: 'سیستم' },
];

const links = [
  { to: '/', label: 'داشبورد', end: true },
  { to: '/users', label: 'کاربران' },
  { to: '/periods', label: 'دوره‌ها' },
  { to: '/billing', label: 'پرداخت' },
  { to: '/telegram', label: 'تلگرام' },
  { to: '/audit', label: 'فعالیت ادمین' },
  { to: '/settings', label: 'تنظیمات' },
];

export function Layout() {
  const { user, logout, toast } = useSession();
  const [themePref, setThemePref] = useThemePref();

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-56 shrink-0 flex-col border-l border-brand-700/10 bg-surface/80 p-4 md:flex">
        <p className="text-lg font-extrabold text-brand-800">دونگ‌هام</p>
        <p className="mt-0.5 text-xs text-ink-700/60">پنل مدیریت</p>
        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `rounded-xl px-3 py-2 text-sm font-semibold ${
                  isActive ? 'bg-brand-700 text-white' : 'text-ink-800 hover:bg-brand-50'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 border-t border-brand-700/10 pt-3 text-xs">
          <div className="mb-3 flex gap-1 rounded-xl bg-brand-50 p-1">
            {themeOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`flex-1 rounded-lg px-1 py-1.5 text-[11px] font-semibold ${
                  themePref === opt.id ? 'bg-brand-700 text-white' : 'text-ink-800'
                }`}
                onClick={() => setThemePref(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="font-semibold">{user?.displayName}</p>
          <p className="mt-0.5 text-left text-ink-700/60" dir="ltr">
            {user?.phone}
          </p>
          <button type="button" className="btn-ghost mt-3 w-full" onClick={() => void logout()}>
            خروج
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-brand-700/10 bg-surface/70 px-4 py-3 md:hidden">
          <p className="font-extrabold text-brand-800">ادمین دونگ‌هام</p>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-xl bg-brand-50 p-0.5">
              {themeOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`rounded-lg px-1.5 py-1 text-[10px] font-semibold ${
                    themePref === opt.id ? 'bg-brand-700 text-white' : 'text-ink-800'
                  }`}
                  onClick={() => setThemePref(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn-ghost" onClick={() => void logout()}>
              خروج
            </button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-brand-700/10 bg-surface/70 px-2 py-2 md:hidden">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                  isActive ? 'bg-brand-700 text-white' : 'bg-surface text-ink-800 ring-1 ring-brand-700/10'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
      {toast ? (
        <div className="toast-bar fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
