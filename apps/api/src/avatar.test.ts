import { describe, expect, it } from 'vitest';
import { parseAvatarIds, parseAvatarPayload, parseAvatarWrite, AVATAR_MAX_BASE64_CHARS } from './avatar.js';

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('avatar payload', () => {
  it('accepts a small png', () => {
    const parsed = parseAvatarPayload({ mime: 'image/png', dataBase64: PNG_1X1 });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.mime).toBe('image/png');
      expect(parsed.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    }
  });

  it('normalizes image/jpg', () => {
    const parsed = parseAvatarPayload({ mime: 'image/jpg', dataBase64: PNG_1X1 });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.mime).toBe('image/jpeg');
  });

  it('rejects gif and oversized base64', () => {
    expect(parseAvatarPayload({ mime: 'image/gif', dataBase64: PNG_1X1 }).ok).toBe(false);
    expect(parseAvatarPayload({ mime: 'image/png', dataBase64: 'A'.repeat(AVATAR_MAX_BASE64_CHARS + 1) }).ok).toBe(
      false,
    );
  });

  it('parses unique ids up to the cap', () => {
    expect(parseAvatarIds(' a, a, b ')).toEqual(['a', 'b']);
    expect(parseAvatarIds(undefined)).toEqual([]);
  });

  it('accepts a catalog preset and rejects mixed or unknown values', () => {
    expect(parseAvatarWrite({ avatarPreset: 'male-03' })).toEqual({ ok: true, kind: 'preset', preset: 'male-03' });
    expect(parseAvatarWrite({ avatarPreset: 'male-11' }).ok).toBe(false);
    expect(parseAvatarWrite({ avatarPreset: 'male-03', mime: 'image/png', dataBase64: PNG_1X1 }).ok).toBe(false);
    const uploaded = parseAvatarWrite({ mime: 'image/png', dataBase64: PNG_1X1 });
    expect(uploaded.ok).toBe(true);
    if (uploaded.ok) expect(uploaded.kind).toBe('upload');
  });
});
