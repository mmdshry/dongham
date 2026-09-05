import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function encodePng(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function paintIcon(x, y, size) {
  const s = size;
  const nx = x / s;
  const ny = y / s;
  const radius = 0.22;
  const inRoundRect = (() => {
    const r = 0.18;
    const px = Math.min(Math.max(nx, r), 1 - r);
    const py = Math.min(Math.max(ny, r), 1 - r);
    const dx = (nx - px) / r;
    const dy = (ny - py) / r;
    return dx * dx + dy * dy <= 1;
  })();
  if (!inRoundRect) return [0, 0, 0, 0];

  const bg = [74, 107, 92, 255];
  const left = { cx: 0.34, cy: 0.44, r: 0.125, c: [197, 209, 200] };
  const right = { cx: 0.66, cy: 0.44, r: 0.125, c: [238, 243, 239] };
  const d2 = (c) => {
    const dx = nx - c.cx;
    const dy = ny - c.cy;
    return Math.sqrt(dx * dx + dy * dy);
  };
  let r = bg[0];
  let g = bg[1];
  let b = bg[2];
  for (const circle of [left, right]) {
    const d = d2(circle);
    if (d < circle.r) {
      const t = 1 - d / circle.r;
      const edge = Math.min(1, t * 8);
      r = mix(r, circle.c[0], edge);
      g = mix(g, circle.c[1], edge);
      b = mix(b, circle.c[2], edge);
    }
  }
  const smileY = 0.68 + Math.pow((nx - 0.5) / 0.28, 2) * 0.08;
  const smile = Math.abs(ny - smileY) < 0.035 && nx > 0.28 && nx < 0.72;
  if (smile) {
    r = mix(r, 255, 0.95);
    g = mix(g, 250, 0.95);
    b = mix(b, 245, 0.95);
  }
  return [r, g, b, 255];
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'icon-192.png'), encodePng(192, paintIcon));
writeFileSync(join(dir, 'icon-512.png'), encodePng(512, paintIcon));
console.log('wrote', dir);
