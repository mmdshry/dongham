/** Open Dongham mark in a 64×64 viewBox. Keep rasterizers and favicon.svg in sync. */

export const BRAND = [94, 114, 98];
export const LEFT = [197, 209, 200];
export const RIGHT = [238, 243, 239];
export const WHITE = [255, 255, 255];

const LEFT_CX = 24 / 64;
const RIGHT_CX = 40 / 64;
const CY = 26 / 64;
const RADIUS = 12 / 64;
const STROKE_HALF = 1.8 / 2 / 64;
const SMILE_HALF = 3.4 / 2 / 64;

const SMILE_P0 = { x: 16 / 64, y: 46 / 64 };
const SMILE_P1 = { x: 26 / 64, y: 56 / 64 };
const SMILE_P2 = { x: 38 / 64, y: 56 / 64 };
const SMILE_P3 = { x: 48 / 64, y: 46 / 64 };

function bezierPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

const SMILE_SAMPLES = Array.from({ length: 49 }, (_, i) =>
  bezierPoint(i / 48, SMILE_P0, SMILE_P1, SMILE_P2, SMILE_P3),
);

export function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

export function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

export function cover(dist, pixel) {
  return clamp(0.5 - dist / pixel, 0, 1);
}

function distToSmile(x, y) {
  let min = Infinity;
  for (let i = 0; i < SMILE_SAMPLES.length - 1; i++) {
    const a = SMILE_SAMPLES[i];
    const b = SMILE_SAMPLES[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1e-8;
    const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / len2, 0, 1);
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < min) min = d;
  }
  return min;
}

export function sampleMark(nx, ny) {
  const pixel = 1 / 64;
  const dL = Math.hypot(nx - LEFT_CX, ny - CY);
  const dR = Math.hypot(nx - RIGHT_CX, ny - CY);
  const leftFill = cover(dL - RADIUS, pixel);
  const leftStroke = cover(Math.abs(dL - RADIUS) - STROKE_HALF, pixel);
  const rightFill = cover(dR - RADIUS, pixel);
  const rightStroke = cover(Math.abs(dR - RADIUS) - STROKE_HALF, pixel);
  const smile = cover(distToSmile(nx, ny) - SMILE_HALF, pixel);
  let r = BRAND[0];
  let g = BRAND[1];
  let b = BRAND[2];
  let a = 0;
  const paint = (c, t) => {
    if (t <= 0) return;
    r = mix(r, c[0], t);
    g = mix(g, c[1], t);
    b = mix(b, c[2], t);
    a = mix(a, 255, t);
  };
  paint(LEFT, leftFill);
  paint(BRAND, leftStroke);
  paint(RIGHT, rightFill);
  paint(BRAND, rightStroke);
  paint(BRAND, smile);
  return [r, g, b, a];
}

export function mapInner(nx, ny, pad) {
  const s = 1 - 2 * pad;
  return { x: (nx - pad) / s, y: (ny - pad) / s };
}

export function overlayMark(base, nx, ny, pad) {
  const p = mapInner(nx, ny, pad);
  if (p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05) return base;
  const m = sampleMark(p.x, p.y);
  const t = m[3] / 255;
  if (t <= 0) return base;
  return [mix(base[0], m[0], t), mix(base[1], m[1], t), mix(base[2], m[2], t), mix(base[3], 255, t)];
}

export function sampleWhite(nx, ny, pad = 0.08) {
  return overlayMark([WHITE[0], WHITE[1], WHITE[2], 255], nx, ny, pad);
}

export function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <circle cx="24" cy="26" r="12" fill="#C5D1C8" stroke="#5E7262" stroke-width="1.8"/>
  <circle cx="40" cy="26" r="12" fill="#EEF3EF" stroke="#5E7262" stroke-width="1.8"/>
  <path d="M16 46C26 56 38 56 48 46" stroke="#5E7262" stroke-width="3.4" stroke-linecap="round"/>
</svg>
`;
}
