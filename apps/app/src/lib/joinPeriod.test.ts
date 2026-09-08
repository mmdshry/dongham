import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JOIN_OFFLINE_ERROR, parseJoinPayload, resolveJoin } from './joinPeriod';

const mocks = vi.hoisted(() => ({
  getPeriod: vi.fn(),
  api: vi.fn(),
  applyPeriodSnapshot: vi.fn(),
}));

vi.mock('./db', () => ({
  db: {
    periods: {
      get: (...args: unknown[]) => mocks.getPeriod(...args),
    },
  },
}));

vi.mock('./api', () => ({
  api: (...args: unknown[]) => mocks.api(...args),
}));

vi.mock('./sync', () => ({
  applyPeriodSnapshot: (...args: unknown[]) => mocks.applyPeriodSnapshot(...args),
}));

function setOnline(value: boolean) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: value },
  });
}

describe('parseJoinPayload', () => {
  it('accepts short period ids', () => {
    expect(parseJoinPayload('X1x-2Xx')).toEqual({ type: 'period', id: 'X1x-2Xx' });
  });

  it('extracts period id from app url', () => {
    expect(parseJoinPayload('https://app.dongham.ir/periods/Ab3-Cd9')).toEqual({
      type: 'period',
      id: 'Ab3-Cd9',
    });
    expect(parseJoinPayload('https://dongham.ir/periods/Ab3-Cd9')).toEqual({
      type: 'period',
      id: 'Ab3-Cd9',
    });
  });

  it('extracts invite token', () => {
    expect(parseJoinPayload('https://app.dongham.ir/i/abc_token-1')).toEqual({
      type: 'invite',
      token: 'abc_token-1',
    });
    expect(parseJoinPayload('https://dongham.ir/i/abc_token-1')).toEqual({
      type: 'invite',
      token: 'abc_token-1',
    });
  });

  it('rejects empty input', () => {
    expect(parseJoinPayload('   ')).toBeNull();
  });
});

describe('resolveJoin', () => {
  beforeEach(() => {
    mocks.getPeriod.mockReset();
    mocks.api.mockReset();
    mocks.applyPeriodSnapshot.mockReset();
    setOnline(true);
  });

  afterEach(() => {
    setOnline(true);
  });

  it('opens a local period even while offline', async () => {
    setOnline(false);
    mocks.getPeriod.mockResolvedValue({ id: 'Ab3-Cd9' });
    await expect(resolveJoin({ type: 'period', id: 'Ab3-Cd9' })).resolves.toEqual({
      path: '/periods/Ab3-Cd9',
    });
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it('refuses a remote period while offline without calling the API', async () => {
    setOnline(false);
    mocks.getPeriod.mockResolvedValue(undefined);
    await expect(resolveJoin({ type: 'period', id: 'Ab3-Cd9' })).resolves.toEqual({
      error: JOIN_OFFLINE_ERROR,
    });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.applyPeriodSnapshot).not.toHaveBeenCalled();
  });

  it('fetches a remote period while online', async () => {
    mocks.getPeriod.mockResolvedValue(undefined);
    mocks.api.mockResolvedValue({ period: { id: 'Ab3-Cd9' } });
    mocks.applyPeriodSnapshot.mockResolvedValue(undefined);
    await expect(resolveJoin({ type: 'period', id: 'Ab3-Cd9' })).resolves.toEqual({
      path: '/periods/Ab3-Cd9',
    });
    expect(mocks.api).toHaveBeenCalledWith('/periods/Ab3-Cd9/snapshot');
    expect(mocks.applyPeriodSnapshot).toHaveBeenCalled();
  });
});
