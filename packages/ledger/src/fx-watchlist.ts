const CODE_RE = /^[A-Z0-9]{3,8}$/;

/** Pin list of FX codes. IRT/IRR are period base units, not live pairs. */
export function sanitizeFxWatchlist(input: unknown, max = 30): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const code = item.trim().toUpperCase();
    if (!code || code === 'IRT' || code === 'IRR' || seen.has(code) || !CODE_RE.test(code)) continue;
    seen.add(code);
    out.push(code);
    if (out.length >= max) break;
  }
  return out;
}
