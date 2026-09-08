import type { PeriodTemplate, RecurringCadence, SplitMode } from '@dongham/ledger';
import { formatMoney } from './format';

export const TEMPLATES: {
  id: PeriodTemplate;
  label: string;
  tags: string[];
  defaultKind?: 'split' | 'banker' | 'pot';
  defaultCurrency?: string;
  recurring?: { title: string; cadence: RecurringCadence; intervalDays?: number }[];
}[] = [
  {
    id: 'travel',
    label: 'سفر دوستانه',
    tags: ['غذا', 'حمل‌ونقل', 'اقامت', 'بلیت'],
  },
  {
    id: 'household',
    label: 'هم‌خانگی',
    tags: ['قبض', 'شارژ', 'اجاره', 'خرید خانه'],
    recurring: [
      { title: 'قبض آب', cadence: 'jalaliBimonthly' },
      { title: 'قبض برق', cadence: 'jalaliBimonthly' },
      { title: 'قبض گاز', cadence: 'jalaliBimonthly' },
      { title: 'اینترنت', cadence: 'jalaliMonthly' },
      { title: 'شارژ ساختمان', cadence: 'jalaliMonthly' },
      { title: 'اجاره', cadence: 'jalaliMonthly' },
    ],
  },
  {
    id: 'work',
    label: 'ناهار محل کار',
    tags: ['ناهار', 'اسنپ', 'قهوه'],
  },
  {
    id: 'family',
    label: 'خانواده',
    tags: ['هدیه', 'مهمانی', 'خرید'],
  },
  {
    id: 'dorm',
    label: 'خوابگاه / دانشگاه',
    tags: ['ناهار', 'اسنپ', 'قبض اتاق', 'شارژ'],
  },
  {
    id: 'ziarat',
    label: 'سفر زیارتی',
    tags: ['اتوبوس', 'اقامت', 'غذا', 'نذر'],
    defaultKind: 'pot',
    defaultCurrency: 'IRT',
  },
  {
    id: 'wedding',
    label: 'جشن / عروسی',
    tags: ['سالن', 'سفره', 'هدیه', 'لباس'],
  },
  {
    id: 'building',
    label: 'شارژ ساختمان',
    tags: ['شارژ', 'آسانسور', 'پارکینگ', 'تعمیرات'],
    recurring: [{ title: 'شارژ ماهانه', cadence: 'jalaliMonthly' }],
  },
  {
    id: 'custom',
    label: 'سفارشی',
    tags: [],
  },
];

export function templateById(id: PeriodTemplate) {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[TEMPLATES.length - 1];
}

export const KIND_OPTIONS = [
  { id: 'split' as const, label: 'تقسیم کلاسیک' },
  { id: 'banker' as const, label: 'گنجه‌بان (یک نفر می‌دهد)' },
  { id: 'pot' as const, label: 'صندوق مشترک' },
];

export const ROUND_OPTIONS = [
  { id: 0 as const, label: 'بدون گرد کردن' },
  { id: 1000 as const, label: 'هزار تومان' },
  { id: 10000 as const, label: 'ده‌هزار تومان' },
];

/** Same steps, but named in the period's own currency (a USD period is not rounded to «هزار تومان»). */
export function roundOptionsFor(currency: string, persian = true): { id: 0 | 1000 | 10000; label: string }[] {
  if (currency === 'IRT') return ROUND_OPTIONS;
  return ROUND_OPTIONS.map((r) => ({
    id: r.id,
    label: r.id === 0 ? r.label : `${formatMoney(r.id, currency, persian)}`,
  }));
}

export const CADENCE_OPTIONS: { id: RecurringCadence; label: string }[] = [
  { id: 'jalaliMonthly', label: 'هر ماه شمسی' },
  { id: 'jalaliBimonthly', label: 'هر دو ماه شمسی' },
  { id: 'days', label: 'هر N روز' },
];
export function defaultSplitMode(): SplitMode {
  return 'equal';
}

