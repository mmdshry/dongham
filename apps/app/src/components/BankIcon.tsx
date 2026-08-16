import type { IranBank } from '@dongham/ledger';
import { bankIconUrl } from '../lib/bankIcons';

export function BankIcon({
  bank,
  className = '',
  size = 28,
}: {
  bank?: Pick<IranBank, 'code' | 'name' | 'color'> | null;
  className?: string;
  size?: number;
}) {
  if (!bank) return null;
  const src = bankIconUrl(bank.code);
  if (src) {
    return (
      <img
        src={src}
        alt={bank.name}
        width={size}
        height={size}
        className={`shrink-0 rounded-2xl bg-white object-contain ring-1 ring-black/10 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white ${className}`}
      style={{ background: bank.color, width: size, height: size }}
      aria-hidden
    >
      {bank.name.slice(0, 1)}
    </span>
  );
}
