import { describe, expect, it } from 'vitest';
import { shouldImmediateSync } from './connectionMode';
import { coalesceSyncOps } from './sync';

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

describe('auto sync gate', () => {
  it('does not flush immediately when autoSync is off', () => {
    expect(shouldImmediateSync({ token: 't', autoSync: false }, true)).toBe(false);
    expect(shouldImmediateSync({ token: 't' }, true)).toBe(true);
  });
});
