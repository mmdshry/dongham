import { describe, expect, it } from 'vitest';
import {
  COVER_FILES,
  periodCover,
  periodCoverSrc,
  presetFromTemplate,
  stripPeriodCustomMedia,
} from './periodCover';

describe('period media resolver', () => {
  it('maps templates to the matching preset cover', () => {
    expect(presetFromTemplate('travel')).toBe('travel');
    expect(presetFromTemplate('household')).toBe('home');
    expect(presetFromTemplate('custom')).toBe('empty');
    expect(periodCover('ziarat')).toBe(COVER_FILES.ziarat);
  });

  it('prefers custom data url then preset then template fallback', () => {
    expect(periodCoverSrc({ template: 'custom' })).toBe(COVER_FILES.empty);
    expect(periodCoverSrc({ template: 'custom', coverPreset: 'fitness' })).toBe(COVER_FILES.fitness);
    expect(periodCoverSrc({ coverPreset: 'fitness', coverDataUrl: 'data:image/jpeg;base64,x' })).toBe(
      'data:image/jpeg;base64,x',
    );
  });

  it('strips custom blobs for QR snapshots', () => {
    const stripped = stripPeriodCustomMedia({
      coverPreset: 'home',
      coverDataUrl: 'data:image/jpeg;base64,x',
    });
    expect(stripped.coverPreset).toBe('home');
    expect(stripped.coverDataUrl).toBeUndefined();
  });
});
