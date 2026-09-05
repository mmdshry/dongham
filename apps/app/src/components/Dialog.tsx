import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

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
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/40 p-4 md:items-center"
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
        className="max-h-[90dvh] w-full max-w-md animate-pop overflow-y-auto rounded-3xl bg-surface p-5 shadow-soft"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <button type="button" className="btn-ghost !min-h-11 !min-w-11 !px-3" onClick={onClose} aria-label="بستن">
            ×
          </button>
        </div>
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
  cancelLabel = 'انصراف',
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm leading-6 text-ink-700/80">{message}</p>
      <div className="mt-5 flex gap-2">
        <button type="button" className="btn-ghost flex-1" onClick={onClose}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`flex-1 ${danger ? 'btn-ghost text-rose-700' : 'btn-primary'}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function PromptDialog({
  open,
  title,
  message,
  placeholder,
  confirmLabel = 'ادامه',
  inputType = 'text',
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel?: string;
  inputType?: 'text' | 'password';
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue('');
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {message ? <p className="text-sm leading-6 text-ink-700/80">{message}</p> : null}
      <input
        className="input mt-3"
        data-autofocus
        type={inputType}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(value);
        }}
      />
      <div className="mt-5 flex gap-2">
        <button type="button" className="btn-ghost flex-1" onClick={onClose}>
          انصراف
        </button>
        <button type="button" className="btn-primary flex-1" onClick={() => onSubmit(value)}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
