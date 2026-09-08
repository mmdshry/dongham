import { useLiveQuery } from 'dexie-react-hooks';
import { Modal } from './Dialog';
import { db } from '../lib/db';
import { markNotificationRead } from '../lib/sync';
import { useUiStore } from '../store/ui';

export function NotificationsSheet() {
  const sheet = useUiStore((s) => s.sheet);
  const closeSheet = useUiStore((s) => s.closeSheet);
  const notifications =
    useLiveQuery(() => db.notifications.orderBy('createdAt').reverse().limit(20).toArray(), []) || [];

  return (
    <Modal open={sheet === 'notifs'} onClose={closeSheet} title="اعلان‌ها">
      {notifications.length === 0 ? (
        <p className="text-sm text-ink-700/70">اعلانی نیست.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {notifications.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={`w-full rounded-2xl px-3 py-2 text-right ${
                  n.read ? 'bg-brand-50' : 'bg-brand-100 ring-1 ring-brand-200'
                }`}
                onClick={() => void markNotificationRead(n.id)}
              >
                <p className="font-semibold">{n.title}</p>
                <p className="text-ink-700/70">{n.body}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
