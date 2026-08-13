import { toLatinDigits } from './telegram-parse.js';

export interface IranBank {
  name: string;
  code: string;
  color: string;
}

const BANKS: Record<string, IranBank> = {
  '017': { name: 'ملی', code: '017', color: '#6B1E23' },
  '015': { name: 'سپه', code: '015', color: '#1D4E89' },
  '016': { name: 'کشاورزی', code: '016', color: '#2E7D32' },
  '012': { name: 'ملت', code: '012', color: '#C62828' },
  '018': { name: 'تجارت', code: '018', color: '#B71C1C' },
  '019': { name: 'صادرات', code: '019', color: '#1565C0' },
  '013': { name: 'رفاه', code: '013', color: '#00838F' },
  '014': { name: 'مسکن', code: '014', color: '#EF6C00' },
  '021': { name: 'پست‌بانک', code: '021', color: '#2E7D32' },
  '020': { name: 'توسعه تعاون', code: '020', color: '#00695C' },
  '051': { name: 'توسعه صادرات', code: '051', color: '#283593' },
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
  '063': { name: 'رسالت', code: '063', color: '#00695C' },
  '064': { name: 'گردشگری', code: '064', color: '#0277BD' },
  '066': { name: 'دی', code: '066', color: '#1565C0' },
  '069': { name: 'ایران زمین', code: '069', color: '#2E7D32' },
  '070': { name: 'خاورمیانه', code: '070', color: '#37474F' },
  '078': { name: 'خاورمیانه', code: '078', color: '#37474F' },
  '080': { name: 'نور', code: '080', color: '#1565C0' },
  '095': { name: 'ایران‌ونزوئلا', code: '095', color: '#C62828' },
};

/** First 6 digits of Iranian debit cards → bank code */
const BIN_TO_CODE: Record<string, string> = {
  '603799': '017',
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
  '502908': '020',
  '627961': '051',
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
  '504172': '063',
  '505416': '064',
  '502938': '066',
  '505785': '069',
  '585947': '070',
  '627381': '060',
  '639599': '015',
  '636795': '017',
  '505809': '066',
  '636949': '015',
};

export function bankByCode(code: string): IranBank | undefined {
  return BANKS[code];
}

export function detectBankFromCard(card: string): IranBank | undefined {
  const digits = toLatinDigits(card).replace(/\D/g, '');
  if (digits.length < 6) return undefined;
  const code = BIN_TO_CODE[digits.slice(0, 6)];
  return code ? BANKS[code] : undefined;
}

/** Iranian IBAN: IR + 2 check + 3 bank code + 19 account */
export function detectBankFromSheba(sheba: string): IranBank | undefined {
  const raw = toLatinDigits(sheba).replace(/\s/g, '').toUpperCase();
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
