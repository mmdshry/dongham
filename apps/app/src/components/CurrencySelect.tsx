import { currencyLabel, PERIOD_CURRENCY_CODES } from '../lib/currencies';

export function CurrencySelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (code: string) => void;
}) {
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {PERIOD_CURRENCY_CODES.map((code) => (
        <option key={code} value={code}>
          {currencyLabel(code)}
        </option>
      ))}
    </select>
  );
}
