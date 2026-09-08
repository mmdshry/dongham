import { describe, expect, it } from 'vitest';
import {
  loginLocalAction,
  shouldApplyServerPayouts,
  shouldPushLocalPayouts,
  shouldPushPrefs,
  shouldResetLocalAccount,
  shouldWipeLocalAccount,
} from './accountSync';

describe('account isolation', () => {
  it('resets only when switching to a different user', () => {
    expect(shouldResetLocalAccount(undefined, 'u2')).toBe(false);
    expect(shouldResetLocalAccount('u1', 'u1')).toBe(false);
    expect(shouldResetLocalAccount('u1', 'u2')).toBe(true);
  });

  it('wipes when switching users or when discardLocal is set', () => {
    expect(shouldWipeLocalAccount(undefined, 'u2')).toBe(false);
    expect(shouldWipeLocalAccount(undefined, 'u2', true)).toBe(true);
    expect(shouldWipeLocalAccount('u1', 'u1', true)).toBe(true);
    expect(shouldWipeLocalAccount('u1', 'u2')).toBe(true);
    expect(shouldWipeLocalAccount('u1', 'u1')).toBe(false);
  });
});

describe('login local confirmation', () => {
  it('asks to merge on first login when this device has periods', () => {
    expect(
      loginLocalAction({ nextUserId: 'u2', localPeriodCount: 2 }),
    ).toBe('confirm-merge');
  });

  it('asks to wipe when switching to a different cloud user', () => {
    expect(
      loginLocalAction({ previousUserId: 'u1', nextUserId: 'u2', localPeriodCount: 0 }),
    ).toBe('confirm-wipe');
    expect(
      loginLocalAction({ previousUserId: 'u1', nextUserId: 'u2', localPeriodCount: 3 }),
    ).toBe('confirm-wipe');
  });

  it('proceeds without a dialog for same user, empty guest, or skipped confirm', () => {
    expect(
      loginLocalAction({ previousUserId: 'u1', nextUserId: 'u1', localPeriodCount: 4 }),
    ).toBe('proceed');
    expect(loginLocalAction({ nextUserId: 'u2', localPeriodCount: 0 })).toBe('proceed');
    expect(
      loginLocalAction({
        nextUserId: 'u2',
        localPeriodCount: 2,
        skipConfirm: true,
      }),
    ).toBe('proceed');
    expect(
      loginLocalAction({
        previousUserId: 'u1',
        nextUserId: 'u2',
        localPeriodCount: 2,
        skipConfirm: true,
      }),
    ).toBe('proceed');
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
