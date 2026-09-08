import { describe, expect, it } from 'vitest';
import {
  isUserAvatarPreset,
  presetsForGroup,
  USER_AVATAR_PRESETS,
  userAvatarFile,
  userAvatarSrc,
} from './userAvatarPresets';

describe('user avatar presets', () => {
  it('lists forty catalog ids', () => {
    expect(USER_AVATAR_PRESETS).toHaveLength(40);
    expect(presetsForGroup('male')).toEqual([
      'male-01',
      'male-02',
      'male-03',
      'male-04',
      'male-05',
      'male-06',
      'male-07',
      'male-08',
      'male-09',
      'male-10',
    ]);
  });

  it('resolves a preset file and prefers a custom photo', () => {
    expect(isUserAvatarPreset('male-03')).toBe(true);
    expect(isUserAvatarPreset('male-11')).toBe(false);
    expect(userAvatarFile('female-10')).toBe('/avatars/female/10.svg');
    expect(userAvatarSrc({ avatarPreset: 'teen-02' })).toBe('/avatars/teen/02.svg');
    expect(userAvatarSrc({ avatarPreset: 'teen-02', avatarDataUrl: 'data:image/png;base64,x' })).toBe(
      'data:image/png;base64,x',
    );
  });
});
