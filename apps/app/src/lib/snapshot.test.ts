import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import { parseSnapshot, serializeSnapshot, type PeriodSnapshot } from './snapshot';

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}

describe('offline snapshot', () => {
  it('roundtrips with passphrase', async () => {
    const snap: PeriodSnapshot = {
      v: 1,
      period: {
        id: 'p1',
        title: 'سفر',
        currency: 'IRT',
        baseCurrency: 'IRT',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        synced: false,
        kind: 'split',
        template: 'travel',
        roundTo: 0,
      },
      members: [],
      expenses: [],
      payments: [],
      recurring: [],
    };
    const raw = await serializeSnapshot(snap, 'secret');
    expect(raw.startsWith('DH1:')).toBe(true);
    const back = await parseSnapshot(raw, 'secret');
    expect(back.period.title).toBe('سفر');
  });
});
