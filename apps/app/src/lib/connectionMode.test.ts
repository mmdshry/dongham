import { describe, expect, it } from 'vitest';
import {
  chatOfflineHint,
  isAutoSyncOn,
  isCloudMode,
  isOfflineMode,
  shouldImmediateSync,
} from './connectionMode';

describe('connectionMode', () => {
  it('is cloud only when registered and online', () => {
    expect(isCloudMode({ token: 't' }, true)).toBe(true);
    expect(isCloudMode({ token: 't' }, false)).toBe(false);
    expect(isCloudMode({}, true)).toBe(false);
    expect(isCloudMode(null, true)).toBe(false);
    expect(isOfflineMode({ token: 't' }, true)).toBe(false);
    expect(isOfflineMode({ token: 't' }, false)).toBe(true);
    expect(isOfflineMode({}, true)).toBe(true);
  });

  it('treats missing autoSync as on after login', () => {
    expect(isAutoSyncOn(undefined)).toBe(true);
    expect(isAutoSyncOn({})).toBe(true);
    expect(isAutoSyncOn({ autoSync: true })).toBe(true);
    expect(isAutoSyncOn({ autoSync: false })).toBe(false);
  });

  it('immediate sync needs cloud mode and autoSync', () => {
    expect(shouldImmediateSync({ token: 't' }, true)).toBe(true);
    expect(shouldImmediateSync({ token: 't', autoSync: false }, true)).toBe(false);
    expect(shouldImmediateSync({ token: 't' }, false)).toBe(false);
    expect(shouldImmediateSync({}, true)).toBe(false);
  });

  it('explains why chat is disabled offline', () => {
    expect(chatOfflineHint({ token: 't' }, true)).toBeNull();
    expect(chatOfflineHint({ token: 't' }, false)).toMatch(/آفلاین/);
    expect(chatOfflineHint({}, true)).toMatch(/وارد شوید/);
  });
});
