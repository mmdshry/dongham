export const AVATAR_MAX_BASE64_CHARS = 110_000;
export const AVATAR_MAX_IDS = 50;

const ALLOWED_MIME = new Set(['image/webp', 'image/jpeg', 'image/png']);
const PRESET_RE = /^(male|female|teen|child)-(0[1-9]|10)$/;

export function isUserAvatarPreset(value: unknown): value is string {
  return typeof value === 'string' && PRESET_RE.test(value);
}

export function normalizeUserAvatarPreset(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const id = value.trim();
  return PRESET_RE.test(id) ? id : undefined;
}

export function normalizeAvatarMime(mime: unknown): string | null {
  if (typeof mime !== 'string') return null;
  const value = mime.trim().toLowerCase();
  if (value === 'image/jpg') return 'image/jpeg';
  return ALLOWED_MIME.has(value) ? value : null;
}

export function parseAvatarIds(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (!id || id.length > 32 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= AVATAR_MAX_IDS) break;
  }
  return out;
}

export function parseAvatarPayload(body: {
  mime?: unknown;
  dataBase64?: unknown;
}): { ok: true; mime: string; dataUrl: string } | { ok: false; error: string } {
  const mime = normalizeAvatarMime(body.mime);
  if (!mime) return { ok: false, error: 'فرمت عکس نامعتبر است' };
  if (typeof body.dataBase64 !== 'string') return { ok: false, error: 'فایل نامعتبر است' };
  const dataBase64 = body.dataBase64.replace(/\s/g, '');
  if (!dataBase64) return { ok: false, error: 'فایل نامعتبر است' };
  if (dataBase64.length > AVATAR_MAX_BASE64_CHARS) {
    return { ok: false, error: 'فایل نامعتبر یا خیلی بزرگ است' };
  }
  if (!/^[A-Za-z0-9+/]+=*$/.test(dataBase64)) return { ok: false, error: 'فایل نامعتبر است' };
  return { ok: true, mime, dataUrl: `data:${mime};base64,${dataBase64}` };
}

export function parseAvatarWrite(body: {
  mime?: unknown;
  dataBase64?: unknown;
  avatarPreset?: unknown;
}):
  | { ok: true; kind: 'preset'; preset: string }
  | { ok: true; kind: 'upload'; mime: string; dataUrl: string }
  | { ok: false; error: string } {
  const preset = typeof body.avatarPreset === 'string' ? body.avatarPreset.trim() : '';
  const hasUpload = body.mime != null || (typeof body.dataBase64 === 'string' && body.dataBase64.length > 0);
  if (preset && hasUpload) return { ok: false, error: 'فقط یکی از عکس یا آواتار آماده را بفرستید' };
  if (preset) {
    if (!isUserAvatarPreset(preset)) return { ok: false, error: 'آواتار نامعتبر است' };
    return { ok: true, kind: 'preset', preset };
  }
  const parsed = parseAvatarPayload(body);
  if (!parsed.ok) return parsed;
  return { ok: true, kind: 'upload', mime: parsed.mime, dataUrl: parsed.dataUrl };
}

export type VisibleAvatar = {
  userId: string;
  dataUrl?: string;
  preset?: string;
  updatedAt: string;
};
