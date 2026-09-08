import { toLatinDigits } from './normalize.js';

export interface IranBank {
  name: string;
  code: string;
  color: string;
}

/**
 * Keyed by the official CBI 3-digit bank identifier — the same digits that appear at positions 4–6 of an
 * Iranian IBAN (IRcc BBB …). Keep this in sync with `apps/app/src/lib/bankIcons.ts`.
 * Banks merged into Sepah (انصار، قوامین، حکمت، کوثر، مهر اقتصاد) keep their legacy codes because
 * old IBANs/cards still carry them.
 */
const BANKS: Record<string, IranBank> = {
  '010': { name: 'مرکزی', code: '010', color: '#1B5E20' },
  '011': { name: 'صنعت و معدن', code: '011', color: '#37474F' },
  '012': { name: 'ملت', code: '012', color: '#C62828' },
  '013': { name: 'رفاه', code: '013', color: '#00838F' },
  '014': { name: 'مسکن', code: '014', color: '#EF6C00' },
  '015': { name: 'سپه', code: '015', color: '#1D4E89' },
  '016': { name: 'کشاورزی', code: '016', color: '#2E7D32' },
  '017': { name: 'ملی', code: '017', color: '#6B1E23' },
  '018': { name: 'تجارت', code: '018', color: '#B71C1C' },
  '019': { name: 'صادرات', code: '019', color: '#1565C0' },
  '020': { name: 'توسعه صادرات', code: '020', color: '#283593' },
  '021': { name: 'پست‌بانک', code: '021', color: '#2E7D32' },
  '022': { name: 'توسعه تعاون', code: '022', color: '#00695C' },
  '051': { name: 'موسسه توسعه', code: '051', color: '#455A64' },
  '052': { name: 'قوامین', code: '052', color: '#1D4E89' },
  '053': { name: 'کارآفرین', code: '053', color: '#37474F' },
  '054': { name: 'پارسیان', code: '054', color: '#C9A227' },
  '055': { name: 'اقتصاد نوین', code: '055', color: '#5D4037' },
  '056': { name: 'سامان', code: '056', color: '#0277BD' },
  '057': { name: 'پاسارگاد', code: '057', color: '#F9A825' },
  '058': { name: 'سرمایه', code: '058', color: '#6A1B9A' },
  '059': { name: 'سینا', code: '059', color: '#1565C0' },
  '060': { name: 'مهر ایران', code: '060', color: '#2E7D32' },
  '061': { name: 'شهر', code: '061', color: '#C62828' },
  '062': { name: 'آینده', code: '062', color: '#7B1FA2' },
  '063': { name: 'انصار', code: '063', color: '#1D4E89' },
  '064': { name: 'گردشگری', code: '064', color: '#0277BD' },
  '065': { name: 'حکمت ایرانیان', code: '065', color: '#1D4E89' },
  '066': { name: 'دی', code: '066', color: '#1565C0' },
  '069': { name: 'ایران زمین', code: '069', color: '#2E7D32' },
  '070': { name: 'رسالت', code: '070', color: '#00695C' },
  '073': { name: 'کوثر', code: '073', color: '#1D4E89' },
  '075': { name: 'ملل', code: '075', color: '#6D4C41' },
  '078': { name: 'خاورمیانه', code: '078', color: '#37474F' },
  '079': { name: 'مهر اقتصاد', code: '079', color: '#1D4E89' },
  '080': { name: 'نور', code: '080', color: '#1565C0' },
  '095': { name: 'ایران‌ونزوئلا', code: '095', color: '#C62828' },
};

/** First 6 digits of Iranian debit cards → bank code */
const BIN_TO_CODE: Record<string, string> = {
  '603799': '017',
  '636795': '017',
  '589210': '015',
  '603770': '016',
  '610433': '012',
  '991975': '012',
  '627353': '018',
  '585983': '018',
  '603769': '019',
  '589463': '013',
  '628023': '014',
  '627760': '021',
  '627961': '011',
  '627648': '020',
  '207177': '020',
  '502908': '022',
  '628157': '051',
  '639599': '052',
  '627488': '053',
  '502910': '053',
  '622106': '054',
  '627884': '054',
  '639194': '054',
  '627412': '055',
  '621986': '056',
  '502229': '057',
  '639347': '057',
  '639607': '058',
  '639346': '059',
  '606373': '060',
  '502806': '061',
  '504706': '061',
  '636214': '062',
  '186210': '062',
  '627381': '063',
  '505416': '064',
  '505426': '064',
  '636949': '065',
  '502938': '066',
  '505809': '066',
  '505785': '069',
  '504172': '070',
  '505801': '073',
  '606256': '075',
  '585947': '078',
  '639370': '079',
  '507677': '080',
};

