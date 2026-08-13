import { formatGrouped, parseMoneyInput } from '../lib/format';
import { usePersianDigits } from '../lib/usePersianDigits';

export function MoneyInput({
  id,
  value,
  onChange,
  persian,
  label,
}: {
  id?: string;
  value: number;
  onChange: (n: number) => void;
  persian?: boolean;
  label?: string;
}) {
  const fromProfile = usePersianDigits();
  const useFa = persian ?? fromProfile;
  return (
    <div>
      {label ? (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <input
        id={id}
        className="input"
        inputMode="numeric"
        dir="ltr"
        value={value ? formatGrouped(value, useFa) : ''}
        onChange={(e) => onChange(parseMoneyInput(e.target.value))}
        aria-label={label || 'مبلغ'}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={() => onChange(value * 1000 || 1000)}>
          هزار
        </button>
        <button type="button" className="btn-ghost" onClick={() => onChange(value * 1_000_000 || 1_000_000)}>
          میلیون
        </button>
      </div>
    </div>
  );
}
