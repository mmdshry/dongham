export const PERIOD_TABS = ['expenses', 'balance', 'chat', 'activity', 'settings'] as const;

export type PeriodTab = (typeof PERIOD_TABS)[number];

export function parsePeriodTab(raw: string | null | undefined): PeriodTab {
  if (raw === 'more') return 'settings';
  return PERIOD_TABS.includes(raw as PeriodTab) ? (raw as PeriodTab) : 'expenses';
}

export function periodTabSearch(tab: PeriodTab): string {
  return tab === 'expenses' ? '' : tab;
}

export function periodChatHref(periodId: string): string {
  return `/periods/${periodId}?tab=chat`;
}
