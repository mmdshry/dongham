import { describe, expect, it } from 'vitest';
import {
  shouldApplyServerPayouts,
  shouldPushLocalPayouts,
  shouldPushPrefs,
  shouldResetLocalAccount,
} from './accountSync';

describe('account isolation', () => {
  it('resets only when switching to a different user', () => {
    expect(shouldResetLocalAccount(undefined, 'u2')).toBe(false);
    expect(shouldResetLocalAccount('u1', 'u1')).toBe(false);
    expect(shouldResetLocalAccount('u1', 'u2')).toBe(true);
  });
});

describe('cloud profile merge', () => {
  it('pushes local cards when the account never stored any', () => {
    expect(shouldPushLocalPayouts(true, false, undefined)).toBe(true);
    expect(shouldPushLocalPayouts(true, false, [])).toBe(false);
    expect(shouldPushLocalPayouts(false, false, undefined)).toBe(false);
    expect(shouldPushLocalPayouts(true, true, [{ id: '1' }])).toBe(true);
  });

  it('applies server cards unless this device has unsynced edits', () => {
    expect(shouldApplyServerPayouts(false, [])).toBe(true);
    expect(shouldApplyServerPayouts(true, [])).toBe(false);
    expect(shouldApplyServerPayouts(false, undefined)).toBe(false);
  });

  it('pushes prefs when the server has none or is older', () => {
    expect(shouldPushPrefs('2026-08-18T12:00:00.000Z', undefined)).toBe(true);
    expect(shouldPushPrefs(undefined, '2026-08-18T12:00:00.000Z')).toBe(false);
    expect(shouldPushPrefs('2026-08-18T13:00:00.000Z', '2026-08-18T12:00:00.000Z')).toBe(true);
    expect(shouldPushPrefs('2026-08-18T11:00:00.000Z', '2026-08-18T12:00:00.000Z')).toBe(false);
  });
});
