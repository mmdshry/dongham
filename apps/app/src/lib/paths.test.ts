import { describe, expect, it } from 'vitest';
import { APP_HOME, isPublicProfilePath, safeAuthNextPath } from './paths';

describe('public profile paths', () => {
  it('accepts username slugs and ignores reserved app routes', () => {
    expect(isPublicProfilePath('/mmdshry')).toBe(true);
    expect(isPublicProfilePath('/Ali12')).toBe(true);
    expect(isPublicProfilePath('/profile')).toBe(false);
    expect(isPublicProfilePath('/app')).toBe(false);
    expect(isPublicProfilePath('/auth')).toBe(false);
    expect(isPublicProfilePath('/i/token')).toBe(false);
    expect(isPublicProfilePath('/periods/Ab3-Cd9')).toBe(false);
  });
});

describe('safeAuthNextPath', () => {
  it('keeps in-app relative paths and rejects open redirects', () => {
    expect(safeAuthNextPath('/mmdshry')).toBe('/mmdshry');
    expect(safeAuthNextPath('/i/abcToken12')).toBe('/i/abcToken12');
    expect(safeAuthNextPath('/more')).toBe('/more');
    expect(safeAuthNextPath('https://evil.example/x')).toBe(APP_HOME);
    expect(safeAuthNextPath('//evil.example')).toBe(APP_HOME);
    expect(safeAuthNextPath(null)).toBe(APP_HOME);
  });
});
