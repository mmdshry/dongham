import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { bankByCode, detectBankFromCard, listIranBanks } from '@dongham/ledger';
import { BankIcon } from './BankIcon';
import { ConfirmDialog, Modal } from './Dialog';
import { ApiError, api } from '../lib/api';
import { decryptMaybe } from '../lib/crypto';
import { db } from '../lib/db';
import {
  copyText,
  formatCardGrouped,
  formatShebaGrouped,
  iranCardOk,
  normalizeCard,
  normalizeSheba,
  shebaOk,
  toLatinDigits,
  toPersianDigits,
} from '../lib/format';
import { listPayouts, removePayoutMethod, savePayoutMethod } from '../lib/payout';
import { usePersianDigits } from '../lib/usePersianDigits';
import { useUiStore } from '../store/ui';

function bankTitle(name?: string): string {
  const n = (name || '').trim();
  if (!n) return 'بانک';
  return n.startsWith('بانک') ? n : `بانک ${n}`;
}

function CopyableNumber({ label, display, copyValue }: { label: string; display: string; copyValue: string }) {
  const setToast = useUiStore((s) => s.setToast);
  const copy = async () => {
    const ok = await copyText(copyValue);
    setToast(ok ? 'کپی شد' : 'کپی نشد', ok ? 'success' : 'error');
  };
  return (
    <div className="mt-2">
      <p className="text-left text-[11px] text-ink-700/60">{label}</p>
      <div className="flex items-center gap-2" dir="ltr">
        <button
          type="button"
          className="min-w-0 break-all font-mono text-xs tracking-wide text-ink-800"
          dir="ltr"
          onClick={() => void copy()}
        >
          {display}
        </button>
        <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => void copy()}>
          کپی
        </button>
      </div>
    </div>
  );
}

type InquiryDraft = {
  card: string;
  sheba: string;
  accountNumber: string;
  holder: string;
  bankName: string;
  bankCode: string;
  manual: boolean;
};

