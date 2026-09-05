import { nanoid } from 'nanoid';
import { computeBalances, parseExpenseText } from '@dongham/ledger';
import { appPublicUrl, inviteExpiresAt, isInviteExpired, telegramMiniAppInviteUrl } from './publicUrl.js';
import {
  getInvite,
  getPeriod,
  getTelegramLink,
  insertActivity,
  insertInvite,
  listMembers,
  loadPeriodSnapshot,
  notifyPeriodMembers,
  upsertExpense,
  upsertTelegramLink,
} from './repo.js';

const BOT = () => process.env.TELEGRAM_BOT_TOKEN || '';

type TgUpdate = {
  message?: {
    chat: { id: number; type: string };
    text?: string;
    from?: { first_name?: string; username?: string };
  };
};

function inviteReply(token: string): string {
  const web = `${appPublicUrl()}/i/${token}`;
  const mini = telegramMiniAppInviteUrl(token);
  return mini ? `دعوت وب: ${web}\nمینی‌اپ: ${mini}` : `دعوت: ${web}`;
}

export async function handleTelegramUpdate(update: TgUpdate): Promise<{ ok: boolean; reply?: string }> {
  const msg = update.message;
  const text = msg?.text?.trim();
  const chatId = msg?.chat.id;
  if (!text || chatId == null) return { ok: true };

  if (text.startsWith('/start')) {
    const app = appPublicUrl();
    const miniHint = telegramMiniAppInviteUrl('TOKEN')
      ? '\nدعوت مینی‌اپ: لینک /invite هم startapp می‌فرستد.'
      : '';
    return {
      ok: true,
      reply: `دونگ‌هام — دفتر حساب گروهی.\nوب‌اپ: ${app}\nبرای اتصال این چت به یک دوره: /link TOKEN\nحساب: /balance\nثبت هزینه: «علی ناهار ۵۰۰۰۰۰»${miniHint}`,
    };
  }

  if (text.startsWith('/link')) {
    const token = text.split(/\s+/)[1];
    if (!token) return { ok: true, reply: 'نمونه: /link abc123' };
    const invite = await getInvite(token);
    if (!invite || isInviteExpired(invite)) return { ok: true, reply: 'دعوت پیدا نشد' };
    const members = (await listMembers(invite.periodId)).filter((m) => !m.isPot);
    const fromName = update.message?.from?.first_name;
    const payerMemberId =
      (fromName && members.find((m) => m.displayName.includes(fromName))?.id) || members[0]?.id;
    await upsertTelegramLink({ chatId: String(chatId), periodId: invite.periodId, payerMemberId });
    const period = await getPeriod(invite.periodId);
    return { ok: true, reply: `چت به دوره «${period?.title || invite.periodId}» وصل شد.` };
  }

  const link = await getTelegramLink(String(chatId));
  if (text.startsWith('/balance')) {
    if (!link) return { ok: true, reply: 'اول با /link TOKEN دوره را وصل کنید.' };
    const snap = await loadPeriodSnapshot(link.periodId);
    if (!snap) return { ok: true, reply: 'دوره پیدا نشد' };
    const expenses = snap.expenses
      .filter((e) => !e.deletedAt)
      .map((e) => ({
        id: e.id,
        title: e.title,
        amount: e.amount,
        currency: e.currency,
        payerId: e.payerId,
        payers: e.payers,
        splitMode: e.splitMode,
        shares: e.shares,
        tax: e.tax,
        service: e.service,
        tip: e.tip,
        fxRate: e.fxRate,
      }));
    const payments = snap.payments
      .filter((p) => !p.deletedAt && p.status !== 'pending_confirm' && p.status !== 'sent')
      .map((p) => ({
        id: p.id,
        fromMemberId: p.fromMemberId,
        toMemberId: p.toMemberId,
        amount: p.amount,
        currency: p.currency,
        kind: p.kind,
        fxRate: p.fxRate,
      }));
    const balances = computeBalances(expenses, payments);
    const lines = snap.members.map((m) => {
      const bal = balances[m.id] || 0;
      const label = bal > 0 ? 'طلبکار' : bal < 0 ? 'بدهکار' : 'تسویه';
      return `${m.displayName}: ${bal} (${label})`;
    });
    return { ok: true, reply: `${lines.join('\n') || 'عضوی نیست'}\nحساب کامل: ${appPublicUrl()}` };
  }

  if (text.startsWith('/invite')) {
    if (!link) return { ok: true, reply: 'اول دوره را /link کنید.' };
    const token = nanoid(12);
    await insertInvite({
      token,
      periodId: link.periodId,
      createdBy: 'telegram',
      createdAt: new Date().toISOString(),
      expiresAt: inviteExpiresAt(),
    });
    return { ok: true, reply: inviteReply(token) };
  }

  const parsed = parseExpenseText(text);
  if (parsed && link) {
    const members = await listMembers(link.periodId);
    const people = members.filter((m) => !m.isPot);
    const shareMembers = people.filter((m) => !m.excludeFromNew);
    const linkedPayer = link.payerMemberId ? people.find((m) => m.id === link.payerMemberId) : undefined;
    const payer =
      (parsed.payerName && people.find((m) => m.displayName.includes(parsed.payerName!))) ||
      linkedPayer ||
      people[0];
    if (!payer) return { ok: true, reply: 'عضوی در دوره نیست.' };
    const splitPeople = shareMembers.length ? shareMembers : people;
    const expenseId = nanoid();
    const now = new Date().toISOString();
    const period = await getPeriod(link.periodId);
    await upsertExpense({
      id: expenseId,
      periodId: link.periodId,
      title: parsed.title,
      amount: parsed.amount,
      currency: period?.currency || 'IRT',
      payerId: payer.id,
      splitMode: 'equal',
      shares: splitPeople.map((m) => ({ memberId: m.id, value: 1 })),
      tax: { type: 'none', value: 0 },
      service: { type: 'none', value: 0 },
      tip: { type: 'none', value: 0 },
      tags: ['تلگرام'],
      fxRate: 1,
      createdAt: now,
      occurredAt: now,
      updatedAt: now,
      version: 1,
    });
    await insertActivity({
      id: nanoid(),
      periodId: link.periodId,
      actorName: 'تلگرام',
      action: 'expense.upsert',
      summary: `ثبت هزینه از تلگرام: ${parsed.title}`,
      createdAt: now,
      entityId: expenseId,
    });
    await notifyPeriodMembers(
      link.periodId,
      '',
      'هزینه تلگرام',
      `«${parsed.title}» در دوره «${period?.title || link.periodId}» ثبت شد`,
    );
    return { ok: true, reply: `ثبت شد: ${parsed.title} — ${parsed.amount} (پرداخت‌کننده: ${payer.displayName})` };
  }

  return { ok: true };
}

export async function telegramSend(chatId: string | number, text: string) {
  if (!BOT()) return;
  await fetch(`https://api.telegram.org/bot${BOT()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => undefined);
}
