import webpush from 'web-push';
import { all, getPool } from './mysql.js';
import { APP_HOME_PATH } from './publicUrl.js';

export type PushPayload = {
  userId: string;
  title: string;
  body: string;
  url?: string;
  notificationId?: string;
};

type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function vapidConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey || !privateKey) return null;
  const subject = (process.env.VAPID_SUBJECT || '').trim() || 'mailto:hello@dongham.ir';
  return { publicKey, privateKey, subject };
}

export function getVapidPublicKey(): string | null {
  return vapidConfig()?.publicKey || null;
}

export async function upsertSubscription(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, user_agent, created_at)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), p256dh=VALUES(p256dh), auth=VALUES(auth), user_agent=VALUES(user_agent)`,
    [input.endpoint, input.userId, input.p256dh, input.auth, input.userAgent || null, new Date()],
  );
}

export async function deleteSubscription(endpoint: string, userId?: string): Promise<void> {
  if (userId) {
    await getPool().query('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?', [endpoint, userId]);
    return;
  }
  await getPool().query('DELETE FROM push_subscriptions WHERE endpoint=?', [endpoint]);
}

async function listSubscriptions(userId: string): Promise<StoredSubscription[]> {
  const rows = await all(getPool(), 'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=?', [userId]);
  return rows.map((row) => ({
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
  }));
}

function errorStatus(err: unknown): number {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const code = Number((err as { statusCode: unknown }).statusCode);
    return Number.isFinite(code) ? code : 0;
  }
  return 0;
}

export async function sendPushToUser(payload: PushPayload): Promise<void> {
  const vapid = vapidConfig();
  if (!vapid) return;
  let subs: StoredSubscription[] = [];
  try {
    subs = await listSubscriptions(payload.userId);
  } catch {
    return;
  }
  if (!subs.length) return;
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || APP_HOME_PATH,
    notificationId: payload.notificationId,
  });
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        {
          vapidDetails: {
            subject: vapid.subject,
            publicKey: vapid.publicKey,
            privateKey: vapid.privateKey,
          },
        },
      );
    } catch (err) {
      const status = errorStatus(err);
      if (status === 404 || status === 410) {
        await deleteSubscription(sub.endpoint).catch(() => undefined);
      }
    }
  }
}
