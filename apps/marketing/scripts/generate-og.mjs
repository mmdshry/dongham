import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mix, sampleMark } from '../../app/scripts/brand-mark.mjs';

const W = 1200;
const H = 630;
const CREAM = [246, 240, 232];
const MARK = 280;

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

function encodePng(width, height, paint) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(ROOT, 'public', 'og.png');
mkdirSync(dirname(out), { recursive: true });

const cx = (W - MARK) / 2;
const cy = (H - MARK) / 2;
const png = encodePng(W, H, (x, y) => {
  const base = [CREAM[0], CREAM[1], CREAM[2], 255];
  if (x < cx || y < cy || x >= cx + MARK || y >= cy + MARK) return base;
  const nx = (x - cx) / MARK;
  const ny = (y - cy) / MARK;
  const mark = sampleMark(nx, ny);
  const t = mark[3] / 255;
  if (t <= 0) return base;
  return [mix(base[0], mark[0], t), mix(base[1], mark[1], t), mix(base[2], mark[2], t), 255];
});

writeFileSync(out, png);
console.log('wrote', out);
