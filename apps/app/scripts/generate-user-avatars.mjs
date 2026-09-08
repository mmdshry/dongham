import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Soft-sticker user avatars: 4 groups x 10, every hair silhouette unique, no head coverings.

const BG = '#F6F0E8';
const CREAM = '#FFFDF8';
const INK = '#3A2C24';

const SKIN = {
  light: '#F7D7BE',
  warm: '#F0C19A',
  tan: '#E0A878',
  bronze: '#C88858',
  deep: '#9A5A32',
  peach: '#F6CDB4',
};

const HAIR = {
  ink: '#2A221C',
  dark: '#3A2C24',
  brown: '#5C3D2E',
  chestnut: '#7A4E2E',
  black: '#1A1614',
  sand: '#D4B896',
  auburn: '#8B4B33',
};

const CLOTH = {
  sage: '#6B8574',
  sageDark: '#4A6354',
  clay: '#E0B07A',
  teal: '#7A9A98',
  forest: '#567064',
  terracotta: '#D4896A',
  sand: '#D4C09A',
  olive: '#7A8A62',
  blush: '#E8A0A8',
  sky: '#8AADC4',
};

const ACCENT = {
  rose: '#E27D8C',
  denim: '#5C7FA3',
  mint: '#7FB9A8',
  gold: '#D9A441',
  plum: '#8E6C9E',
  coral: '#E08A6A',
  slate: '#3A3A40',
};

/** Face grammar per group: proportions that make the category readable at a glance. */
const METRICS = {
  male: { headR: 72, headCy: 118, eyeR: 12, eyeGap: 23, eyeCy: 114, browY: 96, browW: 5, browCurve: -5, neckW: 46, shoulderRx: 98, blushRx: 12, blushRy: 7, blushOp: 0.3 },
  female: { headR: 72, headCy: 118, eyeR: 13.5, eyeGap: 23, eyeCy: 114, browY: 95, browW: 3, browCurve: -9, neckW: 36, shoulderRx: 88, blushRx: 14, blushRy: 8, blushOp: 0.45, lashes: true, lips: true },
  teen: { headR: 76, headCy: 120, eyeR: 14, eyeGap: 24, eyeCy: 116, browY: 98, browW: 4, browCurve: -7, neckW: 40, shoulderRx: 92, blushRx: 13, blushRy: 8, blushOp: 0.4 },
  child: { headR: 82, headCy: 122, eyeR: 16, eyeGap: 26, eyeCy: 118, browY: 98, browW: 3.5, browCurve: -6, neckW: 38, shoulderRx: 88, blushRx: 17, blushRy: 9.5, blushOp: 0.55 },
};

// ---------- geometry helpers ----------

const n = (v) => String(Math.round(v * 10) / 10);
const P = (x, y) => `${n(x)} ${n(y)}`;
const rad = (deg) => (deg * Math.PI) / 180;
/** Point on a circle around the head centre. 0 = right, 90 = chin, 180 = left, 270 = crown. */
const pt = (m, deg, R) => [128 + R * Math.cos(rad(deg)), m.headCy + R * Math.sin(rad(deg))];

function shade(hex, amount) {
  const v = hex.replace('#', '');
  const ch = (i) => Math.max(0, Math.min(255, parseInt(v.slice(i, i + 2), 16) + amount));
  return `#${[ch(0), ch(2), ch(4)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function shine(hair, cx, cy, rx, ry, rot = 0) {
  const t = rot ? ` transform="rotate(${rot} ${n(cx)} ${n(cy)})"` : '';
  return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${shade(hair, 40)}" opacity="0.28"${t}/>`;
}

function strokes(color, list, w = 2.4, op = 0.38) {
  return list
    .map(([x, y, rel]) => `<path d="M${P(x, y)} ${rel}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round" opacity="${op}"/>`)
    .join('\n    ');
}

/** Pie slice from the head centre; only the part outside the head circle ends up visible. */
function sector(m, from, to, R, fill, extra = '') {
  const [x1, y1] = pt(m, from, R);
  const [x2, y2] = pt(m, to, R);
  const large = to - from > 180 ? 1 : 0;
  return `<path d="M128 ${n(m.headCy)} L${P(x1, y1)} A${n(R)} ${n(R)} 0 ${large} 1 ${P(x2, y2)}Z" fill="${fill}"${extra}/>`;
}

/** Hair on both sides behind the ears, reaching `downDeg` below the horizontal. */
function sides(m, hair, pad, downDeg, extra = '') {
  const R = m.headR + pad;
  return `${sector(m, 180 - downDeg, 192, R, hair, extra)}
    ${sector(m, 348, 360 + downDeg, R, hair, extra)}`;
}

/** Skull cap drawn after the head: outer arc plus a hairline curve on the forehead. */
function capD(m, o = {}) {
  const { pad = 6, sideDeg = 8, line = 0.6, dip = 10, spread = 0.45 } = o;
  const R = m.headR + pad;
  const [lx, ly] = pt(m, 180 + sideDeg, R);
  const [rx, ry] = pt(m, 360 - sideDeg, R);
  const large = 180 - 2 * sideDeg > 180 ? 1 : 0;
  const hy = m.headCy - m.headR * line;
  const w = m.headR * spread;
  return `M${P(lx, ly)} A${n(R)} ${n(R)} 0 ${large} 1 ${P(rx, ry)} C${P(rx - 6, hy + dip + 10)} ${P(128 + w, hy)} ${P(128, hy)} C${P(128 - w, hy)} ${P(lx + 6, hy + dip + 10)} ${P(lx, ly)}Z`;
}

function cap(m, hair, o) {
  return `<path d="${capD(m, o)}" fill="${hair}"/>`;
}

const segsToD = (segs) =>
  segs
    .map((s) =>
      s[0] === 'L' ? `L${P(s[1], s[2])}` : s[0] === 'Q' ? `Q${P(s[1], s[2])} ${P(s[3], s[4])}` : `C${P(s[1], s[2])} ${P(s[3], s[4])} ${P(s[5], s[6])}`,
    )
    .join(' ');

/** Mirror a right-side descent around x=128 and traverse it upwards for the left side. */
function mirrorReverse(segs, startX, startY) {
  const mx = (x) => 256 - x;
  let prev = [startX, startY];
  const info = segs.map((s) => {
    const end = s[0] === 'L' ? [s[1], s[2]] : s[0] === 'Q' ? [s[3], s[4]] : [s[5], s[6]];
    const start = prev;
    prev = end;
    return { s, start };
  });
  const out = [];
  for (let i = info.length - 1; i >= 0; i--) {
    const { s, start } = info[i];
    if (s[0] === 'L') out.push(['L', mx(start[0]), start[1]]);
    else if (s[0] === 'Q') out.push(['Q', mx(s[1]), s[2], mx(start[0]), start[1]]);
    else out.push(['C', mx(s[3]), s[4], mx(s[1]), s[2], mx(start[0]), start[1]]);
  }
  return out;
}

/** Long hair behind the head that falls over the shoulders on both sides, leaving the neck open. */
function longBackD(m, o = {}) {
  const R = m.headR + (o.pad ?? 8);
  const width = o.width ?? m.headR + 12;
  const bottom = o.bottom ?? m.headCy + m.headR + 30;
  const inner = o.inner ?? m.neckW / 2 + 10;
  const [lx, ly] = pt(m, 190, R);
  const [rx, ry] = pt(m, 350, R);
  const xR = 128 + width;
  const yEnd = bottom - 18;
  const segs = [];
  if (o.wave) {
    const k = 3;
    const h = (yEnd - ry) / k;
    for (let i = 0; i < k; i++) segs.push(['Q', xR + o.wave, ry + h * (i + 0.5), xR - (i === k - 1 ? 0 : 6), ry + h * (i + 1)]);
  } else if (o.jag) {
    const k = 4;
    const h = (yEnd - ry) / k;
    segs.push(['C', xR + 4, ry + 16, xR + 2, ry + h - 8, xR, ry + h]);
    for (let i = 1; i < k; i++) {
      segs.push(['L', xR - 11, ry + h * i + 9]);
      segs.push(['L', xR - (i % 2) * 3, ry + h * (i + 1)]);
    }
  } else if (o.layers) {
    segs.push(['C', xR + 4, ry + 24, xR + 2, ry + 52, xR, ry + 62]);
    segs.push(['L', xR - 13, ry + 67]);
    segs.push(['C', xR - 8, ry + 92, xR + 2, yEnd - 30, xR, yEnd]);
  } else {
    segs.push(['C', xR + 6, ry + 20, xR + 2, yEnd - 40, xR, yEnd]);
  }
  segs.push(['Q', xR, bottom, xR - 18, bottom]);
  const leftSegs = mirrorReverse(segs, rx, ry);
  const innerBottom = o.tuck ? bottom - 10 : bottom;
  const mid = `L${P(128 + inner, innerBottom)} L${P(128 + inner, m.headCy + 10)} L${P(128 - inner, m.headCy + 10)} L${P(128 - inner, innerBottom)} L${P(128 - width + 18, bottom)}`;
  return `M${P(lx, ly)} A${n(R)} ${n(R)} 0 0 1 ${P(rx, ry)} ${segsToD(segs)} ${mid} ${segsToD(leftSegs)}Z`;
}

/** Tapered lock hanging from (x0,y0) to the tip (x1,y1). */
function tail(hair, x0, y0, x1, y1, w) {
  const my = (y0 + y1) / 2;
  return `<path d="M${P(x0 - w / 2, y0)} C${P(x0 - w / 2 - 8, my)} ${P(x1 - w / 3, y1 - 12)} ${P(x1, y1)} C${P(x1 + w / 3, y1 - 12)} ${P(x0 + w / 2 + 8, my)} ${P(x0 + w / 2, y0)}Z" fill="${hair}"/>`;
}

