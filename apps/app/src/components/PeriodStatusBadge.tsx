import { PERIOD_STATUS_LABEL_FA, type PeriodLifecycleStatus } from '@dongham/ledger';

const STATUS_CLASS: Record<PeriodLifecycleStatus, string> = {
  active: 'bg-success-muted text-success',
  archived: 'bg-brand-50 text-ink-700/80',
  deleted: 'bg-danger-muted text-danger',
  stale: 'bg-brand-100 text-brand-800',
  completed: 'bg-ink-900/10 text-ink-900',
};

export function PeriodStatusBadge({ status }: { status: PeriodLifecycleStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_CLASS[status]}`}>
      {PERIOD_STATUS_LABEL_FA[status]}
    </span>
  );
}
