import type { FxCacheRecord } from './types.js';
import { getDb, mutate } from './db.js';

const NEEDED = ['USD', 'EUR', 'TRY', 'AED', 'IQD', 'XAU'] as const;
const HOUR_MS = 60 * 60 * 1000;
const NOBITEX_STATS = 'https://api.nobitex.ir/market/stats';
const FETCH_MS = 2500;

function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_MS) });
}

export function missingFxCodes(rates: Record<string, number>): string[] {
  return NEEDED.filter((k) => !rates[k] || rates[k] <= 0);
}

function toTomanUsdLike(raw: number): number {
  if (raw > 5_000_000) return Math.round(raw / 10);
  return Math.round(raw);
}

function pickStat(
  stats: Record<string, { latest?: string | number; bestSell?: string | number }>,
  keys: string[],
): number {
  for (const key of keys) {
    const row = stats[key] || stats[key.toLowerCase()] || stats[key.toUpperCase()];
    const n = Number(row?.latest ?? row?.bestSell ?? 0);
    if (n > 0) return n;
  }
  return 0;
}

export function parseNobitexStats(json: unknown): Record<string, number> {
  const root = json as { stats?: Record<string, { latest?: string | number; bestSell?: string | number }> };
  const stats = root.stats || {};
  const rates: Record<string, number> = {};
  const usd = pickStat(stats, ['usdt-rls', 'usdtirt', 'usd-rls', 'USDTIRT']);
  if (usd) rates.USD = toTomanUsdLike(usd);
  const eur = pickStat(stats, ['eur-rls', 'eurirt', 'EURIRT']);
  if (eur) rates.EUR = toTomanUsdLike(eur);
  const tryLira = pickStat(stats, ['try-rls', 'tryirt', 'TRYIRT']);
  if (tryLira) rates.TRY = toTomanUsdLike(tryLira);
  const aed = pickStat(stats, ['aed-rls', 'aedirt', 'AEDIRT']);
  if (aed) rates.AED = toTomanUsdLike(aed);
  const iqd = pickStat(stats, ['iqd-rls', 'iqdirt', 'IQDIRT']);
  if (iqd) rates.IQD = toTomanUsdLike(iqd);
  return rates;
}

export async function getFxRates(): Promise<{
  rates: Record<string, number>;
  source: string;
  fetchedAt: string;
  missing: string[];
}> {
  const cached = getDb().fxCache;
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < HOUR_MS) {
    return {
      rates: cached.rates,
      source: 'cache',
      fetchedAt: cached.fetchedAt,
      missing: missingFxCodes(cached.rates),
    };
  }

  const live = await fetchLiveRates();
  if (live && Object.keys(live.rates).length) {
    const fetchedAt = new Date().toISOString();
    mutate((db) => {
      db.fxCache = { rates: live.rates, fetchedAt, source: live.source } satisfies FxCacheRecord;
    });
    return { rates: live.rates, source: live.source, fetchedAt, missing: missingFxCodes(live.rates) };
  }

  if (cached) {
    return {
      rates: cached.rates,
      source: 'stale',
      fetchedAt: cached.fetchedAt,
      missing: missingFxCodes(cached.rates),
    };
  }

  const fetchedAt = new Date().toISOString();
  return { rates: {}, source: 'none', fetchedAt, missing: [...NEEDED] };
}

async function fetchLiveRates(): Promise<{ rates: Record<string, number>; source: string } | null> {
  const url = process.env.FX_PROVIDER_URL;
  if (url) {
    try {
      const res = await fetchWithTimeout(url);
      if (res.ok) {
        const json = (await res.json()) as { rates?: Record<string, number> } & Record<string, number>;
        const rates = json.rates || json;
        const cleaned: Record<string, number> = {};
        for (const [k, v] of Object.entries(rates)) {
          if (typeof v === 'number' && v > 0) cleaned[k] = v;
        }
        if (Object.keys(cleaned).length) return { rates: cleaned, source: 'provider' };
      }
    } catch {
      /* next */
    }
  }

  let rates: Record<string, number> = {};
  let source = '';

  const nobitex = await fetchNobitex();
  if (nobitex && Object.keys(nobitex).length) {
    rates = { ...nobitex };
    source = 'nobitex';
  }

  const missing = missingFxCodes(rates);
  if (missing.length) {
    const navasan = await fetchNavasan(missing);
    if (navasan && Object.keys(navasan).length) {
      rates = { ...rates, ...navasan };
      source = source ? 'nobitex+navasan' : 'navasan';
    }
  }

  if (!Object.keys(rates).length) return null;
  return { rates, source: source || 'nobitex' };
}

async function fetchNobitex(): Promise<Record<string, number> | null> {
  const headers = { Accept: 'application/json', 'User-Agent': 'Dongham/1.0' };
  try {
    let res = await fetchWithTimeout(NOBITEX_STATS, { headers });
    if (!res.ok) {
      res = await fetchWithTimeout(NOBITEX_STATS, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}',
      });
    }
    if (!res.ok) return null;
    return parseNobitexStats(await res.json());
  } catch {
    return null;
  }
}

async function fetchNavasan(only: string[]): Promise<Record<string, number> | null> {
  const navasan = process.env.NAVASAN_API_KEY;
  if (!navasan) return null;
  try {
    const res = await fetchWithTimeout(`https://api.navasan.tech/latest/?api_key=${encodeURIComponent(navasan)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, { value?: string | number }>;
    const num = (k: string) => Number(json[k]?.value || 0);
    const mapped: Record<string, number> = {};
    const usd = num('usd');
    const eur = num('eur');
    const tryLira = num('try');
    const aed = num('aed');
    const xau = num('18ayar') || num('gold_18');
    if (only.includes('USD') && usd) mapped.USD = usd;
    if (only.includes('EUR') && eur) mapped.EUR = eur;
    if (only.includes('TRY') && tryLira) mapped.TRY = tryLira;
    if (only.includes('AED') && aed) mapped.AED = aed;
    if (only.includes('XAU') && xau) mapped.XAU = xau;
    return mapped;
  } catch {
    return null;
  }
}
