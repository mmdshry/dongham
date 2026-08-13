import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';

export function usePersianDigits(): boolean {
  const profile = useLiveQuery(() => db.profile.get('self'));
  return profile?.usePersianDigits ?? true;
}
