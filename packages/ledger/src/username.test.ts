import { describe, expect, it } from 'vitest';
import {
  isPublicProfilePath,
  parseUsername,
  RESERVED_USERNAMES,
  usernameFromPath,
} from './username.js';

describe('parseUsername', () => {
  it('accepts a letter then digits, lowercases, and strips @', () => {
    expect(parseUsername('MmdShry')).toEqual({ ok: true, username: 'mmdshry' });
    expect(parseUsername('@Ali12')).toEqual({ ok: true, username: 'ali12' });
    expect(parseUsername('  ali۱۲  ')).toEqual({ ok: true, username: 'ali12' });
  });

  it('rejects empty, symbols, leading digits, and short values', () => {
    expect(parseUsername('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseUsername('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(parseUsername('ab')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseUsername('1ali')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseUsername('_ali')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseUsername('ali-name')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseUsername('ali.name')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseUsername('علی')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseUsername('a'.repeat(21))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects reserved slugs even when they match the pattern', () => {
    expect(parseUsername('app')).toEqual({ ok: false, reason: 'reserved' });
    expect(parseUsername('Profile')).toEqual({ ok: false, reason: 'reserved' });
    expect(parseUsername('travel')).toEqual({ ok: false, reason: 'reserved' });
    expect(RESERVED_USERNAMES.has('i')).toBe(true);
  });
});

describe('usernameFromPath', () => {
  it('extracts a valid public slug and ignores reserved or nested paths', () => {
    expect(usernameFromPath('/mmdshry')).toBe('mmdshry');
    expect(usernameFromPath('/mmdshry/')).toBe('mmdshry');
    expect(usernameFromPath('/MmdShry?x=1')).toBe('mmdshry');
    expect(usernameFromPath('/profile')).toBeUndefined();
    expect(usernameFromPath('/app')).toBeUndefined();
    expect(usernameFromPath('/i/token')).toBeUndefined();
    expect(usernameFromPath('/foo-bar')).toBeUndefined();
    expect(isPublicProfilePath('/ali12')).toBe(true);
    expect(isPublicProfilePath('/auth')).toBe(false);
  });
});