/** Braid: overlapping ovals alternating left/right, tied at the end. */
function braid(hair, x0, y0, len, count, tie, lean = 0) {
  const step = len / count;
  let s = '';
  for (let i = 0; i < count; i++) {
    const dx = (i % 2 ? 4 : -4) + lean * i;
    s += `<ellipse cx="${n(x0 + dx)}" cy="${n(y0 + step * i + step / 2)}" rx="9" ry="${n(step / 2 + 2.5)}" fill="${hair}"/>\n    `;
  }
  const ex = x0 + lean * count;
  s += `<path d="M${P(ex - 6, y0 + len + 2)} q6 14 12 0" fill="${hair}"/>
    <circle cx="${n(ex)}" cy="${n(y0 + len + 2)}" r="5" fill="${tie}"/>`;
  return s;
}

function bun(hair, cx, cy, r, tie) {
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${hair}"/>
    ${shine(hair, cx - r * 0.3, cy - r * 0.35, r * 0.45, r * 0.25)}
    ${tie ? `<ellipse cx="${n(cx)}" cy="${n(cy + r * 0.85)}" rx="${n(r * 0.6)}" ry="${n(r * 0.28)}" fill="${tie}"/>` : ''}`;
}

function bow(cx, cy, color) {
  return `<path d="M${P(cx, cy)} L${P(cx - 16, cy - 9)} Q${P(cx - 21, cy)} ${P(cx - 16, cy + 9)}Z" fill="${color}"/>
    <path d="M${P(cx, cy)} L${P(cx + 16, cy - 9)} Q${P(cx + 21, cy)} ${P(cx + 16, cy + 9)}Z" fill="${color}"/>
    <circle cx="${n(cx)}" cy="${n(cy)}" r="4.5" fill="${shade(color, -30)}"/>`;
}

function hairClip(cx, cy, color, rot) {
  return `<rect x="${n(cx - 8)}" y="${n(cy - 2.5)}" width="16" height="5" rx="2.5" fill="${color}" transform="rotate(${rot} ${n(cx)} ${n(cy)})"/>`;
}

function headband(m, color) {
  const R = m.headR + 4;
  const [x1, y1] = pt(m, 204, R);
  const [x2, y2] = pt(m, 336, R);
  return `<path d="M${P(x1, y1)} A${n(R)} ${n(R)} 0 0 1 ${P(x2, y2)}" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
}

/** Cap with a side part: hair sweeps from the part (px) across the forehead to the far temple. */
function sidePartD(m, pad, px, line, low) {
  const R = m.headR + pad;
  const cy = m.headCy;
  const hy = cy - m.headR * line;
  const sweepRight = px < 128;
  const [lx, ly] = pt(m, 190, R);
  const [rx, ry] = pt(m, 350, R);
  if (sweepRight) {
    return `M${P(lx, ly)} A${n(R)} ${n(R)} 0 0 1 ${P(rx, ry)} C${P(rx - 4, low)} ${P(128 + 36, low - 4)} ${P(128 + 14, hy + 10)} C${P(128 + 2, hy + 3)} ${P(px + 8, hy - 2)} ${P(px, hy)} C${P(px - 10, hy + 4)} ${P(lx + 4, hy + 26)} ${P(lx, ly)}Z`;
  }
  return `M${P(lx, ly)} A${n(R)} ${n(R)} 0 0 1 ${P(rx, ry)} C${P(rx - 4, hy + 26)} ${P(px + 10, hy + 4)} ${P(px, hy)} C${P(px - 8, hy - 2)} ${P(128 - 2, hy + 3)} ${P(128 - 14, hy + 10)} C${P(128 - 36, low - 4)} ${P(lx + 4, low)} ${P(lx, ly)}Z`;
}

