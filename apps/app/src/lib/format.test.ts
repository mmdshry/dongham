import { describe, expect, it } from 'vitest';
import { parseReceiptHeuristic } from './ocr';
import {
  isValidIranMobile,
  formatJalaliDate,
  formatJalaliDateTime,
  iranCardOk,
  luhnOk,
  normalizeSheba,
  parseMoneyInput,
  parseWeightInput,
  formatWeightInput,
  isAllowedWeightDraft,
  shebaOk,
  toPersianDigits,
  toWhatsAppE164,
  toIranLocal09,
  formatCardGrouped,
  formatMoney,
} from './format';
import { uniqueTags } from '../components/TagPicker';
import { currencyLabel } from './currencies';
import { gregorianToJalali, jalaliToGregorian, jalaliMonthDays } from './jalali';
import { buildSettlementText, canShareToMessenger, messengerUrls } from './share';

describe('ocr heuristic', () => {
  it('extracts amount from filename-like text', async () => {
    const res = await parseReceiptHeuristic('restaurant_bill_450000.jpg', 'جمع: 450,000 تومان');
    expect(res.amountToman).toBe(450000);
  });
});

describe('format', () => {
  it('converts digits', () => {
    expect(toPersianDigits('12')).toBe('۱۲');
    expect(toPersianDigits(4)).toBe('۴');
    expect(toPersianDigits(5)).toBe('۵');
  });

  it('formats money with persian digits and persian-only currency', () => {
    const text = formatMoney(250000, 'IRT', true);
    expect(text).toContain('۲۵۰');
    expect(text).toContain('تومان');
    expect(text).not.toContain('Toman');
    expect(currencyLabel('USD')).toBe('دلار آمریکا');
    expect(currencyLabel('IRT')).toBe('تومان');
  });

  it('parses money with separators and persian digits', () => {
    expect(parseMoneyInput('۲۵۰٬۰۰۰')).toBe(250000);
    expect(parseMoneyInput('1,000,000')).toBe(1_000_000);
  });

  it('parses split weights with up to 3 decimals', () => {
    expect(parseWeightInput('۱.۲۵۰')).toBe(1.25);
    expect(parseWeightInput('1,125')).toBe(1.125);
    expect(parseWeightInput('1.2504')).toBe(1.25);
    expect(parseWeightInput('-2')).toBe(0);
    expect(isAllowedWeightDraft('۰.۱۲')).toBe(true);
    expect(isAllowedWeightDraft('1.2500')).toBe(false);
    expect(formatWeightInput(1.25, true)).toBe('۱.۲۵');
  });

  it('validates iran mobile and e164', () => {
    expect(isValidIranMobile('09121234567')).toBe(true);
    expect(isValidIranMobile('۰۹۱۲۱۲۳۴۵۶۷')).toBe(true);
    expect(isValidIranMobile('٠٩١٢١٢٣٤٥٦٧')).toBe(true);
    expect(isValidIranMobile('+989121234567')).toBe(true);
    expect(isValidIranMobile('9121234567')).toBe(true);
    expect(isValidIranMobile('02122001001')).toBe(false);
    expect(isValidIranMobile('0912123456')).toBe(false);
    expect(toWhatsAppE164('۰۹۱۲۱۲۳۴۵۶۷')).toBe('989121234567');
  });

  it('validates card luhn and sheba', () => {
    expect(luhnOk('4111111111111111')).toBe(true);
    expect(luhnOk('4111111111111112')).toBe(false);
    expect(iranCardOk('6037991111111111')).toBe(false);
    expect(iranCardOk('6037991111111112')).toBe(true);
    expect(iranCardOk('4111111111111111')).toBe(true);
    expect(iranCardOk('411111111111111')).toBe(false);
    expect(shebaOk('IR060170000000000000000000')).toBe(true);
    expect(shebaOk('060170000000000000000000')).toBe(true);
    expect(shebaOk('IR000170000000000000000000')).toBe(false);
    expect(normalizeSheba('060170000000000000000000')).toBe('IR060170000000000000000000');
  });

  it('includes time in jalali datetime', () => {
    const iso = '2026-08-16T10:45:00.000Z';
    const date = formatJalaliDate(iso);
    const dateTime = formatJalaliDateTime(iso);
    expect(dateTime.startsWith(date) || dateTime.includes(date)).toBe(true);
    expect(dateTime.length).toBeGreaterThan(date.length);
  });

  it('groups card numbers', () => {
    expect(formatCardGrouped('6037991111111111')).toBe('6037 9911 1111 1111');
  });
});

