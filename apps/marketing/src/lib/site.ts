export const SITE_ORIGIN = 'https://dongham.ir';
export const APP_URL = `${SITE_ORIGIN}/app`;
export const OG_PATH = '/og.png';
export const SUPPORT_BLE = 'https://ble.ir/dongham';

export const SAME_AS = [SUPPORT_BLE] as const;

export const navLinks = [
  { href: '/features/', label: 'ویژگی‌ها' },
  { href: '/guide/', label: 'راهنما' },
  { href: '/travel/', label: 'سفر' },
  { href: '/faq/', label: 'سوالات' },
  { href: '/about/', label: 'درباره' },
] as const;

export const footerLinks = [
  { href: '/features/', label: 'ویژگی‌ها' },
  { href: '/guide/', label: 'راهنما' },
  { href: '/travel/', label: 'تقسیم هزینه سفر' },
  { href: '/dorm/', label: 'خوابگاه' },
  { href: '/home/', label: 'خانه' },
  { href: '/faq/', label: 'سوالات متداول' },
  { href: '/compare/', label: 'مقایسه' },
  { href: '/about/', label: 'درباره' },
  { href: '/privacy/', label: 'حریم خصوصی' },
  { href: '/terms/', label: 'شرایط استفاده' },
] as const;

export type Crumb = { name: string; href: string };