function partLine(hair, x, y0, y1) {
  return `<path d="M${P(x, y0)} Q${P(x - 5, (y0 + y1) / 2)} ${P(x - 1, y1)}" stroke="${shade(hair, -34)}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
}

// ---------- hair library: 40 independent silhouettes ----------
// Each returns { back?, front?, over?, ears? }. back = behind head, front = after head, over = after face.

const STYLES = {
  // ----- male -----
  crew(m, h) {
    const top = m.headCy - m.headR;
    return {
      back: sides(m, h, 5, 16),
      front: `${cap(m, h, { pad: 5, sideDeg: 10, line: 0.6, dip: 6 })}
    ${strokes(shade(h, 42), [[116, top - 1, 'q7 -5 14 -1'], [136, top - 3, 'q7 -3 14 2'], [98, top + 9, 'q6 -7 13 -3']])}`,
    };
  },
  sidePart(m, h) {
    const top = m.headCy - m.headR;
    const hy = m.headCy - m.headR * 0.6;
    return {
      back: sides(m, h, 5, 14),
      front: `<path d="${sidePartD(m, 7, 106, 0.6, m.headCy - 10)}" fill="${h}"/>
    ${partLine(h, 106, hy + 1, top - 3)}
    ${shine(h, 152, top + 8, 20, 8)}`,
    };
  },
  quiff(m, h) {
    const top = m.headCy - m.headR;
    return {
      back: sides(m, h, 3, 10),
      front: `${cap(m, h, { pad: 6, sideDeg: 8, line: 0.64, dip: 8 })}
    <path d="M${P(82, top + 12)} C${P(94, top - 26)} ${P(166, top - 36)} ${P(182, top + 4)} C${P(162, top - 6)} ${P(112, top - 4)} ${P(82, top + 12)}Z" fill="${h}"/>
    ${shine(h, 140, top - 14, 22, 7, -8)}`,
    };
  },
  curlsTight(m, h) {
    const R = m.headR + 6;
    let ring = '';
    for (let d = 196; d <= 344; d += 13.5) {
      const [x, y] = pt(m, d, R);
      ring += `<circle cx="${n(x)}" cy="${n(y)}" r="8.5" fill="${h}"/>\n    `;
    }
    for (let d = 214; d <= 326; d += 22) {
      const [x, y] = pt(m, d, R - 11);
      ring += `<circle cx="${n(x)}" cy="${n(y)}" r="7.5" fill="${h}"/>\n    `;
    }
    const behind = [168, 192, 348, 12].map((d) => {
      const [x, y] = pt(m, d, R - 1);
      return `<circle cx="${n(x)}" cy="${n(y)}" r="8.5" fill="${h}"/>`;
    });
    return {
      back: behind.join('\n    '),
      front: `${cap(m, h, { pad: 4, sideDeg: 8, line: 0.58, dip: 8 })}
    ${ring}${shine(h, 118, m.headCy - m.headR + 4, 14, 7)}`,
    };
  },
  wavesShort(m, h) {
    const R = m.headR + 6;
    const [lx, ly] = pt(m, 188, R);
    const [rx, ry] = pt(m, 352, R);
    const hy = m.headCy - m.headR * 0.62;
    const top = m.headCy - m.headR;
    return {
      back: sides(m, h, 5, 14),
      front: `<path d="M${P(lx, ly)} A${n(R)} ${n(R)} 0 0 1 ${P(rx, ry)} C${P(rx - 6, hy + 22)} ${P(174, hy + 2)} ${P(162, hy + 5)} Q${P(145, hy + 12)} ${P(128, hy + 3)} Q${P(111, hy + 12)} ${P(94, hy + 5)} C${P(82, hy + 2)} ${P(lx + 6, hy + 22)} ${P(lx, ly)}Z" fill="${h}"/>
    ${strokes(shade(h, 42), [[96, top + 8, 'q8 -7 16 0 t16 0'], [130, top - 2, 'q8 -6 16 0 t16 0'], [108, top + 20, 'q8 -6 16 0 t16 0']], 2.6)}`,
    };
  },
  fadeTextured(m, h) {
    const R = m.headR + 2;
    let tufts = '';
    for (let i = 0; i < 6; i++) {
      const d = 218 + i * 21;
      const [ax, ay] = pt(m, d - 7, R);
      const [bx, by] = pt(m, d + 7, R);
      const [tx, ty] = pt(m, d - 4, R + 15);
      tufts += `<path d="M${P(ax, ay)} L${P(tx, ty)} L${P(bx, by)}Z" fill="${h}"/>\n    `;
    }
    return {
      back: `${sector(m, 166, 204, R + 1, h, ' opacity="0.5"')}
    ${sector(m, 336, 374, R + 1, h, ' opacity="0.5"')}`,
      front: `${cap(m, h, { pad: 2, sideDeg: 22, line: 0.6, dip: 6 })}
    ${tufts}`,
    };
  },
  slickBack(m, h) {
    const top = m.headCy - m.headR;
    const hy = m.headCy - m.headR * 0.74;
    const lines = [-22, -8, 6, 20].map((dx) => [128 + dx, hy + 3, `C${P(128 + dx * 1.2, top - 4)} ${P(128 + dx * 2, top + 4)} ${P(128 + dx * 2.6, m.headCy - 34)}`]);
    return {
      back: sides(m, h, 6, 12),
      front: `${cap(m, h, { pad: 8, sideDeg: 6, line: 0.74, dip: 2, spread: 0.5 })}
    ${strokes(shade(h, 44), lines, 2.4, 0.4)}`,
    };
  },
  tousled(m, h) {
    const R = m.headR + 4;
    const degs = [205, 228, 250, 272, 294, 316, 338];
    const rx = [14, 16, 13, 17, 14, 16, 13];
    const ry = [10, 12, 9, 13, 10, 12, 9];
    const bumps = degs
      .map((d, i) => {
        const [x, y] = pt(m, d, R);
        return `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${rx[i]}" ry="${ry[i]}" fill="${h}" transform="rotate(${d + 90} ${n(x)} ${n(y)})"/>`;
      })
      .join('\n    ');
    const [sx, sy] = pt(m, 262, R + 12);
    return {
      back: sides(m, h, 6, 14),
      front: `${cap(m, h, { pad: 5, sideDeg: 8, line: 0.58, dip: 10 })}
    ${bumps}
    <path d="M${P(sx - 10, sy + 6)} Q${P(sx - 2, sy - 12)} ${P(sx + 8, sy + 2)}Z" fill="${h}"/>
    ${shine(h, 122, m.headCy - m.headR + 2, 12, 6)}`,
    };
  },
  topKnot(m, h) {
    const top = m.headCy - m.headR;
    return {
      back: sides(m, h, 1, 8, ' opacity="0.4"'),
      front: `${cap(m, h, { pad: 2, sideDeg: 14, line: 0.6, dip: 6 })}
    ${bun(h, 136, top - 8, 15, shade(h, -26))}`,
    };
  },
  cropFringe(m, h) {
    const R = m.headR + 5;
    const [lx, ly] = pt(m, 188, R);
    const [rx, ry] = pt(m, 352, R);
    const fy = m.browY - 9;
    const top = m.headCy - m.headR;
    return {
      back: sides(m, h, 5, 12),
      front: `<path d="M${P(lx, ly)} A${n(R)} ${n(R)} 0 0 1 ${P(rx, ry)} C${P(rx - 4, ry + 10)} ${P(178, fy - 2)} ${P(170, fy)} L${P(158, fy + 4)} L${P(146, fy)} L${P(134, fy + 5)} L${P(122, fy)} L${P(110, fy + 5)} L${P(98, fy)} L${P(86, fy)} C${P(78, fy - 2)} ${P(lx + 4, ly + 10)} ${P(lx, ly)}Z" fill="${h}"/>
    ${strokes(shade(h, 42), [[104, top + 4, 'q-4 8 -10 14'], [128, top - 3, 'q0 9 -3 16'], [152, top + 4, 'q4 8 10 14']], 2.4)}`,
    };
  },

  // ----- female -----
  longCenter(m, h) {
    const R = m.headR + 8;
    const [lx, ly] = pt(m, 190, R);
    const [rx, ry] = pt(m, 350, R);
    const hy = m.headCy - m.headR * 0.6;
    const top = m.headCy - m.headR;
    return {
      back: `<path d="${longBackD(m, { pad: 8, width: 82, bottom: 216 })}" fill="${h}"/>`,
      front: `<path d="M${P(lx, ly)} A${n(R)} ${n(R)} 0 0 1 ${P(rx, ry)} C${P(rx - 4, hy + 26)} ${P(156, hy + 10)} ${P(131, hy - 8)} L${P(125, hy - 8)} C${P(100, hy + 10)} ${P(lx + 4, hy + 26)} ${P(lx, ly)}Z" fill="${h}"/>
    ${partLine(h, 128, hy - 6, top - 4)}
    ${shine(h, 104, top + 6, 18, 8, 20)}`,
    };
  },
  longSideLayers(m, h) {
    const top = m.headCy - m.headR;
    const hy = m.headCy - m.headR * 0.62;
    return {
      back: `<path d="${longBackD(m, { pad: 8, width: 86, bottom: 220, layers: true })}" fill="${h}"/>`,
      front: `<path d="${sidePartD(m, 8, 102, 0.62, m.browY - 2)}" fill="${h}"/>
    ${partLine(h, 102, hy + 1, top - 4)}
    ${shine(h, 156, top + 10, 20, 8, 12)}`,
    };
  },
  curtainBangs(m, h) {
    const R = m.headR + 8;
    const [lx, ly] = pt(m, 190, R);
    const [rx, ry] = pt(m, 350, R);
    const hy = m.headCy - m.headR * 0.66;
    const by = m.browY;
    const top = m.headCy - m.headR;
    const curtain = (s) =>
      `<path d="M${P(128 - 4 * s, hy - 10)} C${P(128 - 8 * s, hy + 18)} ${P(128 - 24 * s, by - 4)} ${P(128 - 46 * s, by + 10)} C${P(128 - 42 * s, by - 12)} ${P(128 - 26 * s, hy)} ${P(128 - 12 * s, hy - 12)}Z" fill="${h}"/>`;
    return {
      back: `<path d="${longBackD(m, { pad: 8, width: 84, bottom: 218, wave: 7 })}" fill="${h}"/>`,
      front: `<path d="M${P(lx, ly)} A${n(R)} ${n(R)} 0 0 1 ${P(rx, ry)} C${P(rx - 4, hy + 24)} ${P(154, hy + 6)} ${P(130, hy - 6)} L${P(126, hy - 6)} C${P(102, hy + 6)} ${P(lx + 4, hy + 24)} ${P(lx, ly)}Z" fill="${h}"/>
    ${curtain(1)}
    ${curtain(-1)}
    ${partLine(h, 128, hy - 4, top - 4)}`,
    };
  },
  bobBangs(m, h) {
    const R = m.headR + 8;
    const [lx, ly] = pt(m, 190, R);
    const [rx, ry] = pt(m, 350, R);
    const fy = m.browY - 7;
    const top = m.headCy - m.headR;
    return {
      back: `<path d="${longBackD(m, { pad: 8, width: m.headR + 12, bottom: m.headCy + m.headR + 6, inner: m.neckW / 2 + 8, tuck: true })}" fill="${h}"/>`,
      front: `<path d="M${P(lx, ly)} A${n(R)} ${n(R)} 0 0 1 ${P(rx, ry)} C${P(rx, ry + 10)} ${P(178, fy + 6)} ${P(166, fy)} Q${P(128, fy - 4)} ${P(90, fy)} C${P(78, fy + 6)} ${P(lx, ly + 10)} ${P(lx, ly)}Z" fill="${h}"/>
    ${shine(h, 110, top + 6, 22, 8, 14)}`,
    };
  },
  lobTucked(m, h) {
    const R = m.headR + 8;
    const cy = m.headCy;
    const [lx, ly] = pt(m, 190, R);
    const [rx, ry] = pt(m, 350, R);
    const width = m.headR + 10;
    const bottom = cy + m.headR + 34;
    const inner = m.neckW / 2 + 10;
    const xR = 128 + width;
    const yEnd = bottom - 18;
    const right = `C${P(128 + m.headR - 4, cy - 24)} ${P(128 + m.headR - 12, cy + 8)} ${P(128 + m.headR - 8, cy + 26)} C${P(128 + m.headR + 4, cy + 46)} ${P(xR + 2, yEnd - 30)} ${P(xR - 2, yEnd)} Q${P(xR - 2, bottom)} ${P(xR - 20, bottom)}`;
    const leftSegs = mirrorReverse([['C', xR + 6, ry + 20, xR + 2, yEnd - 40, xR, yEnd], ['Q', xR, bottom, xR - 18, bottom]], rx, ry);
    const top = cy - m.headR;
    const hy = cy - m.headR * 0.62;
    return {
      ears: 'right',
      back: `<path d="M${P(lx, ly)} A${n(R)} ${n(R)} 0 0 1 ${P(rx, ry)} ${right} L${P(128 + inner, bottom - 8)} L${P(128 + inner, cy + 10)} L${P(128 - inner, cy + 10)} L${P(128 - inner, bottom)} L${P(128 - width + 18, bottom)} ${segsToD(leftSegs)}Z" fill="${h}"/>`,
      front: `<path d="${sidePartD(m, 8, 152, 0.62, m.browY - 4)}" fill="${h}"/>
    ${partLine(h, 152, hy + 1, top - 4)}
    ${shine(h, 100, top + 10, 20, 8, -12)}`,
    };
  },
  wavesLong(m, h) {
    const top = m.headCy - m.headR;
    const hy = m.headCy - m.headR * 0.6;
    return {
      back: `<path d="${longBackD(m, { pad: 9, width: 90, bottom: 222, wave: 12 })}" fill="${h}"/>`,
      front: `${cap(m, h, { pad: 9, sideDeg: 10, line: 0.6, dip: 12 })}
    <path d="M${P(100, hy + 2)} C${P(112, hy - 6)} ${P(140, hy - 2)} ${P(160, hy + 16)} C${P(146, hy + 14)} ${P(126, hy + 10)} ${P(100, hy + 2)}Z" fill="${h}"/>
    ${strokes(shade(h, 42), [[92, top + 14, 'q8 -8 16 0 t16 0'], [130, top - 4, 'q8 -6 16 0 t16 0']], 2.6)}`,
    };
  },
  highPony(m, h, spec) {
    const top = m.headCy - m.headR;
    const cy = m.headCy;
    return {
      back: `<path d="M${P(158, top + 6)} C${P(212, top - 10)} ${P(222, cy + 24)} ${P(202, cy + 74)} C${P(194, cy + 86)} ${P(184, cy + 72)} ${P(190, cy + 44)} C${P(196, cy + 16)} ${P(180, top + 14)} ${P(158, top + 6)}Z" fill="${h}"/>
    ${shine(h, 204, cy + 10, 6, 22, 10)}`,
      front: `${cap(m, h, { pad: 6, sideDeg: 8, line: 0.66, dip: 4 })}
    <ellipse cx="164" cy="${n(top + 4)}" rx="9" ry="6" fill="${spec.accent || ACCENT.rose}" transform="rotate(-30 164 ${n(top + 4)})"/>
    ${strokes(h, [[62, cy - 30, 'q-6 14 -2 26'], [194, cy - 30, 'q6 14 2 26']], 3, 1)}`,
    };
  },
  lowBun(m, h) {
    const cy = m.headCy;
    const top = cy - m.headR;
    const hy = cy - m.headR * 0.64;
    return {
      ears: 'both',
      back: `${sides(m, h, 6, 26)}
    ${bun(h, 200, cy + 40, 19, null)}`,
      front: `${cap(m, h, { pad: 6, sideDeg: 8, line: 0.64, dip: 8 })}
    ${partLine(h, 128, hy + 2, top - 2)}
    ${strokes(h, [[128 - m.headR + 2, cy - 26, 'q-9 22 -2 46'], [128 + m.headR - 2, cy - 26, 'q9 22 2 46']], 3.6, 1)}`,
    };
  },
  halfUp(m, h) {
    const top = m.headCy - m.headR;
    const hy = m.headCy - m.headR * 0.64;
    return {
      back: `<path d="${longBackD(m, { pad: 8, width: 82, bottom: 214 })}" fill="${h}"/>`,
      front: `${cap(m, h, { pad: 8, sideDeg: 10, line: 0.64, dip: 6 })}
    ${bun(h, 128, top - 8, 13, shade(h, -24))}
    ${strokes(shade(h, 40), [[92, hy + 14, `C${P(104, hy - 2)} ${P(116, top + 2)} ${P(122, top - 2)}`], [164, hy + 14, `C${P(152, hy - 2)} ${P(140, top + 2)} ${P(134, top - 2)}`]], 2.2, 0.45)}`,
    };
  },
  pixieSwept(m, h) {
    const top = m.headCy - m.headR;
    const hy = m.headCy - m.headR * 0.62;
    const by = m.browY;
    return {
      ears: 'both',
      back: sides(m, h, 4, 22),
      front: `${cap(m, h, { pad: 6, sideDeg: 4, line: 0.62, dip: 10 })}
    <ellipse cx="112" cy="${n(top - 4)}" rx="18" ry="9" fill="${h}" transform="rotate(-14 112 ${n(top - 4)})"/>
    <ellipse cx="146" cy="${n(top - 5)}" rx="16" ry="8" fill="${h}" transform="rotate(10 146 ${n(top - 5)})"/>`,
      over: `<path d="M${P(98, hy - 6)} C${P(122, hy - 14)} ${P(162, by - 16)} ${P(190, by + 6)} C${P(178, by + 2)} ${P(158, by - 4)} ${P(136, by - 2)} C${P(118, by)} ${P(104, hy + 6)} ${P(98, hy - 6)}Z" fill="${h}"/>`,
    };
  },

  // ----- teen -----
  sideSwept(m, h) {
    const cy = m.headCy;
    const top = cy - m.headR;
    return {
      back: sides(m, h, 7, 22),
      front: cap(m, h, { pad: 7, sideDeg: 8, line: 0.5, dip: 10 }),
      over: `<path d="M${P(178, top + 10)} C${P(150, top + 12)} ${P(118, cy - 32)} ${P(72, cy + 6)} C${P(84, cy - 14)} ${P(98, cy - 36)} ${P(118, cy - 44)} C${P(148, cy - 50)} ${P(168, top - 2)} ${P(178, top + 10)}Z" fill="${h}"/>
    ${shine(h, 150, top + 2, 16, 6, -20)}`,
    };
  },
  curlyMop(m, h) {
    const R = m.headR + 12;
    const top = m.headCy - m.headR;
    let curls = `<ellipse cx="128" cy="${n(top + 12)}" rx="72" ry="42" fill="${h}"/>\n    `;
    for (let d = 196; d <= 344; d += 12) {
      const [x, y] = pt(m, d, R);
      curls += `<circle cx="${n(x)}" cy="${n(y)}" r="14" fill="${h}"/>\n    `;
    }
    for (let d = 200; d <= 340; d += 20) {
      const [x, y] = pt(m, d, R - 16);
      curls += `<circle cx="${n(x)}" cy="${n(y)}" r="12" fill="${h}"/>\n    `;
    }
    for (const x of [88, 112, 144, 168]) curls += `<circle cx="${x}" cy="${n(m.browY - 12)}" r="11" fill="${h}"/>\n    `;
    const behind = [162, 198, 342, 18].map((d) => {
      const [x, y] = pt(m, d, R - 4);
      return `<circle cx="${n(x)}" cy="${n(y)}" r="13" fill="${h}"/>`;
    });
    return {
      back: behind.join('\n    '),
      front: `${curls}${shine(h, 116, top - 4, 16, 8)}`,
    };
  },
  spikyFront(m, h) {
    const R = m.headR + 3;
    let spikes = '';
    for (let i = 0; i < 5; i++) {
      const d = 222 + i * 24;
      const [ax, ay] = pt(m, d - 8, R);
      const [bx, by] = pt(m, d + 8, R);
      const [tx, ty] = pt(m, d - 9, R + 24);
      spikes += `<path d="M${P(ax, ay)} L${P(tx, ty)} L${P(bx, by)}Z" fill="${h}"/>\n    `;
    }
    return {
      back: sides(m, h, 4, 10),
      front: `${cap(m, h, { pad: 4, sideDeg: 12, line: 0.6, dip: 6 })}
    ${spikes}${shine(h, 124, m.headCy - m.headR + 2, 14, 6)}`,
    };
  },
  shaggy(m, h) {
    const R = m.headR + 9;
    const [lx, ly] = pt(m, 190, R);
    const [rx, ry] = pt(m, 350, R);
    const fy = m.browY - 6;
    return {
      back: `<path d="${longBackD(m, { pad: 9, width: m.headR + 14, bottom: m.headCy + m.headR + 2, inner: m.neckW / 2 + 8, jag: true, tuck: true })}" fill="${h}"/>`,
      front: `<path d="M${P(lx, ly)} A${n(R)} ${n(R)} 0 0 1 ${P(rx, ry)} C${P(rx - 4, ry + 8)} ${P(180, fy)} ${P(172, fy + 4)} L${P(160, fy - 5)} L${P(148, fy + 6)} L${P(136, fy - 3)} L${P(122, fy + 6)} L${P(110, fy - 4)} L${P(98, fy + 5)} L${P(84, fy - 2)} C${P(76, fy + 2)} ${P(lx + 4, ly + 8)} ${P(lx, ly)}Z" fill="${h}"/>
    ${shine(h, 108, m.headCy - m.headR + 6, 20, 8, 16)}`,
    };
  },
  fauxHawk(m, h) {
    const top = m.headCy - m.headR;
    const R = m.headR + 3;
    return {
      back: `${sector(m, 164, 204, R, h, ' opacity="0.5"')}
    ${sector(m, 336, 376, R, h, ' opacity="0.5"')}`,
      front: `${cap(m, h, { pad: 3, sideDeg: 16, line: 0.62, dip: 6 })}
    <path d="M${P(98, top + 10)} C${P(104, top - 10)} ${P(114, top - 26)} ${P(126, top - 28)} C${P(140, top - 28)} ${P(152, top - 10)} ${P(158, top + 10)}Z" fill="${h}"/>
    <path d="M${P(112, top - 8)} L${P(118, top - 30)} L${P(124, top - 12)}Z" fill="${h}"/>
    <path d="M${P(130, top - 12)} L${P(138, top - 32)} L${P(144, top - 8)}Z" fill="${h}"/>
    ${shine(h, 122, top - 10, 5, 10)}`,
    };
  },
  spaceBuns(m, h, spec) {
    const top = m.headCy - m.headR;
    const hy = m.headCy - m.headR * 0.64;
    const tie = spec.accent || ACCENT.rose;
    return {
      back: `${bun(h, 76, top + 14, 17, null)}
    ${bun(h, 180, top + 14, 17, null)}`,
      front: `${cap(m, h, { pad: 5, sideDeg: 8, line: 0.64, dip: 8 })}
    <ellipse cx="84" cy="${n(top + 18)}" rx="6" ry="4" fill="${tie}" transform="rotate(40 84 ${n(top + 18)})"/>
    <ellipse cx="172" cy="${n(top + 18)}" rx="6" ry="4" fill="${tie}" transform="rotate(-40 172 ${n(top + 18)})"/>
    ${strokes(h, [[118, hy + 2, 'q-10 10 -20 26'], [138, hy + 2, 'q10 10 20 26']], 3.2, 1)}`,
    };
  },
  sideBraid(m, h, spec) {
    const R = m.headR + 8;
    const [lx, ly] = pt(m, 190, R);
    const [rx, ry] = pt(m, 350, R);
    const cy = m.headCy;
    const hy = cy - m.headR * 0.62;
    const top = cy - m.headR;
    return {
      back: `${sector(m, 300, 392, R, h)}
    ${sector(m, 180, 250, m.headR + 4, h)}
    ${braid(h, 194, cy + 30, 72, 6, spec.accent || ACCENT.mint, 0.8)}`,
      front: `<path d="M${P(lx, ly)} A${n(R)} ${n(R)} 0 0 1 ${P(rx, ry)} C${P(rx - 4, hy + 24)} ${P(158, hy + 8)} ${P(132, hy - 4)} L${P(124, hy - 4)} C${P(98, hy + 8)} ${P(lx + 4, hy + 24)} ${P(lx, ly)}Z" fill="${h}"/>
    ${partLine(h, 128, hy - 2, top - 4)}
    ${shine(h, 168, top + 12, 16, 7, 24)}`,
    };
  },
  messyBun(m, h, spec) {
    const cy = m.headCy;
    const top = cy - m.headR;
    const hy = cy - m.headR * 0.6;
    return {
      front: `${cap(m, h, { pad: 5, sideDeg: 8, line: 0.6, dip: 8 })}
    <circle cx="130" cy="${n(top - 10)}" r="16" fill="${h}"/>
    <circle cx="116" cy="${n(top - 2)}" r="11" fill="${h}"/>
    <circle cx="145" cy="${n(top - 4)}" r="12" fill="${h}"/>
    <circle cx="128" cy="${n(top - 22)}" r="9" fill="${h}"/>
    ${strokes(h, [[142, top - 22, 'q10 -8 18 -6'], [118, top - 24, 'q-8 -8 -16 -4'], [150, top - 6, 'q12 2 16 8']], 3, 1)}
    ${strokes(h, [[128 - m.headR + 4, cy - 30, 'q-8 20 -3 42'], [128 + m.headR - 4, cy - 30, 'q8 20 3 42']], 3.4, 1)}
    ${hairClip(86, hy + 16, spec.accent || ACCENT.plum, -24)}
    ${shine(h, 126, top - 12, 7, 4)}`,
    };
  },
  longBluntBangs(m, h) {
    const R = m.headR + 8;
    const [lx, ly] = pt(m, 190, R);
    const [rx, ry] = pt(m, 350, R);
    const fy = m.browY - 3;
    const top = m.headCy - m.headR;
    return {
      back: `<path d="${longBackD(m, { pad: 8, width: 84, bottom: 218 })}" fill="${h}"/>`,
      front: `<path d="M${P(lx, ly)} A${n(R)} ${n(R)} 0 0 1 ${P(rx, ry)} L${P(184, fy + 8)} L${P(176, fy)} L${P(80, fy)} L${P(72, fy + 8)} L${P(lx, ly)}Z" fill="${h}"/>
    ${shine(h, 128, top + 4, 26, 7)}`,
    };
  },
  layeredShag(m, h, spec) {
    const hy = m.headCy - m.headR * 0.66;
    const by = m.browY;
    const wisp = (s) =>
      `<path d="M${P(128 - 6 * s, hy - 8)} C${P(128 - 10 * s, hy + 14)} ${P(128 - 26 * s, by - 8)} ${P(128 - 40 * s, by + 4)} C${P(128 - 36 * s, by - 10)} ${P(128 - 24 * s, hy - 2)} ${P(128 - 14 * s, hy - 10)}Z" fill="${h}"/>`;
    return {
      back: `<path d="${longBackD(m, { pad: 9, width: 88, bottom: 208, jag: true })}" fill="${h}"/>`,
      front: `${cap(m, h, { pad: 9, sideDeg: 10, line: 0.66, dip: 6 })}
    ${wisp(1)}
    ${wisp(-1)}
    ${headband(m, spec.accent || ACCENT.coral)}`,
    };
  },

  // ----- child -----
  bowlBangs(m, h) {
    return {
      back: sides(m, h, 8, 20),
      front: `${cap(m, h, { pad: 8, sideDeg: -6, line: 0.34, dip: 4, spread: 0.55 })}
    ${shine(h, 104, m.headCy - m.headR + 4, 22, 9, 18)}`,
    };
  },
  curlPuffBow(m, h, spec) {
    const top = m.headCy - m.headR;
    const cx = 128;
    const cy = top - 6;
    let ring = '';
    for (let a = 165; a <= 375; a += 30) {
      const x = cx + 50 * Math.cos(rad(a));
      const y = cy + 50 * Math.sin(rad(a));
      ring += `<circle cx="${n(x)}" cy="${n(y)}" r="12" fill="${h}"/>\n    `;
    }
    return {
      front: `<circle cx="${cx}" cy="${n(cy)}" r="54" fill="${h}"/>
    ${ring}${shine(h, 108, cy - 20, 18, 10)}
    ${bow(180, top + 4, spec.accent || ACCENT.rose)}`,
    };
  },
  softSpikes(m, h) {
    const R = m.headR + 2;
    let spikes = '';
    for (const d of [232, 256, 282, 306]) {
      const [ax, ay] = pt(m, d - 7, R);
      const [bx, by] = pt(m, d + 7, R);
      const [tx, ty] = pt(m, d, R + 28);
      spikes += `<path d="M${P(ax, ay)} Q${P(tx, ty)} ${P(bx, by)}Z" fill="${h}"/>\n    `;
    }
    return {
      back: sides(m, h, 4, 8),
      front: `${cap(m, h, { pad: 4, sideDeg: 10, line: 0.58, dip: 8 })}
    ${spikes}`,
    };
  },
  cowlick(m, h) {
    const top = m.headCy - m.headR;
    return {
      back: sides(m, h, 5, 12),
      front: `${cap(m, h, { pad: 5, sideDeg: 8, line: 0.6, dip: 8 })}
    <path d="M${P(126, top + 2)} C${P(120, top - 18)} ${P(142, top - 26)} ${P(146, top - 8)} C${P(146, top - 2)} ${P(138, top - 6)} ${P(134, top + 3)}Z" fill="${h}"/>
    ${shine(h, 112, top + 8, 16, 7)}`,
    };
  },
  afroPuffs(m, h, spec) {
    const top = m.headCy - m.headR;
    const tie = spec.accent || ACCENT.gold;
    return {
      front: `${cap(m, h, { pad: 3, sideDeg: 10, line: 0.6, dip: 8 })}
    <circle cx="70" cy="${n(top + 22)}" r="23" fill="${h}"/>
    <circle cx="186" cy="${n(top + 22)}" r="23" fill="${h}"/>
    ${shine(h, 62, top + 12, 9, 6)}
    ${shine(h, 178, top + 12, 9, 6)}
    <ellipse cx="80" cy="${n(top + 26)}" rx="6" ry="4.5" fill="${tie}" transform="rotate(30 80 ${n(top + 26)})"/>
    <ellipse cx="176" cy="${n(top + 26)}" rx="6" ry="4.5" fill="${tie}" transform="rotate(-30 176 ${n(top + 26)})"/>`,
    };
  },
  pigtailsHigh(m, h, spec) {
    const top = m.headCy - m.headR;
    const cy = m.headCy;
    const hy = cy - m.headR * 0.6;
    const tie = spec.accent || ACCENT.rose;
    return {
      back: `${tail(h, 66, top + 26, 46, cy + 58, 24)}
    ${tail(h, 190, top + 26, 210, cy + 58, 24)}`,
      front: `${cap(m, h, { pad: 5, sideDeg: 8, line: 0.6, dip: 8 })}
    ${partLine(h, 128, hy + 2, top - 2)}
    <circle cx="68" cy="${n(top + 26)}" r="6.5" fill="${tie}"/>
    <circle cx="188" cy="${n(top + 26)}" r="6.5" fill="${tie}"/>`,
    };
  },
  twinBraids(m, h, spec) {
    const R = m.headR + 8;
    const [lx, ly] = pt(m, 190, R);
    const [rx, ry] = pt(m, 350, R);
    const cy = m.headCy;
    const hy = cy - m.headR * 0.6;
    const top = cy - m.headR;
    const tie = spec.accent || ACCENT.mint;
    return {
      ears: 'both',
      back: `${sides(m, h, 8, 24)}
    ${braid(h, 48, cy - 6, 96, 6, tie, 0.6)}
    ${braid(h, 208, cy - 6, 96, 6, tie, -0.6)}`,
      front: `<path d="M${P(lx, ly)} A${n(R)} ${n(R)} 0 0 1 ${P(rx, ry)} C${P(rx - 4, hy + 26)} ${P(158, hy + 10)} ${P(131, hy - 8)} L${P(125, hy - 8)} C${P(98, hy + 10)} ${P(lx + 4, hy + 26)} ${P(lx, ly)}Z" fill="${h}"/>
    ${partLine(h, 128, hy - 6, top - 4)}`,
    };
  },
  miniTopKnot(m, h) {
    const top = m.headCy - m.headR;
    const hy = m.headCy - m.headR * 0.58;
    return {
      front: `${cap(m, h, { pad: 4, sideDeg: 8, line: 0.58, dip: 8 })}
    ${bun(h, 128, top - 6, 10, shade(h, -24))}
    ${strokes(h, [[86, hy + 10, 'q-6 8 -8 18'], [170, hy + 10, 'q6 8 8 18']], 3, 1)}`,
    };
  },
  sideClipBob(m, h, spec) {
    const top = m.headCy - m.headR;
    const hy = m.headCy - m.headR * 0.6;
    return {
      back: `<path d="${longBackD(m, { pad: 8, width: m.headR + 10, bottom: m.headCy + m.headR * 0.8, inner: m.neckW / 2 + 8, tuck: true })}" fill="${h}"/>`,
      front: `<path d="${sidePartD(m, 8, 150, 0.6, m.browY - 4)}" fill="${h}"/>
    ${hairClip(174, hy + 10, spec.accent || ACCENT.coral, 28)}
    ${shine(h, 100, top + 10, 18, 8, -10)}`,
    };
  },
  lowPigtailsBangs(m, h, spec) {
    const R = m.headR + 8;
    const [lx, ly] = pt(m, 190, R);
    const [rx, ry] = pt(m, 350, R);
    const cy = m.headCy;
    const fy = m.browY - 6;
    const tie = spec.accent || ACCENT.plum;
    return {
      ears: 'both',
      back: `${sides(m, h, 8, 30)}
    ${tail(h, 44, cy + 16, 56, cy + 98, 22)}
    ${tail(h, 212, cy + 16, 200, cy + 98, 22)}`,
      front: `<path d="M${P(lx, ly)} A${n(R)} ${n(R)} 0 0 1 ${P(rx, ry)} C${P(rx, ry + 12)} ${P(186, fy + 8)} ${P(178, fy)} L${P(78, fy)} C${P(70, fy + 8)} ${P(lx, ly + 12)} ${P(lx, ly)}Z" fill="${h}"/>
    <circle cx="44" cy="${n(cy + 18)}" r="6.5" fill="${tie}"/>
    <circle cx="212" cy="${n(cy + 18)}" r="6.5" fill="${tie}"/>`,
    };
  },
};

