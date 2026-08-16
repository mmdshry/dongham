/** Regional-indicator emoji (🇺🇸, 🇪🇺) → ISO 3166-1 alpha-2, or null for symbols like 🟡. */
export function flagEmojiToIso2(flag: string): string | null {
  const cps = [...flag];
  if (cps.length < 2) return null;
  const a = cps[0].codePointAt(0);
  const b = cps[1].codePointAt(0);
  if (a == null || b == null) return null;
  if (a < 0x1f1e6 || a > 0x1f1ff || b < 0x1f1e6 || b > 0x1f1ff) return null;
  return String.fromCharCode(a - 0x1f1e6 + 65) + String.fromCharCode(b - 0x1f1e6 + 65);
}

export function flagCdnUrl(iso2: string, width = 40): string {
  return `https://flagcdn.com/w${width}/${iso2.toLowerCase()}.png`;
}
