/** Jalali calendar helpers without extra dependencies. */

import type { RecurringCadence } from './types.js';

export type { RecurringCadence };

const PERSIAN_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

function div(a: number, b: number) {
  return Math.trunc(a / b);
}

export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  let gy2 = gy <= 1600 ? gy - 621 : gy - 1600;
  const gyMinus = gm > 2 ? gy2 + 1 : gy2;
  let days =
    365 * gy2 +
    div(gyMinus + 3, 4) -
    div(gyMinus + 99, 100) +
    div(gyMinus + 399, 400) -
    80 +
    gd +
    g_d_m[gm - 1];
  jy += 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    jy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy = jy <= 979 ? 621 : 1600;
  const jy2 = jy <= 979 ? jy : jy - 979;
  let days =
    365 * jy2 +
    div(jy2, 33) * 8 +
    div((jy2 % 33) + 3, 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const gd = days + 1;
  const sal_a = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  let gm = 0;
  let remain = gd;
  for (gm = 1; gm <= 12 && remain > sal_a[gm]; gm += 1) remain -= sal_a[gm];
  return [gy, gm, remain];
}

export function jalaliMonthDays(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  const [y1, m1, d1] = jalaliToGregorian(jy, 1, 1);
  const [y2, m2, d2] = jalaliToGregorian(jy + 1, 1, 1);
  const days = Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000,
  );
  return days - 336;
}

export function isoToJalaliParts(iso: string): { y: number; m: number; d: number } {
  const dt = new Date(iso);
  const [y, m, d] = gregorianToJalali(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  return { y, m, d };
}

export function jalaliPartsToIso(y: number, m: number, d: number): string {
  const [gy, gm, gd] = jalaliToGregorian(y, m, d);
  const dt = new Date(gy, gm - 1, gd, 12, 0, 0);
  return dt.toISOString();
}

export function jalaliMonthName(m: number): string {
  return PERSIAN_MONTHS[m - 1] || String(m);
}

export type CalendarMode = 'jalali' | 'gregorian';

export const GREGORIAN_MONTHS_FA = [
  'ژانویه',
  'فوریه',
  'مارس',
  'آوریل',
  'مه',
  'ژوئن',
  'ژوئیه',
  'اوت',
  'سپتامبر',
  'اکتبر',
  'نوامبر',
  'دسامبر',
];

/** Saturday-first weekday initials (شنبه … جمعه). */
export const WEEKDAY_SHORT_FA = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

export function gregorianMonthDays(gy: number, gm: number): number {
  return new Date(gy, gm, 0).getDate();
}

export function gregorianMonthName(m: number): string {
  return GREGORIAN_MONTHS_FA[m - 1] || String(m);
}

export function isoToGregorianParts(iso: string): { y: number; m: number; d: number } {
  const dt = new Date(iso);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

export function gregorianPartsToIso(y: number, m: number, d: number, fromIso?: string): string {
  const src = fromIso ? new Date(fromIso) : null;
  const dt = new Date(
    y,
    m - 1,
    d,
    src ? src.getHours() : 12,
    src ? src.getMinutes() : 0,
    src ? src.getSeconds() : 0,
  );
  return dt.toISOString();
}

/** JS Sunday=0 → Saturday-first index 0..6. */
export function saturdayIndex(date: Date): number {
  return (date.getDay() + 1) % 7;
}

export function calendarMonthDays(y: number, m: number, mode: CalendarMode): number {
  return mode === 'jalali' ? jalaliMonthDays(y, m) : gregorianMonthDays(y, m);
}

export function calendarMonthName(m: number, mode: CalendarMode): string {
  return mode === 'jalali' ? jalaliMonthName(m) : gregorianMonthName(m);
}

export function isoToCalendarParts(iso: string, mode: CalendarMode): { y: number; m: number; d: number } {
  return mode === 'jalali' ? isoToJalaliParts(iso) : isoToGregorianParts(iso);
}

export function calendarPartsToIso(
  y: number,
  m: number,
  d: number,
  mode: CalendarMode,
  fromIso?: string,
): string {
  if (mode === 'gregorian') return gregorianPartsToIso(y, m, d, fromIso);
  const [gy, gm, gd] = jalaliToGregorian(y, m, Math.min(d, jalaliMonthDays(y, m)));
  return gregorianPartsToIso(gy, gm, gd, fromIso);
}

export function shiftCalendarMonth(y: number, m: number, delta: number): { y: number; m: number } {
  let nm = m + delta;
  let ny = y;
  while (nm > 12) {
    nm -= 12;
    ny += 1;
  }
  while (nm < 1) {
    nm += 12;
    ny -= 1;
  }
  return { y: ny, m: nm };
}

export type CalendarCell = { y: number; m: number; d: number; inMonth: boolean };

export function calendarMonthGrid(y: number, m: number, mode: CalendarMode): CalendarCell[] {
  const days = calendarMonthDays(y, m, mode);
  const firstIso = calendarPartsToIso(y, m, 1, mode);
  const offset = saturdayIndex(new Date(firstIso));
  const prev = shiftCalendarMonth(y, m, -1);
  const prevDays = calendarMonthDays(prev.y, prev.m, mode);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < offset; i += 1) {
    cells.push({ y: prev.y, m: prev.m, d: prevDays - offset + i + 1, inMonth: false });
  }
  for (let d = 1; d <= days; d += 1) {
    cells.push({ y, m, d, inMonth: true });
  }
  const next = shiftCalendarMonth(y, m, 1);
  let nd = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ y: next.y, m: next.m, d: nd, inMonth: false });
    nd += 1;
  }
  return cells;
}

export function sameCalendarDay(
  a: { y: number; m: number; d: number },
  b: { y: number; m: number; d: number },
): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

export function addJalaliMonths(iso: string, months: number): string {
  const { y, m, d } = isoToJalaliParts(iso);
  let nm = m + months;
  let ny = y;
  while (nm > 12) {
    nm -= 12;
    ny += 1;
  }
  while (nm < 1) {
    nm += 12;
    ny -= 1;
  }
  const maxD = jalaliMonthDays(ny, nm);
  return jalaliPartsToIso(ny, nm, Math.min(d, maxD));
}

export function nextRecurringAt(
  fromIso: string,
  cadence: RecurringCadence = 'days',
  intervalDays = 30,
): string {
  if (cadence === 'jalaliMonthly') return addJalaliMonths(fromIso, 1);
  if (cadence === 'jalaliBimonthly') return addJalaliMonths(fromIso, 2);
  return new Date(new Date(fromIso).getTime() + intervalDays * 86400_000).toISOString();
}

export function inferCadence(intervalDays: number): RecurringCadence {
  if (intervalDays >= 50) return 'jalaliBimonthly';
  if (intervalDays >= 28) return 'jalaliMonthly';
  return 'days';
}

export { PERSIAN_MONTHS };
