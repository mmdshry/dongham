const modules = import.meta.glob('../assets/banks/*.{webp,png,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/**
 * FarajiGold filename stem → official CBI bank code (same keys as `BANKS` in @dongham/ledger).
 * Every file under assets/banks must appear here exactly once, except:
 *  - `ir-blu`: Blu is Saman's neobank and shares Sheba code 056 / BIN 621986, so it is
 *    indistinguishable from Saman; `ir-saman` is the canonical icon for 056.
 *  - `unknown`: generic fallback, exposed via `unknownBankIconUrl()`.
 */
const FILE_TO_CODE: Record<string, string> = {
  'ir-markazi': '010',
  'ir-sanat-madan': '011',
  'ir-mellat': '012',
  'ir-refah': '013',
  'ir-maskan': '014',
  'ir-sepah': '015',
  'ir-keshavarzi': '016',
  'ir-melli': '017',
  'ir-tejarat': '018',
  'ir-saderat': '019',
  'ir-tosee-saderat': '020',
  'ir-post-bank': '021',
  'ir-tose-taawon': '022',
  'ir-tosee': '051',
  'ir-ghavamin': '052',
  'ir-karafarin': '053',
  'ir-parsian': '054',
  'ir-eghtesad-novin': '055',
  'ir-saman': '056',
  'ir-pasargad': '057',
  'ir-sarmayeh': '058',
  'ir-sina': '059',
  'ir-mehr': '060',
  'ir-shahr': '061',
  'ir-ayandeh': '062',
  'ir-ansar': '063',
  'ir-gardeshgari': '064',
  'ir-hekmat': '065',
  'ir-day': '066',
  'ir-iranzamin': '069',
  'ir-resalat': '070',
  'ir-kosar': '073',
  'ir-melal': '075',
  'ir-khavarmianeh': '078',
  'ir-mehr-eghtesad': '079',
  'ir-noor': '080',
  'ir-venezuela': '095',
};

const byCode: Record<string, string> = {};
let unknownUrl: string | undefined;
for (const [path, url] of Object.entries(modules)) {
  const file = path.split('/').pop()?.replace(/\.(webp|png|svg).*$/i, '') || '';
  if (file === 'unknown') {
    unknownUrl = url;
    continue;
  }
  const code = FILE_TO_CODE[file];
  if (!code) continue;
  if (byCode[code] && import.meta.env.DEV) {
    console.warn(`[bankIcons] two icon files map to bank code ${code}; keeping the first one`);
    continue;
  }
  byCode[code] = url;
}

export function bankIconUrl(code?: string): string | undefined {
  if (!code) return undefined;
  return byCode[code];
}

/** Generic bank glyph for cards whose bank could not be detected. */
export function unknownBankIconUrl(): string | undefined {
  return unknownUrl;
}
