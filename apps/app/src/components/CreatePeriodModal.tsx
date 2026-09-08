import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PeriodKind, PeriodTemplate, PeriodVisibility, RoundTo } from '@dongham/ledger';
import { Modal } from './Dialog';
import { CurrencySelect } from './CurrencySelect';
import { MemberPicker } from './MemberPicker';
import { db } from '../lib/db';
import { fetchFxRates, type FxRates } from '../lib/fx';
import { KIND_OPTIONS, TEMPLATES, roundOptionsFor, templateById } from '../lib/templates';
import { createPeriodLocal } from '../lib/sync';
import type { MemberPick } from '../lib/memberPick';
import { presetFromTemplate } from '../lib/periodCover';
import { PeriodMediaPicker, type PeriodMediaValue } from './PeriodMediaPicker';
import { useUiStore } from '../store/ui';

export function CreatePeriodModal() {
  const navigate = useNavigate();
  const sheet = useUiStore((s) => s.sheet);
  const closeSheet = useUiStore((s) => s.closeSheet);
  const setToast = useUiStore((s) => s.setToast);
  const profile = useLiveQuery(() => db.profile.get('self'));
  const [title, setTitle] = useState('');
  const [memberPicks, setMemberPicks] = useState<MemberPick[]>([]);
  const [currency, setCurrency] = useState('IRT');
  const [template, setTemplate] = useState<PeriodTemplate>('custom');
  const [kind, setKind] = useState<PeriodKind>('split');
  const [roundTo, setRoundTo] = useState<RoundTo>(0);
  const [visibility, setVisibility] = useState<PeriodVisibility>('private');
  const [media, setMedia] = useState<PeriodMediaValue>({
    coverPreset: 'empty',
  });
  const [fxRates, setFxRates] = useState<FxRates>({});
  const open = sheet === 'create';

  useEffect(() => {
    if (open) void fetchFxRates().then(setFxRates);
  }, [open]);

  const reset = () => {
    setTitle('');
    setMemberPicks([]);
    setCurrency('IRT');
    setTemplate('custom');
    setKind('split');
    setRoundTo(0);
    setVisibility('private');
    setMedia({ coverPreset: 'empty' });
  };

  const create = async () => {
    if (!title.trim()) return;
    const id = await createPeriodLocal({
      title: title.trim(),
      currency,
      memberPicks: memberPicks.filter((p) =>
        p.kind === 'user' ? p.userId !== profile?.userId : p.displayName !== profile?.displayName,
      ),
      template,
      kind,
      roundTo,
      visibility,
      coverPreset: media.coverPreset,
      coverDataUrl: media.coverDataUrl,
    });
    setToast('دوره ساخته شد', 'success');
    closeSheet();
    reset();
    navigate(`/periods/${id}`);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        closeSheet();
        reset();
      }}
      title="دوره جدید"
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="period-title">
            عنوان
          </label>
          <input
            id="period-title"
            data-autofocus
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثل سفر شمال ۱۴۰۵"
          />
        </div>
        <div>
          <label className="label" htmlFor="period-template">
            قالب
          </label>
          <select
            id="period-template"
            className="input"
            value={template}
            onChange={(e) => {
              const t = e.target.value as PeriodTemplate;
              setTemplate(t);
              const tpl = templateById(t);
              if (tpl.defaultKind) setKind(tpl.defaultKind);
              if (tpl.defaultCurrency) setCurrency(tpl.defaultCurrency);
              const preset = presetFromTemplate(t);
              setMedia((prev) => ({
                coverPreset: prev.coverDataUrl ? prev.coverPreset : preset,
                coverDataUrl: prev.coverDataUrl,
              }));
            }}
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <PeriodMediaPicker value={media} onChange={setMedia} />
        <div>
          <label className="label" htmlFor="period-kind">
            نوع حساب
          </label>
          <select id="period-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as PeriodKind)}>
            {KIND_OPTIONS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="period-round">
            گرد کردن تسویه
          </label>
          <select
            id="period-round"
            className="input"
            value={roundTo}
            onChange={(e) => setRoundTo(Number(e.target.value) as RoundTo)}
          >
            {roundOptionsFor(currency, profile?.usePersianDigits !== false).map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="period-currency">
            ارز پایه
          </label>
          <CurrencySelect id="period-currency" value={currency} onChange={setCurrency} rates={fxRates} />
        </div>
        <MemberPicker
          selected={memberPicks}
          onChange={setMemberPicks}
          excludeNames={profile?.displayName ? [profile.displayName] : []}
          excludeUserIds={profile?.userId ? [profile.userId] : []}
          draftInputId="period-member-new"
        />
        <label className="flex items-center justify-between gap-2 text-sm">
          <span>عمومی (با شناسه قابل مشاهده)</span>
          <input
            type="checkbox"
            checked={visibility === 'public'}
            onChange={(e) => setVisibility(e.target.checked ? 'public' : 'private')}
          />
        </label>
      </div>
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          className="btn-ghost flex-1"
          onClick={() => {
            closeSheet();
            reset();
          }}
        >
          انصراف
        </button>
        <button type="button" className="btn-primary flex-1" onClick={() => void create()}>
          ساخت
        </button>
      </div>
    </Modal>
  );
}
