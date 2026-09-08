import { Search } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useSession } from '../lib/session';
import { ToastBar } from './ToastBar';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    const preferred =
      panel?.querySelector<HTMLElement>('[data-autofocus],input,select,textarea') ||
      panel?.querySelector<HTMLElement>(FOCUSABLE);
    preferred?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const nodes = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      lastFocus.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/55 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md animate-pop rounded-2xl bg-surface p-5 shadow-soft"
      >
        <h2 id={titleId} className="text-base font-bold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'تأیید',
  danger,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="mt-2 text-sm text-ink-700/80">{message}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>
          انصراف
        </button>
        <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const id = useId();
  return (
    <div className="relative max-w-md">
      <label className="sr-only" htmlFor={id}>
        {placeholder}
      </label>
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-ink-700/50">
        <Icon icon={Search} size={16} />
      </span>
      <input
        id={id}
        className="input w-full ps-10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">در حال بارگذاری</span>
      <div className="h-8 w-40 animate-pulse rounded-xl bg-brand-100" />
      <div className="h-48 animate-pulse rounded-2xl bg-brand-50" />
    </div>
  );
}

export function EmptyRow({ colSpan, label = 'موردی نیست' }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-8 text-center text-ink-700/60">
        {label}
      </td>
    </tr>
  );
}

export function ToastHost() {
  const { toast, setToast } = useSession();
  if (!toast) return null;
  return (
    <ToastBar
      key={toast.id}
      toast={toast}
      onDismiss={() => setToast(null)}
      className="fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2"
    />
  );
}
