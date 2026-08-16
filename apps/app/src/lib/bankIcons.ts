const modules = import.meta.glob('../assets/banks/*.{webp,png,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** FarajiGold filename stem → Sheba bank code */
const FILE_TO_CODE: Record<string, string> = {
  'ir-melli': '017',
  'ir-sepah': '015',
  'ir-keshavarzi': '016',
  'ir-mellat': '012',
  'ir-tejarat': '018',
  'ir-saderat': '019',
  'ir-refah': '013',
  'ir-maskan': '014',
  'ir-post-bank': '021',
  'ir-tose-taawon': '020',
  'ir-tosee-saderat': '051',
  'ir-karafarin': '053',
  'ir-parsian': '054',
  'ir-eghtesad-novin': '055',
  'ir-saman': '056',
  'ir-blu': '056',
  'ir-pasargad': '057',
  'ir-sarmayeh': '058',
  'ir-sina': '059',
  'ir-mehr': '060',
  'ir-shahr': '061',
  'ir-ayandeh': '062',
  'ir-resalat': '063',
  'ir-gardeshgari': '064',
  'ir-day': '066',
  'ir-iranzamin': '069',
  'ir-khavarmianeh': '070',
  'ir-noor': '080',
  'ir-venezuela': '095',
};

const byCode: Record<string, string> = {};
for (const [path, url] of Object.entries(modules)) {
  const file = path.split('/').pop()?.replace(/\.(webp|png|svg).*$/i, '') || '';
  const code = FILE_TO_CODE[file];
  if (code) byCode[code] = url;
}
if (byCode['070']) byCode['078'] = byCode['070'];

export function bankIconUrl(code?: string): string | undefined {
  if (!code) return undefined;
  return byCode[code];
}
