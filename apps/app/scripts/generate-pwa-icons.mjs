import { deflateSync } from 'node:zlib';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { faviconSvg, sampleWhite } from './brand-mark.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

function paintAa(size, sample) {
  const aa = 2;
  return encodePng(size, (x, y) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let oy = 0; oy < aa; oy++) {
      for (let ox = 0; ox < aa; ox++) {
        const nx = (x + (ox + 0.5) / aa) / size;
        const ny = (y + (oy + 0.5) / aa) / size;
        const c = sample(nx, ny);
        r += c[0];
        g += c[1];
        b += c[2];
        a += c[3];
      }
    }
    const n = aa * aa;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round(a / n)];
  });
}

function writePng(path, size, sample) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, paintAa(size, sample));
}

const sampleIcon = (nx, ny) => sampleWhite(nx, ny, 0.08);
const sampleMaskable = (nx, ny) => sampleWhite(nx, ny, 0.2);

const webIcons = join(ROOT, 'public', 'icons');
writePng(join(webIcons, 'icon-192.png'), 192, sampleIcon);
writePng(join(webIcons, 'icon-512.png'), 512, sampleIcon);
writePng(join(webIcons, 'icon-512-maskable.png'), 512, sampleMaskable);
writePng(join(webIcons, 'apple-touch-icon.png'), 180, sampleIcon);

const favicon = join(ROOT, 'public', 'favicon.svg');
writeFileSync(favicon, faviconSvg());
for (const dest of [
  join(ROOT, '..', 'admin', 'public', 'favicon.svg'),
  join(ROOT, '..', 'marketing', 'public', 'favicon.svg'),
]) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(favicon, dest);
}

const apple = join(webIcons, 'apple-touch-icon.png');
for (const dest of [
  join(ROOT, '..', 'admin', 'public', 'icons', 'apple-touch-icon.png'),
  join(ROOT, '..', 'marketing', 'public', 'icons', 'apple-touch-icon.png'),
]) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(apple, dest);
}

const emailLogo = join(ROOT, '..', 'api', 'src', 'assets', 'email-logo.png');
writePng(emailLogo, 192, sampleIcon);

console.log('wrote web icons, favicons, and email logo');
