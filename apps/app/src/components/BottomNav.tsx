import { NavLink, useLocation } from 'react-router-dom';
import { useKeyboardInset } from '../lib/keyboard';

export const NAV_ITEMS = [
  { to: '/', label: 'دوره‌ها', icon: 'periods' as const },
  { to: '/friends', label: 'دوستام', icon: 'friends' as const },
  { to: '/auth', label: 'حساب', icon: 'account' as const },
  { to: '/more', label: 'بیشتر', icon: 'more' as const },
];

function NavIcon({ name }: { name: (typeof NAV_ITEMS)[number]['icon'] }) {
  const cn = 'h-5 w-5';
  if (name === 'periods') {
    return (
      <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <rect x="3.5" y="5" width="17" height="15" rx="2.2" />
        <path d="M8 3.5v4M16 3.5v4M3.5 10h17" />
      </svg>
    );
  }
  if (name === 'friends') {
    return (
      <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19c.4-3.2 2.6-5 5.5-5s5.1 1.8 5.5 5" />
        <circle cx="17" cy="9" r="2.4" />
        <path d="M16 14.2c2.2.3 3.8 1.8 4.2 4.3" />
      </svg>
    );
  }
  if (name === 'account') {
    return (
      <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 19.2c.6-3.6 3.2-5.4 7-5.4s6.4 1.8 7 5.4" />
      </svg>
    );
  }
  return (
    <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function navActive(to: string, pathname: string, isActive: boolean) {
  if (to === '/') return pathname === '/' || pathname.startsWith('/periods');
  return isActive;
}

export function DesktopNav() {
  const location = useLocation();
  return (
    <nav
      className="sticky top-0 z-40 hidden border-b border-brand-700/10 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur md:block"
      aria-label="ناوبری اصلی"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2">
        <span className="text-sm font-extrabold text-brand-800">Dongham</span>
        <ul className="flex gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center gap-2 rounded-2xl px-3 text-sm font-semibold ${
                    navActive(item.to, location.pathname, isActive)
                      ? 'bg-brand-100 text-brand-800'
                      : 'text-ink-700/70 hover:bg-white'
                  }`
                }
              >
                <NavIcon name={item.icon} />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

export function BottomNav() {
  const kb = useKeyboardInset();
  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-brand-700/10 bg-white/90 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur transition-transform md:hidden ${
        kb > 60 ? 'pointer-events-none translate-y-full' : ''
      }`}
      aria-label="ناوبری اصلی"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4 gap-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex min-h-11 flex-col items-center justify-center rounded-2xl px-2 py-1 text-xs font-medium ${
                  isActive ? 'bg-brand-100 text-brand-800' : 'text-ink-700/70'
                }`
              }
            >
              <NavIcon name={item.icon} />
              <span className="mt-0.5">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
