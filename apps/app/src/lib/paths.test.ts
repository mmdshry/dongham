import { describe, expect, it } from 'vitest';
import { isPublicProfilePath } from './paths';

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
