import { db } from './db';

export interface BackupPayload {
  version: 2;
  exportedAt: string;
  profile: unknown;
  periods: unknown[];
  members: unknown[];
  expenses: unknown[];
  payments: unknown[];
  chat: unknown[];
  friends: unknown[];
  invites: unknown[];
  recurring: unknown[];
  notifications: unknown[];
  activity: unknown[];
}

export async function exportBackup(): Promise<BackupPayload> {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    profile: (await db.profile.toArray())[0] || null,
    periods: await db.periods.toArray(),
    members: await db.members.toArray(),
    expenses: await db.expenses.toArray(),
    payments: await db.payments.toArray(),
    chat: await db.chat.toArray(),
    friends: await db.friends.toArray(),
    invites: await db.invites.toArray(),
    recurring: await db.recurring.toArray(),
    notifications: await db.notifications.toArray(),
    activity: await db.activity.toArray(),
  };
}

export async function importBackup(payload: BackupPayload): Promise<void> {
  if (!payload || payload.version !== 2) {
    throw new Error('فایل پشتیبان نامعتبر است');
  }
  await db.transaction(
    'rw',
    [
      db.profile,
      db.periods,
      db.members,
      db.expenses,
      db.payments,
      db.chat,
      db.friends,
      db.invites,
      db.recurring,
      db.notifications,
      db.activity,
    ],
    async () => {
      if (payload.profile && typeof payload.profile === 'object') {
        await db.profile.put({ ...(payload.profile as object), id: 'self' } as never);
      }
      const putAll = async <T>(table: { put: (v: T) => Promise<unknown> }, rows?: unknown[]) => {
        for (const row of rows || []) await table.put(row as T);
      };
      await putAll(db.periods, payload.periods);
      await putAll(db.members, payload.members);
      await putAll(db.expenses, payload.expenses);
      await putAll(db.payments, payload.payments);
      await putAll(db.chat, payload.chat);
      await putAll(db.friends, payload.friends);
      await putAll(db.invites, payload.invites);
      await putAll(db.recurring, payload.recurring);
      await putAll(db.notifications, payload.notifications);
      await putAll(db.activity, payload.activity);
    },
  );
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
