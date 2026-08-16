const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const PERIOD_ID_RE = /^[0-9A-Za-z]{3}-[0-9A-Za-z]{3}$/;

export type PeriodVisibility = 'private' | 'public';

export function isPeriodId(id: string): boolean {
  return PERIOD_ID_RE.test(id);
}

function charsFromBytes(bytes: Uint8Array): string {
  let chars = '';
  for (let i = 0; i < 6; i += 1) {
    chars += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `${chars.slice(0, 3)}-${chars.slice(3)}`;
}

export function newPeriodId(taken: Iterable<string> = []): string {
  const used = new Set(taken);
  for (let i = 0; i < 64; i += 1) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const id = charsFromBytes(bytes);
    if (!used.has(id)) return id;
  }
  throw new Error('شناسه دوره یکتا ساخته نشد');
}

export async function periodIdFromLegacy(oldId: string, salt = 0): Promise<string> {
  const data = new TextEncoder().encode(`${oldId}#${salt}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return charsFromBytes(new Uint8Array(buf));
}

/** Deterministic remap so app and API produce the same short id. Already-short ids stay as-is. */
export async function migratePeriodIds(oldIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const taken = new Set(oldIds.filter(isPeriodId));
  for (const id of oldIds) {
    if (isPeriodId(id)) map.set(id, id);
  }
  const legacy = oldIds.filter((id) => !isPeriodId(id)).sort();
  for (const oldId of legacy) {
    let salt = 0;
    let next = await periodIdFromLegacy(oldId, salt);
    while (taken.has(next)) {
      salt += 1;
      next = await periodIdFromLegacy(oldId, salt);
    }
    taken.add(next);
    map.set(oldId, next);
  }
  return map;
}
