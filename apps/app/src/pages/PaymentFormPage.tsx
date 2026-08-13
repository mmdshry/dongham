import { useLiveQuery } from 'dexie-react-hooks';
import { nanoid } from 'nanoid';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { IndexAsset } from '@dongham/ledger';
import { MessengerShare } from '../components/MessengerShare';
import { MoneyInput } from '../components/MoneyInput';
import { Shell } from '../components/ui';
import { decryptMaybe } from '../lib/crypto';
import { db } from '../lib/db';
import { copyText, formatMoney, luhnOk, shebaOk } from '../lib/format';
import { fetchFxRates } from '../lib/fx';
import { indexRateFromFx, loanEquivalentNow } from '../lib/goldIndex';
import { defaultPayout } from '../lib/payout';
import { shareCardImage } from '../lib/share';
import { canMarkPaid, canRecordWithoutConfirm } from '../lib/settlementGuard';
import { upsertPayment } from '../lib/sync';
import { compressImage } from '../lib/ocr';
import { useUiStore } from '../store/ui';

export function PaymentFormPage() {
  const { id: periodId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setToast = useUiStore((s) => s.setToast);
  const period = useLiveQuery(() => db.periods.get(periodId), [periodId]);
  const members = useLiveQuery(() => db.members.where('periodId').equals(periodId).toArray(), [periodId]) || [];
  const profile = useLiveQuery(() => db.profile.get('self'));

  const [fromMemberId, setFrom] = useState(params.get('from') || '');
  const [toMemberId, setTo] = useState(params.get('to') || '');
  const [amount, setAmount] = useState(0);
  const [kind, setKind] = useState<'settlement' | 'loan'>(
    (params.get('kind') as 'settlement' | 'loan') || 'settlement',
  );
  const [note, setNote] = useState('');
  const [indexAsset, setIndexAsset] = useState<IndexAsset>('none');
  const [receipt, setReceipt] = useState<string | undefined>();
  const [fx, setFx] = useState<Record<string, number>>({});
  const [payout, setPayout] = useState({ card: '', sheba: '', holder: '', bank: '' });

  useEffect(() => {
    void fetchFxRates().then(setFx);
  }, []);

  useEffect(() => {
    void (async () => {
      const member = members.find((m) => m.id === toMemberId);
      const isSelf =
        !!member &&
        (member.guestKey === profile?.guestKey || (!!profile?.userId && member.userId === profile.userId));
      if (isSelf) {
        const d = await defaultPayout(profile);
        if (d) {
          setPayout({ card: d.card, sheba: d.sheba, holder: d.holder, bank: d.bank });
          return;
        }
      }
      if (member) {
        setPayout({
          card: await decryptMaybe(member.cardNumber),
          sheba: await decryptMaybe(member.sheba),
          holder: member.cardHolderName || '',
          bank: member.bankName || '',
        });
      }
    })();
  }, [toMemberId, members, profile]);

  const me = members.find(
    (m) => m.guestKey === profile?.guestKey || (profile?.userId && m.userId === profile.userId),
  );
  const lockFrom = kind === 'settlement' && me?.role !== 'owner';

  useEffect(() => {
    if (kind === 'settlement' && me?.id && me.role !== 'owner') {
      setFrom(me.id);
    } else if (members.length >= 2 && !fromMemberId) {
      setFrom(members[0].id);
    }
    if (members.length >= 2 && !toMemberId) {
      setTo(members[1].id);
    }
  }, [members, fromMemberId, toMemberId, kind, me?.id, me?.role]);

  const from = members.find((m) => m.id === fromMemberId);
  const to = members.find((m) => m.id === toMemberId);
  const isViewer = me?.role === 'viewer';

  const save = async (status: 'settled' | 'pending_confirm' = 'settled') => {
    if (isViewer) {
      setToast('نقش بیننده اجازهٔ ذخیره ندارد');
      return;
    }
    if (!fromMemberId || !toMemberId || amount <= 0) {
      setToast('فیلدها ناقص است');
      return;
    }
    if (kind === 'settlement') {
      if (status === 'pending_confirm' && !canMarkPaid(me, fromMemberId)) {
        setToast('فقط بدهکار می‌تواند این پرداخت را ثبت کند');
        return;
      }
      if (status === 'settled' && !canRecordWithoutConfirm(me, fromMemberId)) {
        setToast('فقط بدهکار می‌تواند این پرداخت را ثبت کند');
        return;
      }
    }
    const now = new Date().toISOString();
    const rate = indexAsset === 'none' ? undefined : indexRateFromFx(indexAsset, fx);
    await upsertPayment({
      id: nanoid(),
      periodId,
      fromMemberId,
      toMemberId,
      amount: Math.round(amount),
      currency: period?.currency || 'IRT',
      kind,
      note: note || undefined,
      fxRate: 1,
      createdAt: now,
      updatedAt: now,
      version: 1,
      status: kind === 'loan' ? 'settled' : status,
      receiptDataUrl: receipt,
      indexAsset: kind === 'loan' ? indexAsset : 'none',
      indexRateAtCreate: kind === 'loan' ? rate : undefined,
    });
    setToast(kind === 'loan' ? 'قرض ثبت شد' : status === 'pending_confirm' ? 'در انتظار تأیید' : 'پرداخت ثبت شد');
    navigate(`/periods/${periodId}`);
  };

  const copyCard = async () => {
    const card = payout.card;
    const sheba = payout.sheba;
    if (!card && !sheba) {
      setToast('شماره کارت یا شبا را در تنظیمات وارد کنید');
      return;
    }
    if (card && !luhnOk(card)) setToast('شماره کارت نامعتبر است');
    if (sheba && !shebaOk(sheba)) setToast('شبا نامعتبر است');
    const text = [
      card && `کارت: ${card}`,
      sheba && `شبا: ${sheba}`,
      payout.holder && `به نام: ${payout.holder}`,
      payout.bank && `بانک: ${payout.bank}`,
      `مبلغ: ${formatMoney(amount, period?.currency || 'IRT', profile?.usePersianDigits ?? true)}`,
    ]
      .filter(Boolean)
      .join('\n');
    await copyText(text);
    setToast('مبلغ و مشخصات تسویه کپی شد');
  };

  const eq =
    kind === 'loan' && indexAsset !== 'none'
      ? loanEquivalentNow(amount, indexAsset, indexRateFromFx(indexAsset, fx), fx)
      : null;

  return (
    <Shell title={kind === 'loan' ? 'قرض جدید' : 'پرداخت / تسویه'} back={() => navigate(`/periods/${periodId}`)}>
      <div className="mx-auto grid max-w-lg gap-4 animate-rise pb-4">
        <div className="card-surface space-y-3">
        <div className="flex gap-2">
          <button
            type="button"
            className={`chip flex-1 ${kind === 'settlement' ? 'bg-brand-700 text-white' : 'bg-brand-50'}`}
            onClick={() => setKind('settlement')}
          >
            تسویه
          </button>
          <button
            type="button"
            className={`chip flex-1 ${kind === 'loan' ? 'bg-brand-700 text-white' : 'bg-brand-50'}`}
            onClick={() => setKind('loan')}
          >
            قرض
          </button>
        </div>
        <div>
          <label className="label">از</label>
          <select
            className="input"
            value={fromMemberId}
            disabled={lockFrom}
            onChange={(e) => setFrom(e.target.value)}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">به</label>
          <select className="input" value={toMemberId} onChange={(e) => setTo(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </div>
        <MoneyInput label="مبلغ" value={amount} onChange={setAmount} />
        {kind === 'loan' ? (
          <div>
            <label className="label">شاخص تورم (اختیاری)</label>
            <select className="input" value={indexAsset} onChange={(e) => setIndexAsset(e.target.value as IndexAsset)}>
              <option value="none">بدون شاخص (تومان)</option>
              <option value="gold">معادل طلا (گرم ۱۸ عیار)</option>
              <option value="usd">معادل دلار</option>
            </select>
            {eq != null ? (
              <p className="mt-1 text-xs text-ink-700/70">معادل امروز با نرخ فعلی همین مبلغ است تا نرخ عوض شود.</p>
            ) : null}
          </div>
        ) : (
          <label className="btn-ghost w-full cursor-pointer text-center">
            عکس فیش کارت‌به‌کارت
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setReceipt(await compressImage(file));
                setToast('فیش پیوست شد');
              }}
            />
          </label>
        )}
        <div>
          <label className="label">یادداشت</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        </div>
        <div className="card-surface space-y-3">
        <button type="button" className="btn-ghost w-full" onClick={() => void copyCard()}>
          کپی مبلغ + کارت/شبا
        </button>
        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() =>
            void shareCardImage({
              amountLabel: formatMoney(amount, period?.currency || 'IRT', profile?.usePersianDigits ?? true),
              card: payout.card,
              sheba: payout.sheba,
              holder: payout.holder,
              bank: payout.bank,
              creditorName: to?.displayName,
              persianDigits: profile?.usePersianDigits ?? true,
            })
          }
        >
          تصویر کارت‌به‌کارت
        </button>
        <MessengerShare
          phone={from?.phone}
          debtorName={from?.displayName || ''}
          creditorName={to?.displayName || ''}
          amountLabel={formatMoney(amount, period?.currency || 'IRT', profile?.usePersianDigits ?? true)}
          holder={payout.holder}
          bank={payout.bank}
          card={payout.card}
          sheba={payout.sheba}
        />
        <button
          type="button"
          className="btn-primary w-full"
          onClick={() => void save('settled')}
          disabled={isViewer || (kind === 'settlement' && !canRecordWithoutConfirm(me, fromMemberId))}
        >
          ذخیره
        </button>
        {kind === 'settlement' ? (
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => void save('pending_confirm')}
            disabled={isViewer || !canMarkPaid(me, fromMemberId)}
          >
            پرداختم — منتظر تأیید
          </button>
        ) : null}
        </div>
      </div>
    </Shell>
  );
}