// ---------- body, face, outfit, accessories ----------

function wrap(inner, m) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <clipPath id="c"><circle cx="128" cy="128" r="124"/></clipPath>
    <clipPath id="sh"><ellipse cx="128" cy="236" rx="${m.shoulderRx}" ry="46"/></clipPath>
  </defs>
  <g clip-path="url(#c)">
    <circle cx="128" cy="128" r="124" fill="${BG}"/>
    ${inner}
  </g>
</svg>
`;
}

function outfitBack(kind, { m, cloth }) {
  const hood = kind === 'hoodie' ? `<path d="M${P(78, 200)} C${P(76, 166)} ${P(180, 166)} ${P(178, 200)}Z" fill="${shade(cloth, -16)}"/>\n    ` : '';
  return `${hood}<ellipse cx="128" cy="236" rx="${m.shoulderRx}" ry="46" fill="${cloth}"/>
    <ellipse cx="128" cy="230" rx="${n(m.shoulderRx * 0.72)}" ry="18" fill="${shade(cloth, -22)}" opacity="0.16"/>`;
}

function neck({ m, skin, nl, headBottom }) {
  const top = headBottom - 8;
  return `<rect x="${n(128 - m.neckW / 2)}" y="${n(top)}" width="${m.neckW}" height="${n(nl - top + 6)}" rx="${n(m.neckW / 2 - 2)}" fill="${skin}"/>
    <ellipse cx="128" cy="${n(top + 4)}" rx="${n(m.neckW / 2 - 2)}" ry="6" fill="${shade(skin, -18)}" opacity="0.2"/>`;
}

function outfitFront(kind, { m, cloth, skin, nl }) {
  const dark = shade(cloth, -26);
  switch (kind) {
    case 'vneck':
      return `<path d="M${P(108, nl - 12)} L128 ${n(nl + 12)} L${P(148, nl - 12)}Z" fill="${skin}"/>
    <path d="M${P(106, nl - 12)} L128 ${n(nl + 13)} L${P(150, nl - 12)}" fill="none" stroke="${dark}" stroke-width="3" stroke-linejoin="round"/>`;
    case 'polo':
      return `<path d="M${P(104, nl - 14)} L${P(122, nl + 10)} L${P(128, nl - 2)}Z" fill="${shade(cloth, 20)}"/>
    <path d="M${P(152, nl - 14)} L${P(134, nl + 10)} L${P(128, nl - 2)}Z" fill="${shade(cloth, 20)}"/>
    <circle cx="128" cy="${n(nl + 12)}" r="2.4" fill="${dark}"/>
    <circle cx="128" cy="${n(nl + 20)}" r="2.4" fill="${dark}"/>`;
    case 'shirt':
      return `<path d="M${P(102, nl - 16)} L${P(122, nl + 12)} L${P(128, nl - 4)}Z" fill="${CREAM}"/>
    <path d="M${P(154, nl - 16)} L${P(134, nl + 12)} L${P(128, nl - 4)}Z" fill="${CREAM}"/>
    <path d="M128 ${n(nl + 4)} V${n(nl + 44)}" stroke="${dark}" stroke-width="1.6" opacity="0.6"/>
    <circle cx="128" cy="${n(nl + 16)}" r="2.2" fill="${CREAM}"/>
    <circle cx="128" cy="${n(nl + 28)}" r="2.2" fill="${CREAM}"/>`;
    case 'hoodie':
      return `<path d="M${P(96, nl - 6)} Q128 ${n(nl + 20)} ${P(160, nl - 6)}" stroke="${shade(cloth, -20)}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M${P(118, nl + 6)} q-3 14 -5 28" stroke="${CREAM}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M${P(138, nl + 6)} q3 14 5 28" stroke="${CREAM}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <circle cx="113" cy="${n(nl + 36)}" r="2.6" fill="${CREAM}"/>
    <circle cx="143" cy="${n(nl + 36)}" r="2.6" fill="${CREAM}"/>`;
    case 'stripe':
      return `<g clip-path="url(#sh)">
      <rect x="20" y="${n(nl + 10)}" width="216" height="9" fill="${CREAM}" opacity="0.85"/>
      <rect x="20" y="${n(nl + 28)}" width="216" height="9" fill="${CREAM}" opacity="0.85"/>
    </g>`;
    case 'overalls':
      return `<g clip-path="url(#sh)">
      <rect x="${n(128 - 42)}" y="${n(nl - 26)}" width="15" height="70" rx="7.5" fill="${ACCENT.denim}"/>
      <rect x="${n(128 + 27)}" y="${n(nl - 26)}" width="15" height="70" rx="7.5" fill="${ACCENT.denim}"/>
      <rect x="${n(128 - 34)}" y="${n(nl + 18)}" width="68" height="44" rx="9" fill="${ACCENT.denim}"/>
      <circle cx="${n(128 - 34.5)}" cy="${n(nl + 24)}" r="3" fill="${ACCENT.gold}"/>
      <circle cx="${n(128 + 34.5)}" cy="${n(nl + 24)}" r="3" fill="${ACCENT.gold}"/>
    </g>`;
    case 'sailor':
      return `<g clip-path="url(#sh)">
      <path d="M${P(84, nl - 18)} L${P(122, nl + 22)} L${P(126, nl - 6)}Z" fill="${CREAM}"/>
      <path d="M${P(172, nl - 18)} L${P(134, nl + 22)} L${P(130, nl - 6)}Z" fill="${CREAM}"/>
      <path d="M${P(90, nl - 10)} L${P(120, nl + 20)}" stroke="${ACCENT.denim}" stroke-width="2"/>
      <path d="M${P(166, nl - 10)} L${P(136, nl + 20)}" stroke="${ACCENT.denim}" stroke-width="2"/>
      <circle cx="128" cy="${n(nl + 20)}" r="4.5" fill="${ACCENT.denim}"/>
      <path d="M${P(124, nl + 24)} l-4 14 M${P(132, nl + 24)} l4 14" stroke="${ACCENT.denim}" stroke-width="3" stroke-linecap="round"/>
    </g>`;
    default:
      return `<path d="M${P(102, nl - 6)} Q128 ${n(nl + 16)} ${P(154, nl - 6)}" fill="none" stroke="${dark}" stroke-width="3" opacity="0.5"/>`;
  }
}

function ears({ m, skin }, mode) {
  const y = m.headCy + 8;
  const x = m.headR + 4;
  const one = (cx) => `<circle cx="${n(cx)}" cy="${n(y)}" r="14" fill="${skin}"/>
    <circle cx="${n(cx)}" cy="${n(y)}" r="7" fill="${shade(skin, -16)}" opacity="0.25"/>`;
  const left = mode === 'both' || mode === 'left' ? one(128 - x) : '';
  const right = mode === 'both' || mode === 'right' ? one(128 + x) : '';
  return `${left}${left && right ? '\n    ' : ''}${right}`;
}

function head({ m, skin }) {
  return `<circle cx="128" cy="${m.headCy}" r="${m.headR}" fill="${skin}"/>
    <ellipse cx="108" cy="${n(m.headCy - 18)}" rx="${n(m.headR * 0.42)}" ry="${n(m.headR * 0.28)}" fill="${shade(skin, 28)}" opacity="0.35"/>
    <ellipse cx="128" cy="${n(m.headCy + m.headR * 0.55)}" rx="${n(m.headR * 0.55)}" ry="${n(m.headR * 0.22)}" fill="${shade(skin, -24)}" opacity="0.12"/>`;
}

function beard(kind, hair, m) {
  if (!kind || kind === 'none') return '';
  const R = m.headR;
  const cy = m.headCy;
  const mouthY = m.eyeCy + m.eyeR + 22;
  if (kind === 'stubble' || kind === 'short') {
    const full = kind === 'short';
    const startDeg = full ? 168 : 162;
    const r = full ? R + 3 : R;
    const [ax, ay] = pt(m, startDeg, r);
    const [bx, by] = pt(m, 180 - startDeg, r);
    return `<path d="M${P(ax, ay)} A${n(r)} ${n(r)} 0 0 0 ${P(bx, by)} C${P(128 + R * 0.62, cy + R * 0.45)} ${P(158, mouthY + 10)} ${P(128, mouthY + 12)} C${P(98, mouthY + 10)} ${P(128 - R * 0.62, cy + R * 0.45)} ${P(ax, ay)}Z" fill="${hair}" opacity="${full ? 0.92 : 0.22}"/>`;
  }
  const mustache = `<path d="M${P(112, mouthY - 3)} Q${P(120, mouthY - 12)} ${P(128, mouthY - 5)} Q${P(136, mouthY - 12)} ${P(144, mouthY - 3)}" stroke="${hair}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  if (kind === 'mustache') return mustache;
  return `${mustache}
    <path d="M${P(116, mouthY + 6)} Q${P(128, mouthY + 30)} ${P(140, mouthY + 6)} Q${P(128, mouthY + 12)} ${P(116, mouthY + 6)}Z" fill="${hair}"/>`;
}