export function CardPayoutPanel() {
  const setToast = useUiStore((s) => s.setToast);
  const persian = usePersianDigits();
  const profile = useLiveQuery(() => db.profile.get('self'));
  const [payouts, setPayouts] = useState<Awaited<ReturnType<typeof listPayouts>>>([]);
  const [card, setCard] = useState('');
  const [quotaLeft, setQuotaLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<InquiryDraft | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void listPayouts(profile).then(setPayouts);
  }, [profile]);

  useEffect(() => {
    void api<{ remaining: number }>('/payout/sheba-quota')
      .then((q) => setQuotaLeft(q.remaining))
      .catch(() => undefined);
  }, []);

  const cardDigits = normalizeCard(card);
  const cardError =
    cardDigits.length === 0
      ? ''
      : cardDigits.length < 16
        ? 'شماره کارت باید ۱۶ رقم باشد'
        : iranCardOk(card)
          ? ''
          : 'شماره کارت نامعتبر است';
  const binBank = detectBankFromCard(card);

  const closeModal = () => {
    setOpen(false);
    setDraft(null);
  };

  const inquire = async () => {
    if (cardError || !iranCardOk(card)) {
      setToast(cardError || 'شماره کارت نامعتبر است', 'error');
      return;
    }
    if (payouts.some((p) => normalizeCard(p.card) === cardDigits)) {
      setToast('این کارت قبلاً ذخیره شده', 'warn');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{
        iban: string;
        depositNumber: string;
        bankName: string;
        bankCode: string;
        holderName: string;
        remaining: number;
      }>('/payout/card-to-sheba', { method: 'POST', body: JSON.stringify({ cardNumber: cardDigits }) });
      setQuotaLeft(res.remaining);
      setDraft({
        card: cardDigits,
        sheba: res.iban,
        accountNumber: res.depositNumber || '',
        holder: res.holderName || '',
        bankName: res.bankName || binBank?.name || '',
        bankCode: res.bankCode || binBank?.code || '',
        manual: false,
      });
      setOpen(true);
    } catch (e) {
      const remaining =
        e instanceof ApiError && e.data && typeof e.data === 'object' && 'remaining' in e.data
          ? Number((e.data as { remaining?: number }).remaining)
          : undefined;
      if (remaining != null && Number.isFinite(remaining)) setQuotaLeft(remaining);
      setDraft({
        card: cardDigits,
        sheba: '',
        accountNumber: '',
        holder: '',
        bankName: binBank?.name || '',
        bankCode: binBank?.code || '',
        manual: true,
      });
      setToast(e instanceof Error ? e.message : 'استعلام شبا ناموفق بود', 'error');
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!draft) return;
    if (!iranCardOk(draft.card)) {
      setToast('شماره کارت نامعتبر است', 'error');
      return;
    }
    if (!draft.holder.trim()) {
      setToast('نام صاحب حساب لازم است', 'error');
      return;
    }
    if (draft.sheba.trim() && !shebaOk(draft.sheba)) {
      setToast('شبا نامعتبر است', 'error');
      return;
    }
    const res = await savePayoutMethod({
      card: draft.card,
      sheba: draft.sheba,
      holder: draft.holder.trim(),
      bank: draft.bankName,
      accountNumber: draft.accountNumber,
      isDefault: payouts.length === 0,
    });
    if (!res.ok) {
      setToast(res.error || 'ذخیره نشد', 'error');
      return;
    }
    setToast('کارت ذخیره شد', 'success');
    setCard('');
    closeModal();
    setPayouts(await listPayouts());
  };

  const reveal = async () => {
    const def = payouts.find((p) => p.isDefault) || payouts[0];
    if (def) {
      setToast(
        [def.card && `کارت: ${formatCardGrouped(def.card)}`, def.sheba && `شبا: ${formatShebaGrouped(def.sheba)}`]
          .filter(Boolean)
          .join(' · ') || 'چیزی ذخیره نشده',
        'info',
      );
      return;
    }
    const c = await decryptMaybe(profile?.cardNumber);
    const s = await decryptMaybe(profile?.sheba);
    setToast([c && `کارت: ${c}`, s && `شبا: ${s}`].filter(Boolean).join(' · ') || 'چیزی ذخیره نشده', 'info');
  };

  const draftBank = draft ? bankByCode(draft.bankCode) || detectBankFromCard(draft.card) || listIranBanks().find((b) => b.name === draft.bankName) : undefined;

  return (
    <div className="card-surface space-y-3">
      <h2 className="font-bold">کارت و شبا</h2>
      <p className="text-xs text-ink-700/70">شماره کارت را وارد کنید و استعلام بزنید. شبا و حساب در مودال می‌آید (۵ بار در روز).</p>
      {quotaLeft != null ? (
        <p className="text-xs text-brand-800">
          استعلام باقیمانده امروز: {toPersianDigits(quotaLeft, persian)} از ۵
        </p>
      ) : null}

      <ul className="space-y-3">
        {payouts.map((p) => {
          const bank = detectBankFromCard(p.card) || listIranBanks().find((b) => b.name === p.bank);
          return (
            <li key={p.id} className="rounded-2xl bg-surface p-3 shadow-soft ring-1 ring-brand-800/20">
              <div className="flex gap-3">
                <BankIcon bank={bank} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{bankTitle(p.bank || bank?.name)}</p>
                    {p.isDefault ? (
                      <span className="chip-clay">پیش‌فرض</span>
                    ) : null}
                  </div>
                  {p.holder ? <p className="mt-1 text-xs text-ink-700/70">{p.holder}</p> : null}
                  {p.card ? (
                    <CopyableNumber
                      label="شماره کارت"
                      display={formatCardGrouped(p.card)}
                      copyValue={normalizeCard(p.card)}
                    />
                  ) : null}
                  {p.sheba ? (
                    <CopyableNumber
                      label="شماره شبا"
                      display={formatShebaGrouped(p.sheba)}
                      copyValue={normalizeSheba(p.sheba)}
                    />
                  ) : null}
                  {p.accountNumber ? (
                    <CopyableNumber
                      label="شماره حساب"
                      display={p.accountNumber}
                      copyValue={toLatinDigits(p.accountNumber).replace(/\s/g, '')}
                    />
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn-ghost btn-sm shrink-0 text-danger"
                  onClick={() => setDeleteId(p.id)}
                >
                  حذف
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2">
        <BankIcon bank={binBank} size={40} />
        <input
          className="input flex-1"
          placeholder="شماره کارت ۱۶ رقمی"
          dir="ltr"
          inputMode="numeric"
          value={card}
          onChange={(e) => setCard(formatCardGrouped(normalizeCard(e.target.value).slice(0, 16)))}
          onBlur={() => {
            if (cardError) setToast(cardError, 'error');
          }}
        />
      </div>
      {binBank ? <p className="text-xs text-brand-800">بانک {binBank.name}</p> : null}
      {binBank ? <p className="text-xs text-brand-800">بانک {binBank.name}</p> : null}

      <button type="button" className="btn-primary w-full" onClick={() => void inquire()} disabled={busy || !!cardError || !cardDigits}>
        {busy ? 'در حال استعلام…' : 'استعلام کارت'}
      </button>
      <button type="button" className="btn-ghost w-full" onClick={() => void reveal()}>
        نمایش کارت و شبا
      </button>

      <Modal open={open} onClose={closeModal} title={draft?.manual ? 'ورود دستی کارت' : 'نتیجه استعلام'}>
        {draft?.manual ? (
          <p className="mb-3 text-xs text-ink-700/70">استعلام ممکن نشد. مشخصات را دستی وارد کنید.</p>
        ) : null}
        {draft ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-3">
              <BankIcon bank={draftBank} size={48} />
              <p className="font-semibold">{bankTitle(draft.bankName || draftBank?.name)}</p>
            </div>
            {draft.manual ? (
              <>
                <label className="block text-xs text-ink-700/70">
                  شماره کارت
                  <input
                    className="input mt-1"
                    dir="ltr"
                    value={formatCardGrouped(draft.card)}
                    onChange={(e) => setDraft({ ...draft, card: normalizeCard(e.target.value).slice(0, 16) })}
                  />
                </label>
                <label className="block text-xs text-ink-700/70">
                  نام صاحب حساب
                  <input className="input mt-1" value={draft.holder} onChange={(e) => setDraft({ ...draft, holder: e.target.value })} />
                </label>
                <label className="block text-xs text-ink-700/70">
                  شبا (اختیاری)
                  <input
                    className="input mt-1"
                    dir="ltr"
                    value={draft.sheba}
                    onChange={(e) => setDraft({ ...draft, sheba: formatShebaGrouped(normalizeSheba(e.target.value)) })}
                  />
                </label>
                <label className="block text-xs text-ink-700/70">
                  شماره حساب (اختیاری)
                  <input
                    className="input mt-1"
                    dir="ltr"
                    value={draft.accountNumber}
                    onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value })}
                  />
                </label>
              </>
            ) : (
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-ink-700/60">کارت</dt>
                  <dd dir="ltr">{formatCardGrouped(draft.card)}</dd>
                </div>
                {draft.sheba ? (
                  <div>
                    <dt className="text-xs text-ink-700/60">شبا</dt>
                    <dd dir="ltr">{formatShebaGrouped(draft.sheba)}</dd>
                  </div>
                ) : null}
                {draft.accountNumber ? (
                  <div>
                    <dt className="text-xs text-ink-700/60">شماره حساب</dt>
                    <dd dir="ltr">{draft.accountNumber}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs text-ink-700/60">صاحب حساب</dt>
                  <dd>{draft.holder || '—'}</dd>
                </div>
              </dl>
            )}
            {!draft.manual && !draft.holder ? (
              <input
                className="input"
                placeholder="نام صاحب حساب"
                value={draft.holder}
                onChange={(e) => setDraft({ ...draft, holder: e.target.value })}
              />
            ) : null}
            <div className="flex gap-2 pt-2">
              <button type="button" className="btn-ghost flex-1" onClick={closeModal}>
                بستن
              </button>
              <button type="button" className="btn-primary flex-1" onClick={() => void confirm()}>
                تأیید
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={!!deleteId}
        title="حذف کارت"
        message="این کارت و شبا از این دستگاه حذف می‌شود."
        confirmLabel="حذف"
        danger
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          void (async () => {
            if (!deleteId) return;
            await removePayoutMethod(deleteId);
            setPayouts(await listPayouts());
            setDeleteId(null);
            setToast('کارت حذف شد', 'success');
          })();
        }}
      />
    </div>
  );
}
