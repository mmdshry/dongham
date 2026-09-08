import { parseAvatarPayload } from './avatar.js';
import type { PeriodRecord } from './types.js';

export const PERIOD_MEDIA_PRESETS = [
  'travel',
  'home',
  'work',
  'family',
  'dorm',
  'ziarat',
  'wedding',
  'building',
  'fitness',
  'empty',
] as const;

export function normalizePeriodPreset(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') return undefined;
  const id = value.trim();
  return (PERIOD_MEDIA_PRESETS as readonly string[]).includes(id) ? id : undefined;
}

export function parseStoredDataUrl(
  raw: unknown,
): { ok: true; dataUrl?: string } | { ok: false; error: string } {
  if (raw == null || raw === '') return { ok: true, dataUrl: undefined };
  if (typeof raw !== 'string') return { ok: false, error: 'فایل نامعتبر است' };
  const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(raw.trim());
  if (!match) return { ok: false, error: 'فایل نامعتبر است' };
  const parsed = parseAvatarPayload({ mime: match[1], dataBase64: match[2] });
  if (!parsed.ok) return parsed;
  return { ok: true, dataUrl: parsed.dataUrl };
}

export function parseCoverWrite(body: {
  mime?: unknown;
  dataBase64?: unknown;
  coverPreset?: unknown;
}):
  | { ok: true; kind: 'preset'; preset: string }
  | { ok: true; kind: 'upload'; dataUrl: string }
  | { ok: false; error: string } {
  const presetRaw = typeof body.coverPreset === 'string' ? body.coverPreset.trim() : '';
  const hasUpload = body.mime != null || (typeof body.dataBase64 === 'string' && body.dataBase64.length > 0);
  if (presetRaw && hasUpload) return { ok: false, error: 'فقط یکی از عکس یا بک‌گراند آماده را بفرستید' };
  if (presetRaw) {
    const preset = normalizePeriodPreset(presetRaw);
    if (!preset) return { ok: false, error: 'بک‌گراند نامعتبر است' };
    return { ok: true, kind: 'preset', preset };
  }
  const parsed = parseAvatarPayload(body);
  if (!parsed.ok) return parsed;
  return { ok: true, kind: 'upload', dataUrl: parsed.dataUrl };
}

export type PeriodMediaPatch = {
  coverPreset?: string | null;
  coverDataUrl?: string | null;
};

export function applyPeriodMedia(target: PeriodRecord, payload: PeriodMediaPatch): string | undefined {
  const coverParsed = 'coverDataUrl' in payload ? parseStoredDataUrl(payload.coverDataUrl) : undefined;
  if (coverParsed && !coverParsed.ok) return coverParsed.error;

  if ('coverPreset' in payload) {
    const preset = normalizePeriodPreset(payload.coverPreset);
    if (preset) target.coverPreset = preset;
    else if (!payload.coverPreset) delete target.coverPreset;
  }
  if (coverParsed?.ok) {
    if (coverParsed.dataUrl) target.coverDataUrl = coverParsed.dataUrl;
    else delete target.coverDataUrl;
  }
  return undefined;
}

export function periodMediaSql(period: PeriodRecord) {
  return {
    coverPreset: period.coverPreset || null,
    coverDataUrl: period.coverDataUrl || null,
  };
}