function mouth(kind, my) {
  const dark = '#8A3A3E';
  const grin = `<path d="M${P(114, my - 1)} Q128 ${n(my + 17)} ${P(142, my - 1)}Z" fill="${dark}"/>
    <path d="M${P(117, my)} Q128 ${n(my + 7)} ${P(139, my)}Z" fill="${CREAM}"/>`;
  switch (kind) {
    case 'lips':
      return `<path d="M${P(117, my)} Q128 ${n(my + 12)} ${P(139, my)} Q128 ${n(my + 3)} ${P(117, my)}Z" fill="#D26A6E"/>
    <ellipse cx="128" cy="${n(my + 5.5)}" rx="4" ry="1.6" fill="${CREAM}" opacity="0.35"/>`;
    case 'grin':
      return grin;
    case 'gapTooth':
      return `${grin}
    <rect x="124.5" y="${n(my - 0.5)}" width="6" height="4.6" fill="${dark}"/>`;
    case 'braces':
      return `${grin}
    <path d="M${P(118, my + 2.6)} H138" stroke="#9AA6B2" stroke-width="1.7"/>
    <circle cx="122" cy="${n(my + 2.6)}" r="1.1" fill="#6F7B88"/>
    <circle cx="128" cy="${n(my + 2.6)}" r="1.1" fill="#6F7B88"/>
    <circle cx="134" cy="${n(my + 2.6)}" r="1.1" fill="#6F7B88"/>`;
    case 'smirk':
      return `<path d="M${P(116, my)} q10 9 24 -3" fill="none" stroke="#C45A5A" stroke-width="3.4" stroke-linecap="round"/>`;
    default:
      return `<path d="M${P(116, my)} q12 10 24 0" fill="none" stroke="#C45A5A" stroke-width="3.4" stroke-linecap="round"/>`;
  }
}

