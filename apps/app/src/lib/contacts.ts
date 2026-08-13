import { isValidIranMobile, toLatinDigits } from './format';

export async function pickIranContacts(): Promise<{ displayName: string; phone?: string }[]> {
  const nav = navigator as Navigator & {
    contacts?: {
      select: (props: string[], opts?: { multiple?: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]>;
    };
  };
  if (!nav.contacts?.select) {
    throw new Error('انتخاب مخاطب در این مرورگر پشتیبانی نمی‌شود');
  }
  const rows = await nav.contacts.select(['name', 'tel'], { multiple: true });
  return rows.map((r) => {
    const phoneRaw = r.tel?.[0] || '';
    const latin = toLatinDigits(phoneRaw).replace(/\D/g, '');
    const phone = latin.startsWith('98') ? `0${latin.slice(2)}` : latin.startsWith('9') && latin.length === 10 ? `0${latin}` : latin;
    return {
      displayName: r.name?.[0] || 'دوست',
      phone: isValidIranMobile(phone) ? phone : phone || undefined,
    };
  });
}
