import { useEffect, useMemo, useState } from 'react';
import type { PeriodKind, PeriodTemplate, RoundTo } from '@dongham/ledger';
import { ConfirmDialog } from './Dialog';
import { CurrencySelect } from './CurrencySelect';
import { PeriodMediaPicker } from './PeriodMediaPicker';
import type { LocalMember, LocalPeriod } from '../lib/db';
import { fetchFxRates, type FxRates } from '../lib/fx';
import { updatePeriodSettings } from '../lib/periodSettings';
import { savePeriodMedia } from '../lib/sync';
import { KIND_OPTIONS, roundOptionsFor, TEMPLATES } from '../lib/templates';
import { usePersianDigits } from '../lib/usePersianDigits';
import { useUiStore } from '../store/ui';

export function PeriodSettingsCard({
  period,
  members,
  hasMoney,
}: {
  period: LocalPeriod;
  members: LocalMember[];
  hasMoney: boolean;
}) {
  const setToast = useUiStore((s) => s.setToast);
  const persian = usePersianDigits();
  const [fxRates, setFxRates] = useState<FxRates>({});
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const people = useMemo(() => members.filter((m) => !m.isPot), [members]);

  useEffect(() => {
    void fetchFxRates().then(setFxRates);
  }, []);

  const apply = async (patch: Parameters<typeof updatePeriodSettings>[1]) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await updatePeriodSettings(period.id, patch);
      if (!res.ok) {
        setToast(res.error, 'error');
        return;
      }
      setToast('تنظیمات دوره ذخیره شد', 'success');
    } finally {
      setSaving(false);
    }
  };

  const onCurrency = (code: string) => {
    if (saving || code === period.currency) return;
    if (hasMoney) setPendingCurrency(code);
    else void apply({ currency: code });
  };

  return (
    <div className="card-surface space-y-3">
      <h3 className="font-bold">تنظیمات دوره</h3>
      <div>
        <label className="label" htmlFor="period-settings-template">
          قالب
        </label>
        <select
          id="period-settings-template"
          className="input"
          value={period.template}
          disabled={saving}
          onChange={(e) => void apply({ template: e.target.value as PeriodTemplate })}
        >
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <PeriodMediaPicker
        value={{
          coverPreset: period.coverPreset,
          coverDataUrl: period.coverDataUrl,
        }}
        onChange={(next) => void savePeriodMedia(period.id, next)}
      />
      <div>
        <label className="label" htmlFor="period-settings-kind">
          نوع حساب
        </label>
        <select
          id="period-settings-kind"
          className="input"
          value={period.kind}
          disabled={saving}
          onChange={(e) => void apply({ kind: e.target.value as PeriodKind })}
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      {period.kind === 'banker' ? (
        <div>
          <label className="label" htmlFor="period-settings-banker">
            گنجه‌بان
          </label>
          <select
            id="period-settings-banker"
            className="input"
            value={period.bankerMemberId || people[0]?.id || ''}
            disabled={saving || !people.length}
            onChange={(e) => void apply({ bankerMemberId: e.target.value })}
          >
            {people.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div>
        <label className="label" htmlFor="period-settings-round">
          گرد کردن تسویه
        </label>
        <select
          id="period-settings-round"
          className="input"
          value={period.roundTo}
          disabled={saving}
          onChange={(e) => void apply({ roundTo: Number(e.target.value) as RoundTo })}
        >
          {roundOptionsFor(period.currency, persian).map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="period-settings-currency">
          ارز پایه
        </label>
        <CurrencySelect
          id="period-settings-currency"
          value={period.currency}
          onChange={onCurrency}
          rates={fxRates}
        />
      </div>
      <ConfirmDialog
        open={pendingCurrency !== null}
        title="تغییر ارز پایه"
        message="مبلغ‌های ثبت‌شده ثابت می‌مانند و فقط نرخ تبدیل به ارز جدید به‌روز می‌شود."
        confirmLabel="تغییر ارز"
        onClose={() => setPendingCurrency(null)}
        onConfirm={() => {
          const code = pendingCurrency;
          setPendingCurrency(null);
          if (code) void apply({ currency: code });
        }}
      />
    </div>
  );
}
