import { describe, expect, it } from 'vitest';
import {
  PERIOD_COMPLETED_WRITE_MESSAGE,
  PERIOD_DELETED_MESSAGE,
  PERIOD_STALE_MS,
  PERIOD_STATUS_LABEL_FA,
  lastPeriodActivityAt,
  periodLifecycleStatus,
  periodLifecycleWriteDenial,
} from './period-status.js';

const created = '2026-01-01T00:00:00.000Z';

describe('periodLifecycleStatus', () => {
  it('prefers deleted over archive, complete, and stale', () => {
    expect(
      periodLifecycleStatus({
        createdAt: created,
        deletedAt: '2026-08-01T00:00:00.000Z',
        archivedAt: '2026-08-01T00:00:00.000Z',
        completedAt: '2026-08-01T00:00:00.000Z',
        now: Date.parse('2026-09-01T00:00:00.000Z'),
      }),
    ).toBe('deleted');
  });

  it('prefers archive over complete and stale', () => {
    expect(
      periodLifecycleStatus({
        createdAt: created,
        archivedAt: '2026-08-01T00:00:00.000Z',
        completedAt: '2026-08-01T00:00:00.000Z',
        now: Date.parse('2026-09-01T00:00:00.000Z'),
      }),
    ).toBe('archived');
  });

  it('prefers complete over stale', () => {
    expect(
      periodLifecycleStatus({
        createdAt: created,
        completedAt: '2026-02-01T00:00:00.000Z',
        now: Date.parse('2026-09-01T00:00:00.000Z'),
      }),
    ).toBe('completed');
  });

  it('marks stale after 30 days without expense or payment', () => {
    const now = Date.parse('2026-03-10T00:00:00.000Z');
    expect(periodLifecycleStatus({ createdAt: created, now })).toBe('stale');
    expect(
      periodLifecycleStatus({
        createdAt: created,
        now,
        expenses: [{ createdAt: '2026-03-01T00:00:00.000Z' }],
      }),
    ).toBe('active');
    expect(
      periodLifecycleStatus({
        createdAt: created,
        now,
        expenses: [{ createdAt: '2026-03-01T00:00:00.000Z', deletedAt: '2026-03-02T00:00:00.000Z' }],
      }),
    ).toBe('stale');
  });

  it('uses the newer of expense occurredAt and payment createdAt', () => {
    expect(
      lastPeriodActivityAt({
        createdAt: created,
        expenses: [{ occurredAt: '2026-02-01T00:00:00.000Z', createdAt: '2026-01-02T00:00:00.000Z' }],
        payments: [{ createdAt: '2026-02-10T00:00:00.000Z' }],
      }),
    ).toBe('2026-02-10T00:00:00.000Z');
  });

  it('is active inside the 30-day window', () => {
    const now = Date.parse(created) + PERIOD_STALE_MS;
    expect(periodLifecycleStatus({ createdAt: created, now })).toBe('active');
    expect(periodLifecycleStatus({ createdAt: created, now: now + 1 })).toBe('stale');
  });
});

describe('periodLifecycleWriteDenial', () => {
  it('blocks every write on a deleted period', () => {
    expect(
      periodLifecycleWriteDenial({ deletedAt: 'x', completedAt: 'y', role: 'owner', kind: 'expense' }),
    ).toBe(PERIOD_DELETED_MESSAGE);
  });

  it('lets owner or manager add an expense to reopen a completed period', () => {
    expect(periodLifecycleWriteDenial({ completedAt: 'x', role: 'owner', kind: 'expense' })).toBeNull();
    expect(periodLifecycleWriteDenial({ completedAt: 'x', role: 'manager', kind: 'expense' })).toBeNull();
    expect(periodLifecycleWriteDenial({ completedAt: 'x', role: 'member', kind: 'expense' })).toBe(
      PERIOD_COMPLETED_WRITE_MESSAGE,
    );
    expect(periodLifecycleWriteDenial({ completedAt: 'x', role: 'owner', kind: 'other' })).toBe(
      PERIOD_COMPLETED_WRITE_MESSAGE,
    );
  });
});

describe('PERIOD_STATUS_LABEL_FA', () => {
  it('covers every status', () => {
    expect(PERIOD_STATUS_LABEL_FA.active).toBe('فعال');
    expect(PERIOD_STATUS_LABEL_FA.archived).toBe('آرشیو');
    expect(PERIOD_STATUS_LABEL_FA.deleted).toBe('حذف');
    expect(PERIOD_STATUS_LABEL_FA.stale).toBe('راکد');
    expect(PERIOD_STATUS_LABEL_FA.completed).toBe('اتمام');
  });
});