function face(m, spec, hair) {
  const lx = 128 - m.eyeGap;
  const rx = 128 + m.eyeGap;
  const ey = m.eyeCy;
  const er = m.eyeR;
  const pupil = er * 0.55;
  const blushY = ey + er + 10;
  const mouthY = ey + er + 22;
  const browColor = hair === HAIR.sand ? HAIR.chestnut : hair;
  const brows = [lx, rx]
    .map((x) => `<path d="M${P(x - 14, m.browY)} q14 ${m.browCurve} 28 0" fill="none" stroke="${browColor}" stroke-width="${m.browW}" stroke-linecap="round"/>`)
    .join('\n    ');
  const eyes = [lx, rx]
    .map(
      (x) => `<ellipse cx="${x}" cy="${ey}" rx="${er}" ry="${er + 1}" fill="${CREAM}"/>
    <circle cx="${x}" cy="${ey + 1}" r="${n(pupil)}" fill="${INK}"/>
    <circle cx="${x + 3}" cy="${ey - 3}" r="${n(pupil * 0.38)}" fill="${CREAM}"/>
    <circle cx="${x - 2}" cy="${ey + 4}" r="2.2" fill="${CREAM}" opacity="0.7"/>`,
    )
    .join('\n    ');
  const lashes =
    m.lashes || spec.lashes
      ? `<path d="M${P(lx - er, ey)} A${er} ${er + 1} 0 0 1 ${P(lx + er, ey)}" stroke="${INK}" stroke-width="1.8" fill="none"/>
    <path d="M${P(rx - er, ey)} A${er} ${er + 1} 0 0 1 ${P(rx + er, ey)}" stroke="${INK}" stroke-width="1.8" fill="none"/>
    <path d="M${P(lx - er + 1, ey - 2)} q-5 -1 -8 -7" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M${P(rx + er - 1, ey - 2)} q5 -1 8 -7" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
      : '';
  const blush = `<ellipse cx="${lx - 6}" cy="${blushY}" rx="${m.blushRx}" ry="${m.blushRy}" fill="#E89A90" opacity="${m.blushOp}"/>
    <ellipse cx="${rx + 6}" cy="${blushY}" rx="${m.blushRx}" ry="${m.blushRy}" fill="#E89A90" opacity="${m.blushOp}"/>`;
  const freckles = spec.freckles
    ? [lx - 9, lx - 1, lx + 7, rx - 7, rx + 1, rx + 9]
        .map((x, i) => `<circle cx="${n(x)}" cy="${n(blushY + (i % 3 === 1 ? 2 : -3))}" r="1.7" fill="#B9764F" opacity="0.8"/>`)
        .join('\n    ')
    : '';
  const nose = `<ellipse cx="128" cy="${ey + er + 8}" rx="${m.headR > 78 ? 3.6 : 4.5}" ry="${m.headR > 78 ? 2.6 : 3.2}" fill="#C47A5A" opacity="0.35"/>`;
  const kind = spec.mouth || (m.lips ? 'lips' : 'smile');
  return `${brows}
    ${eyes}
    ${lashes}
    ${blush}
    ${freckles}
    ${nose}
    ${mouth(kind, mouthY)}`;
}

function glasses(kind, m) {
  const lx = 128 - m.eyeGap;
  const rx = 128 + m.eyeGap;
  const ey = m.eyeCy;
  const er = m.eyeR;
  const c = kind === 'rect' ? '#2F3A45' : '#4A4038';
  if (kind === 'rect') {
    const w = 2 * er + 12;
    const hgt = 2 * er + 6;
    return `<rect x="${n(lx - w / 2)}" y="${n(ey - hgt / 2 - 1)}" width="${w}" height="${hgt}" rx="5" fill="none" stroke="${c}" stroke-width="3"/>
    <rect x="${n(rx - w / 2)}" y="${n(ey - hgt / 2 - 1)}" width="${w}" height="${hgt}" rx="5" fill="none" stroke="${c}" stroke-width="3"/>
    <path d="M${P(lx + w / 2, ey - 2)} H${n(rx - w / 2)}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
  }
  if (kind === 'catEye') {
    const lens = (cx, s) =>
      `<path d="M${P(cx - s * (er + 5), ey + 2)} Q${P(cx, ey + er + 9)} ${P(cx + s * (er + 8), ey + 3)} L${P(cx + s * (er + 12), ey - er - 7)} Q${P(cx - s * 2, ey - er - 5)} ${P(cx - s * (er + 5), ey + 2)}Z" fill="none" stroke="${c}" stroke-width="3" stroke-linejoin="round"/>`;
    return `${lens(lx, -1)}
    ${lens(rx, 1)}
    <path d="M${P(lx + er + 5, ey + 2)} H${n(rx - er - 5)}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
  }
  return `<circle cx="${lx}" cy="${ey}" r="${er + 7}" fill="none" stroke="${c}" stroke-width="3.2"/>
    <circle cx="${rx}" cy="${ey}" r="${er + 7}" fill="none" stroke="${c}" stroke-width="3.2"/>
    <path d="M${P(lx + er + 7, ey)} H${n(rx - er - 7)}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
}

