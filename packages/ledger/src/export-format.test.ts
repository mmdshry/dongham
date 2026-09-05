import { describe, expect, it } from 'vitest';
import { parseDonghamExport, wrapDonghamExport } from './export-format.js';

describe('dongham export v3', () => {
  it('wraps and parses a v3 envelope', () => {
    const packed = wrapDonghamExport('period', { period: { id: 'abc-def' } });
    expect(packed.format).toBe('dongham');
    expect(packed.version).toBe(3);
    expect(parseDonghamExport(packed).payload).toEqual({ period: { id: 'abc-def' } });
  });

  it('migrates legacy device backup and period snapshot', () => {
    expect(parseDonghamExport({ version: 2, profile: {}, periods: [] }).kind).toBe('device');
    expect(parseDonghamExport({ v: 1, period: { id: 'abc-def' } }).kind).toBe('period');
    expect(parseDonghamExport({ users: [], periods: [] }).kind).toBe('server');
  });
});
