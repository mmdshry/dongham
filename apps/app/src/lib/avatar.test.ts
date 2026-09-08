import { describe, expect, it } from 'vitest';
import {
  AVATAR_MAX_FILE_BYTES,
  assertAvatarFile,
  dataUrlBytes,
  landscapeCropRect,
  splitDataUrl,
  squareCropRect,
} from './avatar';

describe('avatar helpers', () => {
  it('crops a landscape image from the center', () => {
    expect(squareCropRect(400, 200)).toEqual({ sx: 100, sy: 0, side: 200 });
    expect(squareCropRect(100, 300)).toEqual({ sx: 0, sy: 100, side: 100 });
    expect(squareCropRect(256, 256)).toEqual({ sx: 0, sy: 0, side: 256 });
  });

  it('crops a landscape cover to 3:2', () => {
    expect(landscapeCropRect(900, 400)).toEqual({ sx: 150, sy: 0, sw: 600, sh: 400 });
    expect(landscapeCropRect(300, 400)).toEqual({ sx: 0, sy: 100, sw: 300, sh: 200 });
  });

  it('rejects files over 30MB and non-images', () => {
    const huge = new File([new Uint8Array(1)], 'x.png', { type: 'image/png' });
    Object.defineProperty(huge, 'size', { value: AVATAR_MAX_FILE_BYTES + 1 });
    expect(() => assertAvatarFile(huge)).toThrow(/۳۰/);
    expect(() => assertAvatarFile(new File([new Uint8Array(4)], 'x.txt', { type: 'text/plain' }))).toThrow(
      /تصویری/,
    );
    expect(() => assertAvatarFile(new File([new Uint8Array(4)], 'x.png', { type: 'image/png' }))).not.toThrow();
  });

  it('splits a data url and estimates bytes', () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const { mime, dataBase64 } = splitDataUrl(png);
    expect(mime).toBe('image/png');
    expect(dataUrlBytes(png)).toBe(Math.floor((dataBase64.length * 3) / 4));
    expect(() => splitDataUrl('not-a-data-url')).toThrow();
  });
});