function earring(kind, x, m) {
  const y = m.headCy + 8 + 12;
  const gold = ACCENT.gold;
  if (kind === 'hoop') return `<circle cx="${n(x)}" cy="${n(y + 6)}" r="6" fill="none" stroke="${gold}" stroke-width="2"/>`;
  if (kind === 'drop')
    return `<path d="M${P(x, y - 2)} V${n(y + 7)}" stroke="${gold}" stroke-width="1.6"/>
    <circle cx="${n(x)}" cy="${n(y + 10)}" r="3.4" fill="${ACCENT.mint}"/>`;
  return `<circle cx="${n(x)}" cy="${n(y - 2)}" r="3.2" fill="${gold}"/>`;
}

function accessories(spec, { m, nl }, earsMode) {
  const out = [];
  if (spec.glasses) out.push(glasses(spec.glasses, m));
  if (spec.earrings) {
    const side = spec.earringSide || (earsMode === 'right' || earsMode === 'left' ? earsMode : 'both');
    const x = m.headR + 4;
    if (side !== 'right') out.push(earring(spec.earrings, 128 - x, m));
    if (side !== 'left') out.push(earring(spec.earrings, 128 + x, m));
  }
  if (spec.necklace)
    out.push(`<path d="M${P(108, nl + 2)} Q128 ${n(nl + 22)} ${P(148, nl + 2)}" stroke="${ACCENT.gold}" stroke-width="1.8" fill="none"/>
    <circle cx="128" cy="${n(nl + 13)}" r="2.8" fill="${ACCENT.gold}"/>`);
  if (spec.headphones)
    out.push(`<path d="M${P(90, nl + 8)} Q${P(94, nl - 12)} ${P(110, nl - 10)}" stroke="${ACCENT.slate}" stroke-width="4" fill="none"/>
    <path d="M${P(166, nl + 8)} Q${P(162, nl - 12)} ${P(146, nl - 10)}" stroke="${ACCENT.slate}" stroke-width="4" fill="none"/>
    <rect x="82" y="${n(nl + 6)}" width="16" height="22" rx="7" fill="${ACCENT.slate}"/>
    <rect x="158" y="${n(nl + 6)}" width="16" height="22" rx="7" fill="${ACCENT.slate}"/>
    <rect x="86" y="${n(nl + 10)}" width="8" height="14" rx="4" fill="#6B6B74"/>
    <rect x="162" y="${n(nl + 10)}" width="8" height="14" rx="4" fill="#6B6B74"/>`);
  return out.join('\n    ');
}