export function bankByCode(code: string): IranBank | undefined {
  return BANKS[code];
}

export function listIranBanks(): IranBank[] {
  const seen = new Set<string>();
  const out: IranBank[] = [];
  for (const bank of Object.values(BANKS)) {
    if (seen.has(bank.code)) continue;
    seen.add(bank.code);
    out.push(bank);
  }
  return out;
}

const DRAPI_BANK: Record<string, string> = {
  MELLI: '017',
  BANK_MELLI: '017',
  MELLI_IRAN: '017',
  SEPAH: '015',
  BANK_SEPAH: '015',
  KESHAVARZI: '016',
  AGRICULTURE: '016',
  MELLAT: '012',
  BANK_MELLAT: '012',
  TEJARAT: '018',
  SADERAT: '019',
  SADERAT_IRAN: '019',
  REFAH: '013',
  REFAH_KARGARAN: '013',
  MASKAN: '014',
  POST_BANK: '021',
  POSTBANK: '021',
  MARKAZI: '010',
  CENTRAL_BANK: '010',
  SANAT_MADAN: '011',
  SANAT_VA_MADAN: '011',
  INDUSTRY_AND_MINE: '011',
  TOSEAH_TAAVON: '022',
  TOSE_E_TAAVON: '022',
  TOSEE_TAAVON: '022',
  TOSEAH_SADERAT: '020',
  TOSEE_SADERAT: '020',
  EXPORT_DEVELOPMENT: '020',
  TOSEE: '051',
  TOSEAH: '051',
  GHAVAMIN: '052',
  KARAFARIN: '053',
  PARSIAN: '054',
  EGHTESAD_NOVIN: '055',
  EN: '055',
  SAMAN: '056',
  PASARGAD: '057',
  SARMAYE: '058',
  SARMAYEH: '058',
  SINA: '059',
  MEHR_IRAN: '060',
  MEHR: '060',
  GHARZOLHASANEH_MEHR_IRAN: '060',
  SHAHR: '061',
  AYANDEH: '062',
  AYANDE: '062',
  ANSAR: '063',
  RESALAT: '070',
  GHARZOLHASANEH_RESALAT: '070',
  GARDESHGRI: '064',
  GARDESHGARI: '064',
  TOURISM: '064',
  HEKMAT: '065',
  HEKMAT_IRANIAN: '065',
  DEY: '066',
  DAY: '066',
  IRAN_ZAMIN: '069',
  KOSAR: '073',
  KOWSAR: '073',
  MELAL: '075',
  ASKARIEH: '075',
  KHAVARMIANEH: '078',
  MIDDLE_EAST: '078',
  MIDDLE_EAST_BANK: '078',
  MEHR_EGHTESAD: '079',
  NOOR: '080',
  IRAN_VENEZUELA: '095',
  IRANVENEZUELA: '095',
};

export function bankFromDrapi(name: string | undefined | null): IranBank | undefined {
  if (!name) return undefined;
  const key = name.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const code = DRAPI_BANK[key];
  if (code) return BANKS[code];
  return Object.values(BANKS).find((b) => b.name === name.trim());
}

export function detectBankFromCard(card: string): IranBank | undefined {
  const digits = toLatinDigits(card).replace(/\D/g, '');
  if (digits.length < 6) return undefined;
  const code = BIN_TO_CODE[digits.slice(0, 6)];
  return code ? BANKS[code] : undefined;
}

/** Iranian IBAN: IR + 2 check + 3 bank code + 19 account. Accepts 24 digits without IR. */
export function detectBankFromSheba(sheba: string): IranBank | undefined {
  let raw = toLatinDigits(sheba).replace(/\s/g, '').toUpperCase();
  if (!raw.startsWith('IR')) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 24) raw = `IR${digits}`;
  }
  if (!raw.startsWith('IR') || raw.length < 7) return undefined;
  return BANKS[raw.slice(4, 7)];
}

export function detectBank(card?: string, sheba?: string): IranBank | undefined {
  if (card) {
    const fromCard = detectBankFromCard(card);
    if (fromCard) return fromCard;
  }
  if (sheba) return detectBankFromSheba(sheba);
  return undefined;
}

export function formatCardGrouped(card: string): string {
  const digits = toLatinDigits(card).replace(/\D/g, '');
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

export function formatShebaGrouped(sheba: string): string {
  const raw = toLatinDigits(sheba).replace(/\s/g, '').toUpperCase();
  return raw.replace(/(.{4})/g, '$1 ').trim();
}
