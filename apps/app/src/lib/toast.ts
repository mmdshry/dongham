import type { LucideIcon } from 'lucide-react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';

export type ToastKind = 'error' | 'success' | 'warn' | 'info';

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOpts = {
  sticky?: boolean;
  action?: ToastAction;
  actions?: ToastAction[];
  source?: string;
};

export type ToastPayload = {
  id: number;
  message: string;
  kind: ToastKind;
  sticky?: boolean;
  actions?: ToastAction[];
  source?: string;
};

export const TOAST_DURATION_MS: Record<ToastKind, number> = {
  error: 4000,
  success: 2800,
  warn: 5000,
  info: 3000,
};

export const TOAST_ICONS: Record<ToastKind, LucideIcon> = {
  error: CircleAlert,
  success: CircleCheck,
  warn: TriangleAlert,
  info: Info,
};

let toastSeq = 0;

export function nextToastId(): number {
  toastSeq += 1;
  return toastSeq;
}

export function buildToast(message: string, kind: ToastKind, opts?: ToastOpts): ToastPayload {
  const actions = [...(opts?.actions ?? []), ...(opts?.action ? [opts.action] : [])];
  const sticky = opts?.sticky ?? actions.length > 0;
  return {
    id: nextToastId(),
    message,
    kind,
    sticky,
    actions: actions.length ? actions : undefined,
    source: opts?.source,
  };
}

export function toastDurationMs(payload: ToastPayload): number | null {
  if (payload.sticky) return null;
  return TOAST_DURATION_MS[payload.kind];
}

export function toastMessageFromError(e: unknown, fallback = 'خطا'): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
