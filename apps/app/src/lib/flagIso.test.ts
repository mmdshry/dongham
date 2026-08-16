import { describe, expect, it } from 'vitest';
import { flagCdnUrl, flagEmojiToIso2 } from './flagIso';

describe('flagEmojiToIso2', () => {
  it('maps country and EU flags', () => {
    expect(flagEmojiToIso2('🇺🇸')).toBe('US');
    expect(flagEmojiToIso2('🇪🇺')).toBe('EU');
    expect(flagEmojiToIso2('🇦🇺')).toBe('AU');
    expect(flagEmojiToIso2('🟡')).toBeNull();
    expect(flagCdnUrl('EU')).toBe('https://flagcdn.com/w40/eu.png');
  });
});
