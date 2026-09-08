import { useLiveQuery } from 'dexie-react-hooks';
import { isAutoSyncOn, isCloudMode, shouldImmediateSync } from './connectionMode';
import { db, type LocalProfile } from './db';
import { useUiStore } from '../store/ui';

export type ConnectionState = {
  /** Network flag from the UI store (single source; `navigator.onLine` is only read there). */
  online: boolean;
  /** A cloud session token is stored locally. */
  signedIn: boolean;
  /** Signed in and online — the only state where REST calls are attempted. */
  cloud: boolean;
  /** Auto-sync preference (default on). */
  autoSync: boolean;
  /** Cloud and auto-sync: writes go to REST immediately instead of the outbox. */
  immediate: boolean;
  /** Short label for badges: ابری / ابری (دستی) / آفلاین / محلی. */
  label: string;
  profile: LocalProfile | undefined;
};

/**
 * One predicate set for every gate (badge, banner, chat, join, uploads) so the UI
 * never says «حالت ابری» while another component thinks it is offline.
 */
export function useConnectionMode(): ConnectionState {
  const online = useUiStore((s) => s.online);
  const profile = useLiveQuery(() => db.profile.get('self'));
  const signedIn = Boolean(profile?.token);
  const cloud = isCloudMode(profile, online);
  const autoSync = isAutoSyncOn(profile);
  const immediate = shouldImmediateSync(profile, online);
  const label = cloud ? (autoSync ? 'حالت ابری' : 'حالت ابری (دستی)') : signedIn ? 'حالت آفلاین' : 'حالت محلی';
  return { online, signedIn, cloud, autoSync, immediate, label, profile };
}