function render(group, spec) {
  const m = { ...METRICS[group] };
  const style = STYLES[spec.hairStyle];
  if (!style) throw new Error(`unknown hair style: ${spec.hairStyle}`);
  const parts = style(m, spec.hair, spec);
  const headBottom = m.headCy + m.headR;
  const nl = Math.max(headBottom + 6, 198);
  const ctx = { m, skin: spec.skin, hair: spec.hair, cloth: spec.cloth, nl, headBottom };
  const earsMode = parts.ears || 'back';
  const layers = [
    outfitBack(spec.outfit, ctx),
    neck(ctx),
    outfitFront(spec.outfit, ctx),
    earsMode === 'back' ? ears(ctx, 'both') : '',
    parts.back || '',
    earsMode !== 'back' ? ears(ctx, earsMode) : '',
    head(ctx),
    group === 'male' ? beard(spec.beard, spec.hair, m) : '',
    parts.front || '',
    face(m, spec, spec.hair),
    accessories(spec, ctx, earsMode),
    parts.over || '',
  ];
  return wrap(layers.filter(Boolean).join('\n    '), m);
}

// ---------- the forty ----------

const S = SKIN;
const H = HAIR;
const C = CLOTH;
const A = ACCENT;

/** @type {Record<string, object[]>} */
const SETS = {
  male: [
    { skin: S.light, hair: H.dark, cloth: C.sage, hairStyle: 'crew', outfit: 'crew' },
    { skin: S.warm, hair: H.brown, cloth: C.clay, hairStyle: 'sidePart', outfit: 'shirt', glasses: 'round' },
    { skin: S.tan, hair: H.ink, cloth: C.sky, hairStyle: 'quiff', outfit: 'polo', beard: 'stubble' },
    { skin: S.peach, hair: H.chestnut, cloth: C.sand, hairStyle: 'curlsTight', outfit: 'vneck' },
    { skin: S.bronze, hair: H.black, cloth: C.teal, hairStyle: 'wavesShort', outfit: 'crew', beard: 'short' },
    { skin: S.deep, hair: H.ink, cloth: C.terracotta, hairStyle: 'fadeTextured', outfit: 'vneck' },
    { skin: S.light, hair: H.dark, cloth: C.sageDark, hairStyle: 'slickBack', outfit: 'shirt', glasses: 'round' },
    { skin: S.tan, hair: H.brown, cloth: C.forest, hairStyle: 'tousled', outfit: 'crew', beard: 'mustache' },
    { skin: S.warm, hair: H.black, cloth: C.olive, hairStyle: 'topKnot', outfit: 'vneck', beard: 'goatee' },
    { skin: S.bronze, hair: H.chestnut, cloth: C.blush, hairStyle: 'cropFringe', outfit: 'polo' },
  ],
  female: [
    { skin: S.light, hair: H.dark, cloth: C.blush, hairStyle: 'longCenter', outfit: 'crew', necklace: true },
    { skin: S.warm, hair: H.chestnut, cloth: C.clay, hairStyle: 'longSideLayers', outfit: 'vneck' },
    { skin: S.tan, hair: H.brown, cloth: C.teal, hairStyle: 'curtainBangs', outfit: 'crew', glasses: 'round' },
    { skin: S.peach, hair: H.black, cloth: C.sageDark, hairStyle: 'bobBangs', outfit: 'crew', necklace: true },
    { skin: S.bronze, hair: H.dark, cloth: C.terracotta, hairStyle: 'lobTucked', outfit: 'vneck', earrings: 'drop' },
    { skin: S.light, hair: H.auburn, cloth: C.sky, hairStyle: 'wavesLong', outfit: 'crew' },
    { skin: S.warm, hair: H.sand, cloth: C.sage, hairStyle: 'highPony', outfit: 'crew', earrings: 'stud', accent: A.rose },
    { skin: S.tan, hair: H.brown, cloth: C.sand, hairStyle: 'lowBun', outfit: 'vneck', earrings: 'stud', glasses: 'catEye' },
    { skin: S.deep, hair: H.black, cloth: C.olive, hairStyle: 'halfUp', outfit: 'crew', earrings: 'hoop', earringSide: 'both' },
    { skin: S.peach, hair: H.ink, cloth: C.forest, hairStyle: 'pixieSwept', outfit: 'vneck', earrings: 'hoop' },
  ],
  teen: [
    { skin: S.light, hair: H.ink, cloth: C.sage, hairStyle: 'sideSwept', outfit: 'hoodie', mouth: 'smirk' },
    { skin: S.warm, hair: H.brown, cloth: C.clay, hairStyle: 'curlyMop', outfit: 'stripe', glasses: 'rect' },
    { skin: S.tan, hair: H.dark, cloth: C.sky, hairStyle: 'spikyFront', outfit: 'hoodie', freckles: true, mouth: 'grin' },
    { skin: S.peach, hair: H.chestnut, cloth: C.forest, hairStyle: 'shaggy', outfit: 'crew', headphones: true },
    { skin: S.bronze, hair: H.black, cloth: C.terracotta, hairStyle: 'fauxHawk', outfit: 'crew', mouth: 'braces' },
    { skin: S.light, hair: H.dark, cloth: C.blush, hairStyle: 'spaceBuns', outfit: 'stripe', lashes: true, freckles: true, accent: A.rose },
    { skin: S.warm, hair: H.auburn, cloth: C.sageDark, hairStyle: 'sideBraid', outfit: 'hoodie', lashes: true, accent: A.mint },
    { skin: S.tan, hair: H.brown, cloth: C.teal, hairStyle: 'messyBun', outfit: 'crew', lashes: true, mouth: 'grin', accent: A.plum },
    { skin: S.peach, hair: H.black, cloth: C.olive, hairStyle: 'longBluntBangs', outfit: 'crew', lashes: true, glasses: 'rect' },
    { skin: S.bronze, hair: H.dark, cloth: C.sand, hairStyle: 'layeredShag', outfit: 'vneck', lashes: true, freckles: true, accent: A.coral },
  ],
  child: [
    { skin: S.peach, hair: H.dark, cloth: C.sky, hairStyle: 'bowlBangs', outfit: 'stripe', mouth: 'grin' },
    { skin: S.light, hair: H.brown, cloth: C.blush, hairStyle: 'curlPuffBow', outfit: 'sailor', lashes: true, accent: A.rose },
    { skin: S.warm, hair: H.ink, cloth: C.sage, hairStyle: 'softSpikes', outfit: 'overalls', freckles: true, mouth: 'grin' },
    { skin: S.tan, hair: H.chestnut, cloth: C.clay, hairStyle: 'cowlick', outfit: 'crew', mouth: 'gapTooth' },
    { skin: S.deep, hair: H.black, cloth: C.terracotta, hairStyle: 'afroPuffs', outfit: 'stripe', lashes: true, accent: A.gold },
    { skin: S.light, hair: H.sand, cloth: C.teal, hairStyle: 'pigtailsHigh', outfit: 'overalls', lashes: true, mouth: 'grin', accent: A.rose },
    { skin: S.bronze, hair: H.dark, cloth: C.sand, hairStyle: 'twinBraids', outfit: 'crew', lashes: true, accent: A.mint },
    { skin: S.peach, hair: H.brown, cloth: C.olive, hairStyle: 'miniTopKnot', outfit: 'overalls', freckles: true, mouth: 'grin' },
    { skin: S.warm, hair: H.ink, cloth: C.forest, hairStyle: 'sideClipBob', outfit: 'crew', lashes: true, accent: A.coral },
    { skin: S.tan, hair: H.chestnut, cloth: C.sageDark, hairStyle: 'lowPigtailsBangs', outfit: 'crew', lashes: true, accent: A.plum },
  ],
};

// ---------- self-check, then write ----------

const outputs = [];
for (const [group, specs] of Object.entries(SETS)) {
  specs.forEach((spec, i) => {
    const id = `${group}-${String(i + 1).padStart(2, '0')}`;
    outputs.push({ id, group, file: `${String(i + 1).padStart(2, '0')}.svg`, spec, svg: render(group, spec) });
  });
}

const errors = [];
const geometryOf = (svg) => createHash('md5').update(svg.replace(/#[0-9a-fA-F]{6}/g, '')).digest('hex');
const seenGeometry = new Map();
const seenStyle = new Map();
for (const o of outputs) {
  const g = geometryOf(o.svg);
  if (seenGeometry.has(g)) errors.push(`identical geometry: ${seenGeometry.get(g)} and ${o.id}`);
  seenGeometry.set(g, o.id);
  if (seenStyle.has(o.spec.hairStyle)) errors.push(`hair style reused: ${o.spec.hairStyle} in ${seenStyle.get(o.spec.hairStyle)} and ${o.id}`);
  seenStyle.set(o.spec.hairStyle, o.id);
  if (/hijab|chador|scarf|bald|receding/i.test(o.spec.hairStyle)) errors.push(`forbidden style ${o.spec.hairStyle} in ${o.id}`);
}
for (const [group, specs] of Object.entries(SETS)) {
  if (specs.length !== 10) errors.push(`${group} has ${specs.length} avatars, expected 10`);
  const cloths = new Set(specs.map((s) => s.cloth));
  if (cloths.size !== specs.length) errors.push(`${group}: outfit colours repeat`);
  for (const s of specs) {
    if (s.hair === HAIR.sand && ![SKIN.light, SKIN.peach, SKIN.warm].includes(s.skin)) errors.push(`${group}: light hair on dark skin (${s.hairStyle})`);
  }
}
if (errors.length) {
  console.error(`avatar self-check failed:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const roots = [join(here, '../public/avatars'), join(here, '../../../apps/admin/public/avatars')];
for (const root of roots) {
  for (const o of outputs) {
    const dir = join(root, o.group);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, o.file), o.svg);
  }
}

console.log(`wrote ${outputs.length} avatars (${seenGeometry.size} unique silhouettes) to app and admin public/avatars`);
