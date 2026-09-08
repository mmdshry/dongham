import { describe, expect, it } from 'vitest';
import { memberAvatarSrc } from './avatarCache';

describe('memberAvatarSrc', () => {
  const photo = 'data:image/png;base64,abc';
  const cached = 'data:image/png;base64,cached';

  it('uses the profile photo for a guest self member', () => {
    expect(
      memberAvatarSrc({ guestKey: 'g1' }, { guestKey: 'g1', avatarDataUrl: photo }, {}),
    ).toBe(photo);
  });

  it('prefers the userId cache when logged in', () => {
    expect(
      memberAvatarSrc(
        { guestKey: 'g1', userId: 'u1' },
        { guestKey: 'g1', userId: 'u1', avatarDataUrl: photo },
        { u1: cached },
      ),
    ).toBe(cached);
  });

  it('falls back to initials when the member is not self and has no userId', () => {
    expect(memberAvatarSrc({ guestKey: 'g2' }, { guestKey: 'g1', avatarDataUrl: photo }, {})).toBeUndefined();
  });

  it('resolves a catalog preset for the self member', () => {
    expect(
      memberAvatarSrc({ guestKey: 'g1' }, { guestKey: 'g1', avatarPreset: 'child-04' }, {}),
    ).toBe('/avatars/child/04.svg');
  });
});
