import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const banks = [
  ['017', 'ملی', '#6B1E23'],
  ['015', 'سپه', '#1D4E89'],
  ['016', 'کشاورزی', '#2E7D32'],
  ['012', 'ملت', '#C62828'],
  ['018', 'تجارت', '#B71C1C'],
  ['019', 'صادرات', '#1565C0'],
  ['013', 'رفاه', '#00838F'],
  ['014', 'مسکن', '#EF6C00'],
  ['021', 'پست', '#2E7D32'],
  ['020', 'تعاون', '#00695C'],
  ['051', 'توسعه', '#283593'],
  ['053', 'کارآفرین', '#37474F'],
  ['054', 'پارسیان', '#C9A227'],
  ['055', 'نوین', '#5D4037'],
  ['056', 'سامان', '#0277BD'],
  ['057', 'پاسارگاد', '#F9A825'],
  ['058', 'سرمایه', '#6A1B9A'],
  ['059', 'سینا', '#1565C0'],
  ['060', 'مهر', '#2E7D32'],
  ['061', 'شهر', '#C62828'],
  ['062', 'آینده', '#7B1FA2'],
  ['063', 'رسالت', '#00695C'],
  ['064', 'گردش', '#0277BD'],
  ['066', 'دی', '#1565C0'],
  ['069', 'زمین', '#2E7D32'],
  ['070', 'خاور', '#37474F'],
  ['078', 'خاور', '#37474F'],
  ['080', 'نور', '#1565C0'],
  ['095', 'ونزو', '#C62828'],
];

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'banks');
mkdirSync(dir, { recursive: true });

for (const [code, label, color] of banks) {
  const text = label.slice(0, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${color}"/>
  <text x="32" y="40" text-anchor="middle" fill="#fff" font-size="20" font-weight="700" font-family="Tahoma,Vazirmatn,sans-serif">${text}</text>
</svg>
`;
  writeFileSync(join(dir, `${code}.svg`), svg);
}

console.log(`wrote ${banks.length} svg icons to ${dir}`);
