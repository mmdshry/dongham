import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { coalesceSyncOps, parseSyncConflict } from './sync';

describe('coalesceSyncOps', () => {
  it('merges period upserts into the last payload', () => {
    const ops = coalesceSyncOps([
      { entity: 'period', action: 'upsert', payload: { visibility: 'public' } },
      { entity: 'member', action: 'upsert', payload: { id: 'm1' } },
      { entity: 'period', action: 'upsert', payload: { visibility: 'private' } },
      { entity: 'period', action: 'upsert', payload: { visibility: 'public', title: 'سفر' } },
    ]);
    expect(ops).toEqual([
      { entity: 'period', action: 'upsert', payload: { visibility: 'public', title: 'سفر' } },
      { entity: 'member', action: 'upsert', payload: { id: 'm1' } },
    ]);
  });

  it('leaves non-period ops unchanged when there is no period upsert', () => {
    const ops = [
      { entity: 'member' as const, action: 'upsert' as const, payload: { id: 'm1' } },
    ];
    expect(coalesceSyncOps(ops)).toEqual(ops);
  });
});

describe('parseSyncConflict', () => {
  it('reads 409 snapshot and serverVersion', () => {
    const snapshot = {
      period: {
        id: 'p1',
        title: 'سفر',
        currency: 'IRT',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        version: 4,
      },
      members: [{ id: 'm1', displayName: 'علی' }],
      expenses: [],
    };
    const error = new ApiError('نسخهٔ سرور با این دستگاه یکی نیست', 409, {
      error: 'نسخهٔ سرور با این دستگاه یکی نیست',
      serverVersion: 4,
      snapshot,
    });
    expect(parseSyncConflict(error, 'p1')).toEqual({
      periodId: 'p1',
      message: 'نسخهٔ سرور با این دستگاه یکی نیست',
      serverVersion: 4,
      snapshot,
    });
  });

  it('falls back to snapshot.period.version when serverVersion is missing', () => {
    const snapshot = {
      period: {
        id: 'p1',
        title: 'سفر',
        currency: 'IRT',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        version: 7,
      },
      members: [],
    };
    const error = new ApiError('conflict', 409, { snapshot });
    expect(parseSyncConflict(error, 'p1')?.serverVersion).toBe(7);
  });

  it('returns null for non-409 errors', () => {
    expect(parseSyncConflict(new ApiError('server', 500, {}), 'p1')).toBeNull();
  });
});
