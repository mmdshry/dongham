export const PERIOD_MEDIA_PRESETS = [
  'empty',
  'home',
  'travel',
  'work',
  'family',
  'dorm',
  'ziarat',
  'wedding',
  'building',
  'fitness',
] as const;

export type PeriodMediaPreset = (typeof PERIOD_MEDIA_PRESETS)[number];

export const COVER_FILES: Record<PeriodMediaPreset, string> = {
  empty: '/theme/cover-empty.jpg',
  home: '/theme/cover-home.jpg',
  travel: '/theme/cover-travel.jpg',
  work: '/theme/cover-work.jpg',
  family: '/theme/cover-family.jpg',
  dorm: '/theme/cover-dorm.jpg',
  ziarat: '/theme/cover-ziarat.jpg',
  wedding: '/theme/cover-wedding.jpg',
  building: '/theme/cover-building.jpg',
  fitness: '/theme/cover-fitness.jpg',
};

export const COVER_EMPTY = COVER_FILES.empty;

export const PERIOD_MEDIA_LABELS: Record<PeriodMediaPreset, string> = {
  empty: 'ساده',
  home: 'خانه',
  travel: 'سفر',
  work: 'کار',
  family: 'خانواده',
  dorm: 'خوابگاه',
  ziarat: 'زیارت',
  wedding: 'جشن',
  building: 'ساختمان',
  fitness: 'ورزش',
};

const TEMPLATE_PRESET: Record<string, PeriodMediaPreset> = {
  travel: 'travel',
  household: 'home',
  custom: 'empty',
  work: 'work',
  family: 'family',
  dorm: 'dorm',
  ziarat: 'ziarat',
  wedding: 'wedding',
  building: 'building',
};

export function presetFromTemplate(template?: string): PeriodMediaPreset {
  return TEMPLATE_PRESET[template || ''] || 'empty';
}

export function periodCover(id: string): string {
  if (id in COVER_FILES) return COVER_FILES[id as PeriodMediaPreset];
  return COVER_FILES[presetFromTemplate(id)];
}

export function periodCoverSrc(period: {
  template?: string;
  coverPreset?: string;
  coverDataUrl?: string;
}): string {
  if (period.coverDataUrl) return period.coverDataUrl;
  if (period.coverPreset && period.coverPreset in COVER_FILES) {
    return COVER_FILES[period.coverPreset as PeriodMediaPreset];
  }
  return COVER_FILES[presetFromTemplate(period.template)];
}

export function stripPeriodCustomMedia<T extends { coverDataUrl?: string }>(period: T): T {
  const next = { ...period };
  delete next.coverDataUrl;
  return next;
}

export function periodMediaFields(period: { coverPreset?: string; coverDataUrl?: string }): {
  coverPreset?: string;
  coverDataUrl?: string;
} {
  return {
    ...(period.coverPreset ? { coverPreset: period.coverPreset } : {}),
    ...(period.coverDataUrl ? { coverDataUrl: period.coverDataUrl } : {}),
  };
}

export function periodMediaSyncPayload(period: { coverPreset?: string; coverDataUrl?: string }): {
  coverPreset?: string;
  coverDataUrl?: string;
} {
  return {
    coverPreset: period.coverPreset,
    coverDataUrl: period.coverDataUrl,
  };
}
