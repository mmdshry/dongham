import { History, MessageCircle, Receipt, Scale, Settings, type LucideIcon } from 'lucide-react';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { PERIOD_TABS, type PeriodTab } from '../lib/periodTabs';
import { Icon } from './Icon';
import { UnreadDot } from './UnreadDot';

const ITEMS: { id: PeriodTab; label: string; icon: LucideIcon }[] = [
  { id: 'expenses', label: 'هزینه‌ها', icon: Receipt },
  { id: 'balance', label: 'حساب', icon: Scale },
  { id: 'chat', label: 'چت', icon: MessageCircle },
  { id: 'activity', label: 'تاریخچه', icon: History },
  { id: 'settings', label: 'تنظیمات', icon: Settings },
];

export function PeriodTabs({
  tab,
  onChange,
  chatUnread,
}: {
  tab: PeriodTab;
  onChange: (tab: PeriodTab) => void;
  chatUnread?: boolean;
}) {
  const btns = useRef<Partial<Record<PeriodTab, HTMLButtonElement | null>>>({});

  const move = (next: PeriodTab) => {
    onChange(next);
    queueMicrotask(() => btns.current[next]?.focus());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = PERIOD_TABS.indexOf(tab);
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      move(PERIOD_TABS[(i + 1) % PERIOD_TABS.length]);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      move(PERIOD_TABS[(i - 1 + PERIOD_TABS.length) % PERIOD_TABS.length]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      move(PERIOD_TABS[0]);
    } else if (e.key === 'End') {
      e.preventDefault();
      move(PERIOD_TABS[PERIOD_TABS.length - 1]);
    }
  };

  return (
    <div
      className="-mx-4 mb-4 overflow-x-auto px-4 no-scrollbar animate-rise"
      role="tablist"
      aria-label="بخش‌های دوره"
      onKeyDown={onKeyDown}
    >
      <div className="flex w-max min-w-full gap-2">
        {ITEMS.map((t) => {
          const selected = tab === t.id;
          const unread = t.id === 'chat' && chatUnread;
          return (
            <button
              key={t.id}
              ref={(el) => {
                btns.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`period-tab-${t.id}`}
              aria-controls={`period-panel-${t.id}`}
              aria-selected={selected}
              aria-label={unread ? 'چت، خوانده‌نشده' : undefined}
              tabIndex={selected ? 0 : -1}
              className={`chip relative inline-flex items-center gap-1.5 ${
                selected ? 'bg-brand-700 text-on-brand' : 'bg-surface/80 text-ink-800 ring-1 ring-brand-800/20'
              }`}
              onClick={() => onChange(t.id)}
            >
              <Icon icon={t.icon} size={16} strokeWidth={selected ? 2.2 : 1.8} />
              {t.label}
              {unread ? <UnreadDot className="absolute end-1.5 top-1.5" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PeriodTabPanel({
  id,
  tab,
  children,
  className,
}: {
  id: PeriodTab;
  tab: PeriodTab;
  children: ReactNode;
  className?: string;
}) {
  if (tab !== id) return null;
  return (
    <div id={`period-panel-${id}`} role="tabpanel" aria-labelledby={`period-tab-${id}`} className={className}>
      {children}
    </div>
  );
}
