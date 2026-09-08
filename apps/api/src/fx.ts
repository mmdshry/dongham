import { rateToPeriod } from '@dongham/ledger';
import type { FxCacheRecord } from './types.js';
import { getFxCache, setFxCache } from './repo.js';

const NEEDED = ['USD', 'EUR', 'TRY', 'AED', 'IQD', 'XAU'] as const;
const CACHE_MS = 60_000;
const NOBITEX_STATS = 'https://api.nobitex.ir/market/stats';
const FETCH_MS = 8000;
const NAVASAN_HOME = 'https://www.navasan.net/';
const NAVASAN_LAST = 'https://www.navasan.net/last_currencies.php';

function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_MS) });
}

export function missingFxCodes(rates: Record<string, number>): string[] {
  return NEEDED.filter((k) => !rates[k] || rates[k] <= 0);
}

/** Recurring rules normally share the period currency (rate 1); otherwise convert with the cached FX table. */
export async function recurringFxRate(ruleCurrency: string, periodCurrency?: string): Promise<number> {
  if (!periodCurrency || ruleCurrency === periodCurrency) return 1;
  const fixed = rateToPeriod({}, ruleCurrency, periodCurrency);
  if (fixed) return fixed;
  const { rates } = await getFxRates();
  return rateToPeriod(rates, ruleCurrency, periodCurrency) || 1;
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

export async function getFxRates(opts?: { force?: boolean }): Promise<{
  rates: Record<string, number>;
  source: string;
  fetchedAt: string;
  missing: string[];
}> {
  const cached = await getFxCache();
  if (!opts?.force && cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_MS) {
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
    await setFxCache({ rates: live.rates, fetchedAt, source: live.source } satisfies FxCacheRecord);
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

  const web = await fetchNavasanLastCurrencies();
  if (web && Object.keys(web).length) {
    return { rates: web, source: 'navasan-web' };
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

export function parseNavasanLastCurrencies(json: unknown): Record<string, number> {
  if (!json || typeof json !== 'object') return {};
  const rates: Record<string, number> = {};
  for (const [key, raw] of Object.entries(json as Record<string, { value?: string | number } | number>)) {
    const value = typeof raw === 'number' ? raw : Number(raw?.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    rates[key.toUpperCase()] = value;
  }
  return rates;
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1] || null;
}

function extractCsrf(html: string, sessionId?: string): string | null {
  const patterns = [
    /last_currencies\.php\?csrf=([^"'&\s]+)/i,
    /name=["']csrf["'][^>]*value=["']([^"']+)/i,
    /value=["']([^"']+)["'][^>]*name=["']csrf["']/i,
    /["']csrf["']\s*[:=]\s*["']([^"']+)/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  if (sessionId) {
    const encoded = html.match(new RegExp(`${sessionId}[^"'\\s]{20,}`));
    if (encoded?.[0]) return encoded[0];
  }
  return null;
}

async function fetchNavasanLastCurrencies(): Promise<Record<string, number> | null> {
  const headers = {
    Accept: 'text/html,application/xhtml+xml,application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; Dongham/1.0)',
    Referer: NAVASAN_HOME,
  };
  try {
    const home = await fetchWithTimeout(NAVASAN_HOME, { headers });
    if (!home.ok) return null;
    const html = await home.text();
    const session = cookieValue(home.headers.get('set-cookie'), 'PHPSESSID');
    const csrf = extractCsrf(html, session || undefined);
    const url = new URL(NAVASAN_LAST);
    if (csrf) url.searchParams.set('csrf', csrf);
    url.searchParams.set('_', String(Math.floor(Date.now() / 1000)));
    const res = await fetchWithTimeout(url.toString(), {
      headers: {
        ...headers,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        ...(session ? { Cookie: `PHPSESSID=${session}` } : {}),
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const rates = parseNavasanLastCurrencies(json);
    return Object.keys(rates).length ? rates : null;
  } catch {
    return null;
  }
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
