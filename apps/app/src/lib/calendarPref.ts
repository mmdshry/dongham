import { useLiveQuery } from 'dexie-react-hooks';
import type { CalendarMode } from './jalali';
import { db } from './db';

export const CALENDAR_STORAGE_KEY = 'dongham.calendar';
export const LAST_USER_META = 'lastUserId';
export const FX_WATCH_META = 'fxWatchlist';

export function readCalendarMode(): CalendarMode {
  try {
    const v = localStorage.getItem(CALENDAR_STORAGE_KEY);
    if (v === 'gregorian' || v === 'jalali') return v;
  } catch {
    /* ignore */
  }
  return 'jalali';
}

export function writeCalendarMode(mode: CalendarMode) {
  try {
    localStorage.setItem(CALENDAR_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function useCalendarMode(): CalendarMode {
  const profile = useLiveQuery(() => db.profile.get('self'));
  if (profile?.calendarMode === 'gregorian' || profile?.calendarMode === 'jalali') return profile.calendarMode;
  return readCalendarMode();
}
