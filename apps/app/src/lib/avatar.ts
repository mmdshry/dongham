export const AVATAR_MAX_FILE_BYTES = 30 * 1024 * 1024;
export const AVATAR_MAX_EDGE = 256;
export const AVATAR_TARGET_BYTES = 40 * 1024;
export const AVATAR_HARD_MAX_BYTES = 80 * 1024;

export const COVER_MAX_WIDTH = 720;
export const COVER_TARGET_BYTES = 70 * 1024;
export const COVER_HARD_MAX_BYTES = 80 * 1024;

export function squareCropRect(width: number, height: number): { sx: number; sy: number; side: number } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const side = Math.min(w, h);
  return {
    sx: Math.floor((w - side) / 2),
    sy: Math.floor((h - side) / 2),
    side,
  };
}

export function landscapeCropRect(
  width: number,
  height: number,
  ratio = 3 / 2,
): { sx: number; sy: number; sw: number; sh: number } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  if (w / h > ratio) {
    const sw = Math.max(1, Math.floor(h * ratio));
    return { sx: Math.floor((w - sw) / 2), sy: 0, sw, sh: h };
  }
  const sh = Math.max(1, Math.floor(w / ratio));
  return { sx: 0, sy: Math.floor((h - sh) / 2), sw: w, sh };
}

export function splitDataUrl(dataUrl: string): { mime: string; dataBase64: string } {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(dataUrl.trim());
  if (!match) throw new Error('فایل نامعتبر است');
  return { mime: match[1]!, dataBase64: match[2]!.replace(/\s/g, '') };
}

export function dataUrlBytes(dataUrl: string): number {
  const { dataBase64 } = splitDataUrl(dataUrl);
  return Math.floor((dataBase64.length * 3) / 4);
}

export function assertAvatarFile(file: File): void {
  if (file.size > AVATAR_MAX_FILE_BYTES) {
    throw new Error('حجم عکس باید حداکثر ۳۰ مگابایت باشد');
  }
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('فقط فایل تصویری مجاز است');
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('خواندن فایل ممکن نشد'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('این فرمت عکس پشتیبانی نمی‌شود'));
    el.src = src;
  });
}

function encodeCanvas(canvas: HTMLCanvasElement, mime: 'image/webp' | 'image/jpeg', quality: number): string {
  return canvas.toDataURL(mime, quality);
}

export async function compressAvatar(file: File): Promise<string> {
  const img = await loadFileImage(file);
  const { sx, sy, side } = squareCropRect(img.width, img.height);
  const out = Math.max(1, Math.min(AVATAR_MAX_EDGE, side));
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('فشرده‌سازی عکس ممکن نشد');
  ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
  return encodeDown(canvas, AVATAR_TARGET_BYTES, AVATAR_HARD_MAX_BYTES);
}

async function loadFileImage(file: File): Promise<HTMLImageElement> {
  assertAvatarFile(file);
  let dataUrl: string;
  try {
    dataUrl = await fileToDataUrl(file);
  } catch {
    throw new Error('خواندن فایل ممکن نشد');
  }
  let img: HTMLImageElement;
  try {
    img = await loadImage(dataUrl);
  } catch {
    throw new Error('این فرمت عکس پشتیبانی نمی‌شود');
  }
  if (!img.width || !img.height) throw new Error('این فرمت عکس پشتیبانی نمی‌شود');
  return img;
}

function encodeDown(canvas: HTMLCanvasElement, targetBytes: number, hardMaxBytes: number): string {
  const tryEncode = (mime: 'image/webp' | 'image/jpeg') => {
    let quality = 0.62;
    let best = encodeCanvas(canvas, mime, quality);
    while (dataUrlBytes(best) > targetBytes && quality > 0.32) {
      quality -= 0.08;
      best = encodeCanvas(canvas, mime, quality);
    }
    return best;
  };
  let best = tryEncode('image/webp');
  if (!best.startsWith('data:image/webp') || dataUrlBytes(best) > hardMaxBytes) {
    best = tryEncode('image/jpeg');
  }
  if (dataUrlBytes(best) > hardMaxBytes) {
    throw new Error('نشد عکس را به اندازهٔ مجاز فشرده کرد');
  }
  return best;
}

export async function compressCover(file: File): Promise<string> {
  const img = await loadFileImage(file);
  const { sx, sy, sw, sh } = landscapeCropRect(img.width, img.height);
  const scale = Math.min(1, COVER_MAX_WIDTH / sw);
  const outW = Math.max(1, Math.round(sw * scale));
  const outH = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('فشرده‌سازی عکس ممکن نشد');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  return encodeDown(canvas, COVER_TARGET_BYTES, COVER_HARD_MAX_BYTES);
}
