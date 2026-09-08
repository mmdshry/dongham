const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const arabicDigits = '٠١٢٣٤٥٦٧٨٩';

export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(persianDigits.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)));
}

/** Iranian local mobile `09XXXXXXXXX`, or null if not a valid mobile. */
export function normalizeIranMobile(input: string | undefined | null): string | null {
  if (!input) return null;
  let latin = toLatinDigits(input).replace(/[\s-]/g, '');
  if (latin.startsWith('+')) latin = latin.slice(1);
  if (/^09\d{9}$/.test(latin)) return latin;
  if (/^989\d{9}$/.test(latin)) return `0${latin.slice(2)}`;
  if (/^9\d{9}$/.test(latin)) return `0${latin}`;
  return null;
}

/** Six-digit OTP, accepting Persian/Arabic digits. */
export function normalizeOtpCode(input: string | undefined | null): string | null {
  if (!input) return null;
  const digits = toLatinDigits(input).replace(/\D/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

export function normalizeEmail(input: string | undefined | null): string | null {
  if (!input) return null;
  const email = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function indexedAmountNow(principal: number, rateThen: number, rateNow: number): number {
  if (!rateThen || rateThen <= 0) return principal;
  return Math.round(principal * (rateNow / rateThen));
}
