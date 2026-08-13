const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const arabicDigits = '٠١٢٣٤٥٦٧٨٩';

export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(persianDigits.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)));
}

export interface ParsedExpenseText {
  title: string;
  amount: number;
  payerName?: string;
}

/** Parse "علی ناهار ۵۰۰۰۰۰" or "ناهار 500" or "500 ناهار" (amount in تومان). */
export function parseExpenseText(raw: string): ParsedExpenseText | null {
  const text = toLatinDigits(raw).replace(/,/g, '').replace(/٬/g, '').trim();
  if (!text) return null;
  const amountMatch = text.match(/(\d{3,12})/);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const withoutAmount = text.replace(amountMatch[1], ' ').replace(/\s+/g, ' ').trim();
  if (!withoutAmount) return { title: 'هزینه', amount };
  const parts = withoutAmount.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return { payerName: parts[0], title: parts.slice(1).join(' '), amount };
  }
  return { title: parts[0] || 'هزینه', amount };
}

export function indexedAmountNow(principal: number, rateThen: number, rateNow: number): number {
  if (!rateThen || rateThen <= 0) return principal;
  return Math.round(principal * (rateNow / rateThen));
}
