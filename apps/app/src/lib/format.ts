import { currencyLabel } from './currencies';
import {
  formatCardGrouped as groupCard,
  formatShebaGrouped as groupSheba,
  normalizeEmail as emailFromLedger,
  normalizeIranMobile as mobileFromLedger,
  normalizeOtpCode as otpFromLedger,
  toLatinDigits as latinFromLedger,
} from '@dongham/ledger';

const persianDigits = '۰۱۲۳۴۵۶۷۸۹';

export function toPersianDigits(input: string | number, enabled = true): string {
  const s = String(input);
  if (!enabled) return s;
  return s.replace(/\d/g, (d) => persianDigits[Number(d)]);
}

export function toLatinDigits(input: string): string {
  return latinFromLedger(input);
}

export function formatMoney(amount: number, currency = 'IRT', persian = true): string {
  const formatted = new Intl.NumberFormat('fa-IR').format(amount);
  const withDigits = persian ? formatted : new Intl.NumberFormat('en-US').format(amount);
  return `${withDigits} ${currencyLabel(currency)}`;
}

/** Convert explicit toman ↔ rial when the user switches IRT/IRR on a field. */
export function tomanToRial(toman: number): number {
  return Math.round(toman * 10);
}

export function rialToToman(rial: number): number {
  return Math.round(rial / 10);
}

export function formatJalaliDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatJalaliDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16);
  }
}

export function formatCalendarDate(iso: string, mode: 'jalali' | 'gregorian', persian = true): string {
  try {
    if (mode === 'jalali') {
      const text = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(new Date(iso));
      return persian ? text : toLatinDigits(text);
    }
    return new Intl.DateTimeFormat(persian ? 'fa-IR-u-ca-gregory' : 'en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatCalendarDateTime(iso: string, mode: 'jalali' | 'gregorian', persian = true): string {
  try {
    if (mode === 'jalali') {
      const text = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
      return persian ? text : toLatinDigits(text);
    }
    return new Intl.DateTimeFormat(persian ? 'fa-IR-u-ca-gregory' : 'en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16);
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Parse a money field that may contain Persian digits and thousand separators. */
export function parseMoneyInput(raw: string): number {
  const latin = toLatinDigits(raw).replace(/[^\d.-]/g, '');
  if (!latin) return 0;
  const n = Number(latin);
  return Number.isFinite(n) ? Math.round(Math.abs(n)) : 0;
}

function normalizeWeightText(raw: string): string {
  return toLatinDigits(raw).replace(/[٫,]/g, '.').trim();
}

/** True while typing a weight (empty, `1.`, `۰.۱۲`). */
export function isAllowedWeightDraft(raw: string): boolean {
  const latin = normalizeWeightText(raw);
  return latin === '' || /^\d*\.?\d{0,3}$/.test(latin);
}

/** Parse a split coefficient; max 3 decimal places, never negative. */
export function parseWeightInput(raw: string): number {
  const latin = normalizeWeightText(raw);
  if (!latin || latin === '.' || latin === '-') return 0;
  const n = Number(latin);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 1000) / 1000;
}

export function formatWeightInput(n: number, persian = true): string {
  if (!Number.isFinite(n) || n < 0) n = 0;
  const rounded = Math.round(n * 1000) / 1000;
  return toPersianDigits(String(rounded), persian);
}

export function formatGrouped(amount: number, persian = true): string {
  if (!amount) return '';
  const s = new Intl.NumberFormat(persian ? 'fa-IR' : 'en-US').format(amount);
  return s;
}

export function normalizeIranMobile(phone: string | undefined | null): string | null {
  return mobileFromLedger(phone);
}

export function normalizeOtpCode(code: string | undefined | null): string | null {
  return otpFromLedger(code);
}

export function normalizeEmail(email: string | undefined | null): string | null {
  return emailFromLedger(email);
}

export function isValidIranMobile(phone: string | undefined | null): boolean {
  return !!normalizeIranMobile(phone);
}

/** E.164 without plus: 98XXXXXXXXXX */
export function toWhatsAppE164(phone: string): string | null {
  const local = normalizeIranMobile(phone);
  return local ? `98${local.slice(1)}` : null;
}

/** Iranian local mobile: 09XXXXXXXXX */
export function toIranLocal09(phone: string): string | null {
  return normalizeIranMobile(phone);
}

export function luhnOk(card: string): boolean {
  const digits = toLatinDigits(card).replace(/\D/g, '');
  if (digits.length < 16 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Iranian Shetab debit card: exactly 16 digits and Luhn. */
export function iranCardOk(card: string): boolean {
  const digits = normalizeCard(card);
  return digits.length === 16 && luhnOk(digits);
}

/** Iranian Sheba: IR + 24 digits. IBAN mod-97 must be 1. Accepts 24 digits without IR. */
export function shebaOk(sheba: string): boolean {
  const raw = normalizeSheba(sheba);
  if (!/^IR\d{24}$/.test(raw)) return false;
  const rearranged = raw.slice(4) + raw.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of expanded) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder === 1;
}

export function normalizeCard(card: string): string {
  return toLatinDigits(card).replace(/\D/g, '');
}

export function normalizeSheba(sheba: string): string {
  const raw = toLatinDigits(sheba).replace(/\s/g, '').toUpperCase();
  if (raw.startsWith('IR')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 24) return `IR${digits}`;
  return raw;
}

export function formatShebaGrouped(sheba: string): string {
  return groupSheba(sheba);
}

export function formatCardGrouped(card: string): string {
  return groupCard(card);
}


