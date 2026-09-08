import { detectBank, formatCardGrouped, formatShebaGrouped } from '@dongham/ledger';
import { formatMoney, toPersianDigits } from './format';

export async function renderCardToCardImage(input: {
  amountLabel: string;
  card?: string;
  sheba?: string;
  holder?: string;
  bank?: string;
  creditorName?: string;
  persianDigits?: boolean;
}): Promise<string> {
  const bank =
    input.bank || detectBank(input.card, input.sheba)?.name || '';
  const color = detectBank(input.card, input.sheba)?.color || '#5E7262';
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 540;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 900, 540);
  g.addColorStop(0, color);
  g.addColorStop(1, '#2A3E34');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 900, 540);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.arc(120, 80, 180, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFFAF5';
  ctx.font = 'bold 28px Vazirmatn, Tahoma, sans-serif';
  ctx.fillText('کارت‌به‌کارت', 860, 60);
  ctx.font = '20px Vazirmatn, Tahoma, sans-serif';
  ctx.fillText(bank ? `بانک ${bank}` : 'دونگ‌هام', 860, 96);

  ctx.font = 'bold 36px Vazirmatn, Tahoma, sans-serif';
  ctx.fillText(input.amountLabel, 860, 170);

  ctx.font = '28px Vazirmatn, Tahoma, sans-serif';
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  if (input.card) {
    const grouped = formatCardGrouped(input.card);
    ctx.fillText(input.persianDigits ? toPersianDigits(grouped) : grouped, 40, 280);
  }
  if (input.sheba) {
    ctx.font = '20px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText(formatShebaGrouped(input.sheba), 40, 330);
  }

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.font = '22px Vazirmatn, Tahoma, sans-serif';
  ctx.fillText(input.holder || input.creditorName || '', 860, 420);
  ctx.font = '16px Vazirmatn, Tahoma, sans-serif';
  ctx.fillStyle = 'rgba(236,253,245,0.8)';
  ctx.fillText('دونگ‌هام', 860, 500);
  return canvas.toDataURL('image/png');
}

export async function shareOrDownloadPng(dataUrl: string, filename = 'dongham-card.png') {
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & {
    canShare?: (d: { files?: File[] }) => boolean;
    share?: (d: ShareData) => Promise<void>;
  };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: 'کارت‌به‌کارت دونگ‌هام' });
    return;
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
