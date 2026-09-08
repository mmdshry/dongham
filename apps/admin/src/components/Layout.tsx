import { NavLink, Outlet } from 'react-router-dom';
import {
  ClipboardList,
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  Users,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { Icon } from './Icon';
import { useSession } from '../lib/session';
import { useThemePref, type ThemePref } from '../lib/themePref';

const themeOptions: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'روشن', icon: Sun },
  { id: 'dark', label: 'تیره', icon: Moon },
  { id: 'system', label: 'سیستم', icon: Monitor },
];

const links = [
  { to: '/', label: 'داشبورد', end: true, icon: LayoutDashboard },
  { to: '/users', label: 'کاربران', icon: Users },
  { to: '/periods', label: 'دوره‌ها', icon: FolderKanban },
  { to: '/billing', label: 'پرداخت', icon: CreditCard },
  { to: '/audit', label: 'فعالیت ادمین', icon: ClipboardList },
  { to: '/settings', label: 'تنظیمات', icon: Settings },
];

export function Layout() {
  const { user, logout } = useSession();
  const [themePref, setThemePref] = useThemePref();

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:z-50 focus-visible:rounded-xl focus-visible:bg-surface focus-visible:px-3 focus-visible:py-2"
      >
        پرش به محتوا
      </a>
      <aside className="hidden w-56 shrink-0 flex-col bg-nav p-4 text-white md:flex">
        <BrandLogo className="self-start text-white" size="sm" />
        <p className="mt-0.5 text-xs text-white/70">پنل مدیریت</p>
        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
                  isActive ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon icon={l.icon} size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                  {l.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 border-t border-white/15 pt-3 text-xs">
          <div className="mb-3 flex gap-1 rounded-xl bg-white/10 p-1">
            {themeOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-semibold ${
                  themePref === opt.id ? 'bg-white text-nav' : 'text-white/80'
                }`}
                aria-pressed={themePref === opt.id}
                onClick={() => setThemePref(opt.id)}
              >
                <Icon icon={opt.icon} size={12} />
                {opt.label}
              </button>
            ))}
          </div>
          <p className="font-semibold">{user?.displayName}</p>
          <p className="mt-0.5 text-left text-white/60" dir="ltr">
            {user?.phone}
          </p>
          <button
            type="button"
            className="btn-ghost mt-3 inline-flex w-full items-center justify-center gap-2 !bg-white/10 !text-white hover:!bg-white/15"
            onClick={() => void logout()}
          >
            <Icon icon={LogOut} size={16} />
            خروج
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-brand-800/20 bg-surface/70 px-4 py-3 md:hidden">
          <BrandLogo className="text-brand-800" size="sm" />
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-xl bg-brand-50 p-0.5">
              {themeOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`inline-flex min-h-11 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${
                    themePref === opt.id ? 'bg-brand-700 text-on-brand' : 'text-ink-800'
                  }`}
                  aria-pressed={themePref === opt.id}
                  onClick={() => setThemePref(opt.id)}
                >
                  <Icon icon={opt.icon} size={12} />
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn-ghost inline-flex items-center gap-1"
              onClick={() => void logout()}
            >
              <Icon icon={LogOut} size={16} />
              خروج
            </button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-brand-800/20 bg-surface/70 px-2 py-2 md:hidden">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold ${
                  isActive ? 'bg-brand-700 text-on-brand' : 'bg-surface text-ink-800 ring-1 ring-brand-800/20'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon icon={l.icon} size={14} strokeWidth={isActive ? 2.2 : 1.8} />
                  {l.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
