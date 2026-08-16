import { api } from './api';
import { db } from './db';

const FX_META = 'fxRates';
const FX_MANUAL_META = 'fxManualRates';
const FX_WATCH_META = 'fxWatchlist';

export type FxRates = Record<string, number>;

export type FxSnapshot = {
  rates: FxRates;
  source: string;
  fetchedAt: string;
  missing: string[];
};

function missingOf(rates: FxRates, needed: string[] = []): string[] {
  return needed.filter((code) => !rates[code] || rates[code] <= 0);
}

export function parseWatchlist(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const code = item.trim().toUpperCase();
      if (!code || code === 'IRT' || seen.has(code)) continue;
      seen.add(code);
      out.push(code);
    }
    return out;
  } catch {
    return [];
  }
}

export async function loadFxWatchlist(): Promise<string[]> {
  const row = await db.meta.get(FX_WATCH_META);
  return parseWatchlist(row?.value);
}

export async function saveFxWatchlist(codes: string[]): Promise<void> {
  await db.meta.put({ key: FX_WATCH_META, value: JSON.stringify(parseWatchlist(JSON.stringify(codes))) });
}

function parseRates(raw: string | undefined): FxRates {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as FxRates;
    const out: FxRates = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && v > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function loadManualRates(): Promise<FxRates> {
  const row = await db.meta.get(FX_MANUAL_META);
  return parseRates(row?.value);
}

export async function saveManualRates(rates: FxRates): Promise<void> {
  await db.meta.put({ key: FX_MANUAL_META, value: JSON.stringify(rates) });
}

export async function loadCachedFx(): Promise<FxRates> {
  const row = await db.meta.get(FX_META);
  return parseRates(row?.value);
}

function mergeRates(live: FxRates, manual: FxRates, cached: FxRates): FxRates {
  const out: FxRates = {};
  for (const [k, v] of Object.entries(cached)) {
    if (v > 0) out[k] = v;
  }
  for (const [k, v] of Object.entries(manual)) {
    if (v > 0) out[k] = v;
  }
  for (const [k, v] of Object.entries(live)) {
    if (v > 0) out[k] = v;
  }
  return out;
}

export async function fetchFxSnapshot(): Promise<FxSnapshot> {
  const manual = await loadManualRates();
  const cached = await loadCachedFx();
  try {
    const res = await api<FxSnapshot>(`/fx`);
    const live = res.rates || {};
    const rates = mergeRates(live, manual, cached);
    await db.meta.put({ key: FX_META, value: JSON.stringify(rates) });
    const watch = await loadFxWatchlist();
    const missing = missingOf(rates, watch);
    const source = missing.length && Object.keys(manual).length ? `${res.source || 'none'}+manual` : res.source || 'none';
    return {
      rates,
      source: Object.keys(live).length ? source : Object.keys(manual).length ? 'manual' : res.source || 'none',
      fetchedAt: res.fetchedAt || new Date().toISOString(),
      missing,
    };
  } catch {
    const rates = mergeRates({}, manual, cached);
    return {
      rates,
      source: Object.keys(manual).length ? 'manual' : Object.keys(cached).length ? 'offline' : 'none',
      fetchedAt: new Date().toISOString(),
      missing: missingOf(rates, await loadFxWatchlist()),
    };
  }
}

export async function fetchFxRates(): Promise<FxRates> {
  return (await fetchFxSnapshot()).rates;
}

export function startFxLoop() {
  let last = 0;
  const tick = () => {
    last = Date.now();
    void fetchFxSnapshot();
  };
  tick();
  const id = window.setInterval(tick, 60_000);
  const onVis = () => {
    if (document.visibilityState === 'visible' && Date.now() - last > 60_000) tick();
  };
  document.addEventListener('visibilitychange', onVis);
  return () => {
    window.clearInterval(id);
    document.removeEventListener('visibilitychange', onVis);
  };
}

/** Rate to convert `from` into period currency (IRT/IRR). Rates are تومان per 1 unit. 0 if unknown. */
export function rateToPeriod(rates: FxRates, from: string, periodCurrency: string): number {
  if (from === periodCurrency) return 1;
  const tomanPerFrom = from === 'IRT' ? 1 : from === 'IRR' ? 0.1 : rates[from];
  if (!tomanPerFrom) return 0;
  if (periodCurrency === 'IRT') return tomanPerFrom;
  if (periodCurrency === 'IRR') return tomanPerFrom * 10;
  const tomanPerPeriod = rates[periodCurrency];
  if (!tomanPerPeriod) return 0;
  return tomanPerFrom / tomanPerPeriod;
}
