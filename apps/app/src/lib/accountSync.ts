export function shouldResetLocalAccount(previousUserId: string | undefined, nextUserId: string): boolean {
  return Boolean(previousUserId && previousUserId !== nextUserId);
}

export type LoginLocalAction = 'proceed' | 'confirm-merge' | 'confirm-wipe';

export function loginLocalAction(opts: {
  previousUserId?: string;
  nextUserId: string;
  localPeriodCount: number;
  skipConfirm?: boolean;
}): LoginLocalAction {
  if (opts.skipConfirm) return 'proceed';
  if (shouldResetLocalAccount(opts.previousUserId, opts.nextUserId)) return 'confirm-wipe';
  if (!opts.previousUserId && opts.localPeriodCount > 0) return 'confirm-merge';
  return 'proceed';
}

export function shouldWipeLocalAccount(
  previousUserId: string | undefined,
  nextUserId: string,
  discardLocal?: boolean,
): boolean {
  return Boolean(discardLocal) || shouldResetLocalAccount(previousUserId, nextUserId);
}

export function shouldPushLocalPayouts(
  localHasCards: boolean,
  localDirty: boolean,
  serverMethods?: unknown[],
): boolean {
  if (localDirty) return true;
  if (localHasCards && serverMethods === undefined) return true;
  return false;
}

export function shouldApplyServerPayouts(localDirty: boolean, serverMethods?: unknown[]): boolean {
  return !localDirty && Array.isArray(serverMethods);
}

export function shouldPushPrefs(localAt?: string, serverAt?: string): boolean {
  if (!serverAt) return true;
  if (!localAt) return false;
  return localAt > serverAt;
}
