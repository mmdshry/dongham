import { indexedAmountNow } from '@dongham/ledger';
import type { IndexAsset } from './db';
import type { FxRates } from './fx';

export function indexRateFromFx(asset: IndexAsset, rates: FxRates): number {
  if (asset === 'gold') return rates.XAU || 0;
  if (asset === 'usd') return rates.USD || 0;
  return 0;
}

export function loanEquivalentNow(
  amount: number,
  asset: IndexAsset | undefined,
  rateThen: number | undefined,
  rates: FxRates,
): number | null {
  if (!asset || asset === 'none' || !rateThen) return null;
  const now = indexRateFromFx(asset, rates);
  if (!now) return null;
  return indexedAmountNow(amount, rateThen, now);
}
