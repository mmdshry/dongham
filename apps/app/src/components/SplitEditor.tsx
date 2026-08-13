import { useMemo, useState } from 'react';
import { validateShares, type SplitMode } from '@dongham/ledger';
import type { LocalMember } from '../lib/db';
import {
  formatGrouped,
  formatWeightInput,
  isAllowedWeightDraft,
  parseMoneyInput,
  parseWeightInput,
  toPersianDigits,
} from '../lib/format';
import { usePersianDigits } from '../lib/usePersianDigits';

export interface ShareDraft {
  memberId: string;
  value: number;
  excluded?: boolean;
}

export function SplitEditor({
  mode,
  onModeChange,
  members,
  shares,
  onChange,
  totalAmount,
}: {
  mode: SplitMode;
  onModeChange: (m: SplitMode) => void;
  members: LocalMember[];
  shares: ShareDraft[];
  onChange: (shares: ShareDraft[]) => void;
  totalAmount: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const persian = usePersianDigits();

  const modes: { id: SplitMode; label: string }[] = [
    { id: 'equal', label: 'مساوی' },
    { id: 'weight', label: 'ضریب' },
    { id: 'exact', label: 'مبلغ ثابت' },
    { id: 'percent', label: 'درصد' },
  ];

  const validation = useMemo(() => {
    if (mode === 'equal') return { ok: true as const };
    return validateShares(mode, totalAmount, shares);
  }, [mode, shares, totalAmount]);

  const update = (memberId: string, patch: Partial<ShareDraft>) => {
    const next = shares.map((s) => (s.memberId === memberId ? { ...s, ...patch } : s));
    onChange(next);
    setError(null);
  };

  const setMode = (next: SplitMode) => {
    setDrafts({});
    onModeChange(next);
  };

  return (
    <div className="space-y-3" aria-label="ویرایشگر تقسیم هزینه">
      <div className="flex flex-wrap gap-2">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`chip ${
              mode === m.id ? 'bg-brand-700 text-white' : 'bg-white/80 text-ink-700 ring-1 ring-brand-700/10'
            }`}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {members.map((m) => {
          const share = shares.find((s) => s.memberId === m.id) || {
            memberId: m.id,
            value: mode === 'percent' ? Math.round(100 / members.length) : 1,
          };
          const shareText =
            drafts[m.id] !== undefined
              ? drafts[m.id]
              : mode === 'weight'
                ? formatWeightInput(share.value, persian)
                : mode === 'exact'
                  ? share.value
                    ? formatGrouped(share.value, persian)
                    : ''
                  : toPersianDigits(share.value, persian);
          return (
            <li key={m.id} className="flex items-center gap-2 rounded-2xl bg-white/70 p-3 ring-1 ring-brand-700/10">
              <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0"
                  checked={!share.excluded}
                  onChange={(e) => update(m.id, { excluded: !e.target.checked })}
                  aria-label={`شامل ${m.displayName}`}
                />
                <span className="truncate">{m.displayName}</span>
              </label>
              {mode !== 'equal' && !share.excluded ? (
                <input
                  className="input !w-24 shrink-0 !py-2 text-start sm:!w-28"
                  dir="ltr"
                  inputMode="decimal"
                  aria-label={`مقدار سهم ${m.displayName}`}
                  value={shareText}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (mode === 'weight') {
                      if (!isAllowedWeightDraft(raw)) return;
                      setDrafts((d) => ({ ...d, [m.id]: raw }));
                      update(m.id, { value: parseWeightInput(raw) });
                      return;
                    }
                    setDrafts((d) => ({ ...d, [m.id]: raw }));
                    update(m.id, { value: parseMoneyInput(raw) });
                  }}
                  onBlur={(e) => {
                    const parsed = mode === 'weight' ? parseWeightInput(e.target.value) : parseMoneyInput(e.target.value);
                    setDrafts((d) => {
                      const next = { ...d };
                      delete next[m.id];
                      return next;
                    });
                    update(m.id, { value: parsed });
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {!validation.ok ? (
        <p className="text-xs text-red-700" role="alert">
          {validation.error}
          {error ? ` — ${error}` : ''}
        </p>
      ) : (
        <p className="text-xs text-brand-800">جمع سهم‌ها معتبر است</p>
      )}
    </div>
  );
}
