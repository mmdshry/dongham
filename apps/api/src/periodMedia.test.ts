import { describe, expect, it } from 'vitest';
import { AVATAR_MAX_BASE64_CHARS } from './avatar.js';
import { applyPeriodMedia, parseCoverWrite, parseStoredDataUrl } from './periodMedia.js';
import type { PeriodRecord } from './types.js';

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function period(): PeriodRecord {
  return {
    id: 'abc1234',
    title: 'تست',
    currency: 'IRT',
    ownerId: 'u1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

describe('period media payload', () => {
  it('accepts a stored data url and a known preset', () => {
    const parsed = parseStoredDataUrl(`data:image/png;base64,${PNG_1X1}`);
    expect(parsed.ok).toBe(true);
    const row = period();
    expect(applyPeriodMedia(row, { coverPreset: 'fitness' })).toBeUndefined();
    expect(row.coverPreset).toBe('fitness');
  });

  it('rejects oversized cover data urls', () => {
    const row = period();
    const err = applyPeriodMedia(row, {
      coverDataUrl: `data:image/png;base64,${'A'.repeat(AVATAR_MAX_BASE64_CHARS + 1)}`,
    });
    expect(err).toBeTruthy();
    expect(row.coverDataUrl).toBeUndefined();
  });

  it('clears custom media when null is sent', () => {
    const row = period();
    row.coverDataUrl = `data:image/png;base64,${PNG_1X1}`;
    expect(applyPeriodMedia(row, { coverDataUrl: null as unknown as string })).toBeUndefined();
    expect(row.coverDataUrl).toBeUndefined();
  });

  it('parses cover writes as preset or upload, not both', () => {
    expect(parseCoverWrite({ coverPreset: 'fitness' })).toEqual({ ok: true, kind: 'preset', preset: 'fitness' });
    expect(parseCoverWrite({ coverPreset: 'nope' }).ok).toBe(false);
    expect(parseCoverWrite({ coverPreset: 'fitness', mime: 'image/png', dataBase64: PNG_1X1 }).ok).toBe(false);
    const uploaded = parseCoverWrite({ mime: 'image/png', dataBase64: PNG_1X1 });
    expect(uploaded.ok).toBe(true);
    if (uploaded.ok) expect(uploaded.kind).toBe('upload');
  });
});
