import { buildSettlementText, canShareToMessenger, messengerUrls, openMessenger, shareCardImage } from '../lib/share';
import { copyText } from '../lib/format';

export function MessengerShare({
  phone,
  debtorName,
  creditorName,
  amountLabel,
  card,
  sheba,
  holder,
  bank,
  customText,
}: {
  phone?: string;
  debtorName: string;
  creditorName: string;
  amountLabel: string;
  card?: string;
  sheba?: string;
  holder?: string;
  bank?: string;
  customText?: string;
}) {
  const enabled = canShareToMessenger(phone);
  const text =
    customText ||
    buildSettlementText({
      debtorName,
      creditorName,
      amountLabel,
      card,
      sheba,
      holder,
      bank,
      debtorPhone: phone,
    });
  const urls = phone && enabled ? messengerUrls(phone, text) : null;

  const openChat = async (which: 'whatsapp' | 'bale') => {
    if (!urls) return;
    if (which !== 'whatsapp') await copyText(text);
    openMessenger(urls[which]);
  };

  return (
    <div className="space-y-2">
      {!enabled ? (
        <p className="text-xs text-ink-700/70">شماره موبایل این عضو ثبت نشده — دکمه‌های پیام‌رسان غیرفعال است.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost"
          disabled={!enabled}
          data-wa={urls?.whatsapp || ''}
          onClick={() => void openChat('whatsapp')}
        >
          واتساپ
        </button>
        <button type="button" className="btn-ghost" disabled={!enabled} onClick={() => void openChat('bale')}>
          بله
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            void shareCardImage({
              amountLabel,
              card,
              sheba,
              holder,
              bank,
              creditorName,
            })
          }
        >
          تصویر کارت
        </button>
      </div>
    </div>
  );
}
