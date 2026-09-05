export const DONGHAM_EXPORT_FORMAT = 'dongham' as const;
export const DONGHAM_EXPORT_VERSION = 3 as const;

export type DonghamExportKind = 'device' | 'period' | 'server';

export type DonghamExport<T = unknown> = {
  format: typeof DONGHAM_EXPORT_FORMAT;
  version: typeof DONGHAM_EXPORT_VERSION;
  kind: DonghamExportKind;
  exportedAt: string;
  payload: T;
};

export function wrapDonghamExport<T>(kind: DonghamExportKind, payload: T): DonghamExport<T> {
  return {
    format: DONGHAM_EXPORT_FORMAT,
    version: DONGHAM_EXPORT_VERSION,
    kind,
    exportedAt: new Date().toISOString(),
    payload,
  };
}

export function parseDonghamExport(raw: unknown): DonghamExport {
  if (!raw || typeof raw !== 'object') throw new Error('خروجی نامعتبر است');
  const row = raw as Record<string, unknown>;
  if (row.format === DONGHAM_EXPORT_FORMAT && row.version === DONGHAM_EXPORT_VERSION && typeof row.kind === 'string') {
    return {
      format: DONGHAM_EXPORT_FORMAT,
      version: DONGHAM_EXPORT_VERSION,
      kind: row.kind as DonghamExportKind,
      exportedAt: typeof row.exportedAt === 'string' ? row.exportedAt : new Date().toISOString(),
      payload: row.payload,
    };
  }
  if (row.version === 2 && row.profile && row.periods) {
    return wrapDonghamExport('device', raw);
  }
  if (row.v === 1 && row.period) {
    return wrapDonghamExport('period', raw);
  }
  if (row.users && row.periods) {
    return wrapDonghamExport('server', raw);
  }
  throw new Error('نسخهٔ خروجی پشتیبانی نمی‌شود');
}
