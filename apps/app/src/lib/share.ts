import { isValidIranMobile, toIranLocal09, toWhatsAppE164 } from './format';
import { renderCardToCardImage, shareOrDownloadPng } from './cardImage';

export function canShareToMessenger(phone?: string): boolean {
  return isValidIranMobile(phone);
}

export function settlementPaySentence(fromName: string, toName: string, amountLabel: string): string {
  return `${fromName} باید به ${toName} ${amountLabel} بپردازد`;
}

export function buildSettlementText(input: {
  debtorName: string;
  creditorName: string;
  amountLabel: string;
  card?: string;
  sheba?: string;
  holder?: string;
  bank?: string;
  debtorPhone?: string;
}): string {
  const lines = [
    `${settlementPaySentence(input.debtorName, input.creditorName, input.amountLabel)}.`,
    `کارت‌به‌کارت به ${input.creditorName} کافی است.`,
  ];
  if (input.card) lines.push(`کارت: ${input.card}`);
  if (input.sheba) lines.push(`شبا: ${input.sheba}`);
  if (input.holder) lines.push(`به نام: ${input.holder}`);
  if (input.bank) lines.push(`بانک: ${input.bank}`);
  if (input.debtorPhone) lines.push(`موبایل: ${input.debtorPhone}`);
  lines.push('— دونگ‌هام');
  return lines.join('\n');
}

export function messengerUrls(phone: string, text: string): {
  bale: string;
  whatsapp: string;
} {
  const encoded = encodeURIComponent(text);
  const e164 = toWhatsAppE164(phone) || '';
  const local09 = toIranLocal09(phone) || '';
  return {
    bale: local09 ? `https://ble.ir/${local09}` : `https://ble.ir/share?text=${encoded}`,
    whatsapp: e164 ? `https://wa.me/${e164}?text=${encoded}` : `https://wa.me/?text=${encoded}`,
  };
}

export function openMessenger(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function shareCardImage(input: {
  amountLabel: string;
  card?: string;
  sheba?: string;
  holder?: string;
  bank?: string;
  creditorName?: string;
  persianDigits?: boolean;
}) {
  const dataUrl = await renderCardToCardImage(input);
  await shareOrDownloadPng(dataUrl);
  return dataUrl;
}
