import { db } from './db';
import { formatMoney } from './format';

const LAST_KEY = 'debtReminderAt';

export async function scheduleDebtReminders(input: {
  owedToMe: number;
  iOwe: number;
  currency?: string;
}): Promise<void> {
  const profile = await db.profile.get('self');
  if (!profile || profile.debtReminders === false) return;
  if (input.iOwe <= 0 && input.owedToMe <= 0) return;

  const last = await db.meta.get(LAST_KEY);
  if (last?.value && Date.now() - Number(last.value) < 20 * 60 * 60 * 1000) return;

  const bodyParts: string[] = [];
  if (input.iOwe > 0) bodyParts.push(`بدهی شما ${formatMoney(input.iOwe, input.currency || 'IRT', profile.usePersianDigits)}`);
  if (input.owedToMe > 0) bodyParts.push(`طلب شما ${formatMoney(input.owedToMe, input.currency || 'IRT', profile.usePersianDigits)}`);
  const body = `${bodyParts.join(' · ')} — تسویه را فراموش نکنید.`;

  const n = {
    id: crypto.randomUUID(),
    title: 'یادآوری تسویه دونگ‌هام',
    body,
    read: false,
    createdAt: new Date().toISOString(),
  };
  await db.notifications.put(n);
  await db.meta.put({ key: LAST_KEY, value: String(Date.now()) });

  if ('Notification' in window) {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') new Notification(n.title, { body: n.body });
  }
}
