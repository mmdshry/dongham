export type ConnectionProfile = {
  token?: string;
  autoSync?: boolean;
};

export function isCloudMode(profile?: ConnectionProfile | null, online = false): boolean {
  return Boolean(profile?.token) && online;
}

export function isOfflineMode(profile?: ConnectionProfile | null, online = false): boolean {
  return !isCloudMode(profile, online);
}

export function isAutoSyncOn(profile?: Pick<ConnectionProfile, 'autoSync'> | null): boolean {
  return profile?.autoSync !== false;
}

export function shouldImmediateSync(profile?: ConnectionProfile | null, online = false): boolean {
  return isCloudMode(profile, online) && isAutoSyncOn(profile);
}

export function chatOfflineHint(profile?: ConnectionProfile | null, online = false): string | null {
  if (isCloudMode(profile, online)) return null;
  if (profile?.token) return 'چت در حالت آفلاین غیرفعال است. پس از اتصال دوباره تلاش کنید.';
  return 'چت فقط در حالت ابری فعال است. برای گفتگو وارد شوید.';
}