describe('jalali', () => {
  it('roundtrips a known date', () => {
    const [y, m, d] = gregorianToJalali(2026, 3, 21);
    expect(m).toBe(1);
    expect(d).toBe(1);
    const g = jalaliToGregorian(y, m, d);
    expect(g[1]).toBe(3);
    expect(g[2]).toBe(21);
  });

  it('esfand has 29 or 30 days', () => {
    const days = jalaliMonthDays(1404, 12);
    expect(days === 29 || days === 30).toBe(true);
  });
});

describe('calendar grid', () => {
  it('roundtrips jalali and gregorian parts for Nowruz 1405', async () => {
    const { calendarPartsToIso, isoToCalendarParts, gregorianMonthDays, calendarMonthGrid } =
      await import('./jalali');
    const jalaliIso = calendarPartsToIso(1405, 1, 1, 'jalali');
    expect(isoToCalendarParts(jalaliIso, 'jalali')).toEqual({ y: 1405, m: 1, d: 1 });
    expect(isoToCalendarParts(jalaliIso, 'gregorian')).toEqual({ y: 2026, m: 3, d: 21 });
    const gregIso = calendarPartsToIso(2026, 3, 21, 'gregorian');
    expect(isoToCalendarParts(gregIso, 'jalali')).toEqual({ y: 1405, m: 1, d: 1 });
    expect(gregorianMonthDays(2024, 2)).toBe(29);
    expect(gregorianMonthDays(2025, 2)).toBe(28);
    const grid = calendarMonthGrid(1405, 1, 'jalali');
    expect(grid.length % 7).toBe(0);
    expect(grid.filter((c) => c.inMonth)).toHaveLength(31);
  });
});

describe('tags', () => {
  it('dedupes and trims tags', () => {
    expect(uniqueTags([' غذا ', 'غذا', 'حمل‌ونقل', ''])).toEqual(['غذا', 'حمل‌ونقل']);
  });
});

describe('share', () => {
  it('disables messengers without phone', () => {
    expect(canShareToMessenger(undefined)).toBe(false);
    expect(canShareToMessenger('09121234567')).toBe(true);
  });

  it('builds wa.me url', () => {
    const urls = messengerUrls('09121234567', 'سلام');
    expect(urls.whatsapp).toContain('https://wa.me/989121234567');
    expect(urls.bale).toContain('https://ble.ir/09121234567');
  });

  it('normalizes Iranian phones for Bale', () => {
    expect(toIranLocal09('989121234567')).toBe('09121234567');
    expect(toIranLocal09('+989121234567')).toBe('09121234567');
  });

  it('builds settlement text', () => {
    const text = buildSettlementText({
      debtorName: 'علی',
      creditorName: 'سارا',
      amountLabel: '۲۵۰٬۰۰۰ تومان',
      card: '4111111111111111',
    });
    expect(text).toContain('علی');
    expect(text).toContain('سارا');
    expect(text).toContain('باید به');
    expect(text).toContain('دونگ‌هام');
  });
});

describe('recurring cadence labels', () => {
  it('household uses jalali months', async () => {
    const { TEMPLATES } = await import('./templates');
    const house = TEMPLATES.find((t) => t.id === 'household');
    expect(house?.recurring?.every((r) => r.cadence !== 'days')).toBe(true);
    expect(TEMPLATES.some((t) => t.id === 'dorm')).toBe(true);
    expect(TEMPLATES.some((t) => t.id === 'ziarat')).toBe(true);
    expect(TEMPLATES.some((t) => t.id === 'wedding')).toBe(true);
    expect(TEMPLATES.some((t) => t.id === 'building')).toBe(true);
  });
});
