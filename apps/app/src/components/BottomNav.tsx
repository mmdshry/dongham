import { NavLink, useLocation } from 'react-router-dom';
import {
  Home,
  PieChart,
  Plus,
  User,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { Icon } from './Icon';
import { useKeyboardInset } from '../lib/keyboard';
import { JOIN_OFFLINE_ERROR } from '../lib/joinPeriod';
import { APP_HOME } from '../lib/paths';
import { useUiStore } from '../store/ui';

export const NAV_ITEMS = [
  { to: APP_HOME, label: 'دوره‌ها', shortLabel: 'دوره‌ها', icon: Home },
  { to: '/transactions', label: 'تراکنش‌ها', shortLabel: 'تراکنش', icon: Wallet },
  { to: '/reports', label: 'گزارش‌ها', shortLabel: 'گزارش', icon: PieChart },
  { to: '/profile', label: 'پروفایل', shortLabel: 'پروفایل', icon: User },
];

function NavIcon({ icon, active, size = 20 }: { icon: LucideIcon; active?: boolean; size?: number }) {
  return <Icon icon={icon} size={size} strokeWidth={active ? 2.4 : 1.8} />;
}

function navActive(to: string, pathname: string, isActive: boolean) {
  if (to === APP_HOME) {
    return pathname === APP_HOME || pathname === `${APP_HOME}/` || pathname.startsWith('/periods');
  }
  if (to === '/profile') {
    return isActive || pathname.startsWith('/auth') || pathname.startsWith('/friends') || pathname.startsWith('/more');
  }
  return isActive;
}

export function DesktopNav() {
  const location = useLocation();
  const openSheet = useUiStore((s) => s.openSheet);
  const online = useUiStore((s) => s.online);
  return (
    <nav
      className="sticky top-0 z-40 hidden border-b border-brand-800/20 bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur md:block"
      aria-label="ناوبری اصلی"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2">
        <BrandLogo size="sm" />
        <ul className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === APP_HOME}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center gap-2 rounded-2xl px-3 text-sm font-semibold ${
                    navActive(item.to, location.pathname, isActive)
                      ? 'bg-brand-100 text-brand-800'
                      : 'text-ink-700/70 hover:bg-brand-50'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <NavIcon icon={item.icon} active={navActive(item.to, location.pathname, isActive)} />
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="btn-ghost !min-h-11 !px-3"
              disabled={!online}
              title={!online ? JOIN_OFFLINE_ERROR : undefined}
              onClick={() => openSheet('join')}
            >
              ورود با شناسه
            </button>
          </li>
          <li>
            <button type="button" className="btn-primary !min-h-11 !px-4" onClick={() => openSheet('create')}>
              دوره جدید
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}

function MobileNavItem({
  item,
  pathname,
}: {
  item: (typeof NAV_ITEMS)[number];
  pathname: string;
}) {
  return (
    <li>
      <NavLink
        to={item.to}
        end={item.to === APP_HOME}
        className={({ isActive }) =>
          `flex min-h-12 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-semibold leading-none duration-150 active:opacity-80 ${
            navActive(item.to, pathname, isActive) ? 'text-white' : 'text-white/75'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <NavIcon icon={item.icon} size={24} active={navActive(item.to, pathname, isActive)} />
            <span className="max-w-full truncate">{item.shortLabel}</span>
          </>
        )}
      </NavLink>
    </li>
  );
}

export function BottomNav() {
  const kb = useKeyboardInset();
  const location = useLocation();
  const openSheet = useUiStore((s) => s.openSheet);
  const right = NAV_ITEMS.slice(0, 2);
  const left = NAV_ITEMS.slice(2);
  return (
    <nav
      className={`fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 text-white transition-transform md:hidden ${
        kb > 60 ? 'pointer-events-none translate-y-full' : ''
      }`}
      aria-label="ناوبری اصلی"
    >
      <div className="relative drop-shadow-[0_10px_28px_rgba(46,58,50,0.28)]">
        <div className="bottom-nav-pill rounded-full bg-nav">
          <ul className="mx-auto grid h-[4.5rem] max-w-lg grid-cols-5 items-center px-2">
            {right.map((item) => (
              <MobileNavItem key={item.to} item={item} pathname={location.pathname} />
            ))}
            <li>
              <button
                type="button"
                className="flex h-full min-h-12 w-full flex-col items-center justify-center px-0.5 text-white"
                onClick={() => openSheet('create')}
              >
                <span className="h-6 w-6" aria-hidden />
                <span className="sr-only">دوره جدید</span>
              </button>
            </li>
            {left.map((item) => (
              <MobileNavItem key={item.to} item={item} pathname={location.pathname} />
            ))}
          </ul>
        </div>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="absolute left-1/2 top-0 z-10 inline-flex h-12 w-12 -translate-x-1/2 -translate-y-6 items-center justify-center rounded-full bg-nav text-white shadow-[0_6px_16px_rgba(0,0,0,0.16)] duration-150 active:opacity-90"
          onClick={() => openSheet('create')}
        >
          <Icon icon={Plus} size={24} strokeWidth={2.2} />
        </button>
      </div>
    </nav>
  );
}
