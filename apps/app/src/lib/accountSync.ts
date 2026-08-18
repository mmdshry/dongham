export function shouldResetLocalAccount(previousUserId: string | undefined, nextUserId: string): boolean {
  return Boolean(previousUserId && previousUserId !== nextUserId);
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
