/**
 * Client-side receipt heuristics (filename / pasted text).
 * Not a real OCR engine — amounts are treated as toman when the expense currency is IRT.
 */

export interface OcrResult {
  title: string;
  amountToman: number | null;
  items: { name: string; amountToman: number }[];
  confidence: number;
  source: 'heuristic' | 'manual';
}

const AMOUNT_RE = /(\d{1,3}(?:[,\u066C]\d{3})+|\d+)(?:\s*(?:تومان|ریال|IRR|IRT))?/g;

export async function parseReceiptHeuristic(
  fileName: string,
  optionalText?: string,
): Promise<OcrResult> {
  const text = `${fileName}\n${optionalText || ''}`;
  const amounts: number[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const n = Number(m[1].replace(/[,\u066C]/g, ''));
    if (!Number.isNaN(n) && n > 0) amounts.push(n);
  }
  const amountToman = amounts.length ? Math.max(...amounts) : null;
  const title =
    fileName
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim() || 'رسید';

  return {
    title,
    amountToman,
    items: amountToman
      ? [{ name: title, amountToman }]
      : [],
    confidence: amountToman ? 0.45 : 0.1,
    source: 'heuristic',
  };
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Compress image for offline storage */
export async function compressImage(file: File, maxWidth = 1280, quality = 0.72): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  if (!file.type.startsWith('image/')) return dataUrl;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', quality);
}
