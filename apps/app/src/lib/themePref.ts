import { useEffect, useState } from 'react';

export const THEME_STORAGE_KEY = 'dongham.theme';
export type ThemePref = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_META_LIGHT = '#4A6B5C';
export const THEME_META_DARK = '#0B0F14';

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'light';
}

export function resolveTheme(pref: ThemePref = readThemePref()): ResolvedTheme {
  if (pref === 'dark') return 'dark';
  if (
    pref === 'system' &&
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

export function applyTheme(pref: ThemePref = readThemePref()): ResolvedTheme {
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? THEME_META_DARK : THEME_META_LIGHT);
  window.dispatchEvent(new CustomEvent('dongham-theme', { detail: resolved }));
  return resolved;
}

export function writeThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
  applyTheme(pref);
}

export function useThemePref(): [ThemePref, (pref: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(readThemePref);
  useEffect(() => {
    applyTheme(pref);
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);
  return [
    pref,
    (next) => {
      writeThemePref(next);
      setPref(next);
    },
  ];
}
