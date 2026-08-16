import { describe, expect, it } from 'vitest';
import { isPeriodId, migratePeriodIds, newPeriodId, periodIdFromLegacy } from './period-id.js';

describe('period ids', () => {
  it('accepts mixed-case alphanumeric Xxx-Xxx', () => {
    expect(isPeriodId('X1x-2Xx')).toBe(true);
    expect(isPeriodId('x1x-2xx')).toBe(true);
    expect(isPeriodId('X1x-2Xx') === isPeriodId('x1x-2xx')).toBe(true);
    expect(isPeriodId('gbFXG4eWQEQqEs3Iku_5h')).toBe(false);
    expect(isPeriodId('abc-defg')).toBe(false);
  });

  it('treats case as distinct', async () => {
    const a = await periodIdFromLegacy('seed-A');
    const b = await periodIdFromLegacy('seed-a');
    expect(isPeriodId(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('maps the same legacy id to the same short id', async () => {
    const old = 'gbFXG4eWQEQqEs3Iku_5h';
    const map1 = await migratePeriodIds([old]);
    const map2 = await migratePeriodIds([old]);
    expect(map1.get(old)).toBe(map2.get(old));
    expect(isPeriodId(map1.get(old)!)).toBe(true);
  });

  it('does not collide two remapped ids in one batch', async () => {
    const olds = ['id-one-aaaaaaaaaaa', 'id-two-bbbbbbbbbbb'];
    const map = await migratePeriodIds(olds);
    expect(map.get(olds[0])).not.toBe(map.get(olds[1]));
  });

  it('keeps already-short ids', async () => {
    const map = await migratePeriodIds(['X1x-2Xx', 'gbFXG4eWQEQqEs3Iku_5h']);
    expect(map.get('X1x-2Xx')).toBe('X1x-2Xx');
    expect(isPeriodId(map.get('gbFXG4eWQEQqEs3Iku_5h')!)).toBe(true);
  });

  it('generates unique random ids', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const id = newPeriodId(taken);
      expect(isPeriodId(id)).toBe(true);
      expect(taken.has(id)).toBe(false);
      taken.add(id);
    }
  });
});
