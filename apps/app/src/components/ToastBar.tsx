import { X } from 'lucide-react';
import { Icon } from './Icon';
import { TOAST_ICONS, type ToastPayload } from '../lib/toast';

export function ToastBar({
  toast,
  onDismiss,
  className,
}: {
  toast: ToastPayload;
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      className={`toast-bar toast-bar-${toast.kind} font-sans animate-pop ${className ?? ''}`}
    >
      <Icon icon={TOAST_ICONS[toast.kind]} size={20} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="leading-6">{toast.message}</p>
        {toast.actions?.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {toast.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className="rounded-xl px-2 py-1 text-xs font-semibold underline decoration-from-font underline-offset-4"
                onClick={() => {
                  action.onClick();
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {toast.sticky ? (
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl"
          aria-label="بستن"
          onClick={onDismiss}
        >
          <Icon icon={X} size={18} />
        </button>
      ) : null}
    </div>
  );
}
