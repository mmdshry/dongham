import { nanoid } from 'nanoid';
import { computeBalances, parseExpenseText } from '@dongham/ledger';
import { bumpPeriodVersion, getDb, mutate } from './db.js';

const BOT = () => process.env.TELEGRAM_BOT_TOKEN || '';

type TgUpdate = {
  message?: {
    chat: { id: number; type: string };
    text?: string;
    from?: { first_name?: string; username?: string };
  };
};

export async function handleTelegramUpdate(update: TgUpdate): Promise<{ ok: boolean; reply?: string }> {
  const msg = update.message;
  const text = msg?.text?.trim();
  const chatId = msg?.chat.id;
  if (!text || chatId == null) return { ok: true };

  if (text.startsWith('/start')) {
    const app = process.env.APP_PUBLIC_URL || 'https://app.dongham.ir';
    return {
      ok: true,
      reply: `دونگ‌هام — دفتر حساب گروهی.\nوب‌اپ: ${app}\nبرای اتصال این چت به یک دوره: /link TOKEN\nحساب: /balance\nثبت هزینه: «علی ناهار ۵۰۰۰۰۰»`,
    };
  }

  if (text.startsWith('/link')) {
    const token = text.split(/\s+/)[1];
    if (!token) return { ok: true, reply: 'نمونه: /link abc123' };
    const invite = getDb().invites.find((i) => i.token === token);
    if (!invite) return { ok: true, reply: 'دعوت پیدا نشد' };
    mutate((db) => {
      db.telegramLinks = db.telegramLinks || [];
      db.telegramLinks = db.telegramLinks.filter((l) => l.chatId !== String(chatId));
      db.telegramLinks.push({ chatId: String(chatId), periodId: invite.periodId });
    });
    const period = getDb().periods.find((p) => p.id === invite.periodId);
    return { ok: true, reply: `چت به دوره «${period?.title || invite.periodId}» وصل شد.` };
  }

  const link = (getDb().telegramLinks || []).find((l) => l.chatId === String(chatId));
  if (text.startsWith('/balance')) {
    if (!link) return { ok: true, reply: 'اول با /link TOKEN دوره را وصل کنید.' };
    const db = getDb();
    const members = db.members.filter((m) => m.periodId === link.periodId);
    const expenses = db.expenses
      .filter((e) => e.periodId === link.periodId && !e.deletedAt)
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
    const payments = db.payments
      .filter((p) => p.periodId === link.periodId && !p.deletedAt && p.status !== 'pending_confirm' && p.status !== 'sent')
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
    const lines = members.map((m) => {
      const bal = balances[m.id] || 0;
      const label = bal > 0 ? 'طلبکار' : bal < 0 ? 'بدهکار' : 'تسویه';
      return `${m.displayName}: ${bal} (${label})`;
    });
    const app = process.env.APP_PUBLIC_URL || 'https://app.dongham.ir';
    return { ok: true, reply: `${lines.join('\n') || 'عضوی نیست'}\nحساب کامل: ${app}` };
  }

  if (text.startsWith('/invite')) {
    if (!link) return { ok: true, reply: 'اول دوره را /link کنید.' };
    const token = nanoid(12);
    mutate((db) => {
      db.invites.push({
        token,
        periodId: link.periodId,
        createdBy: 'telegram',
        createdAt: new Date().toISOString(),
      });
    });
    const app = process.env.APP_PUBLIC_URL || 'https://app.dongham.ir';
    return { ok: true, reply: `دعوت: ${app}/i/${token}` };
  }

  const parsed = parseExpenseText(text);
  if (parsed && link) {
    const db = getDb();
    const members = db.members.filter((m) => m.periodId === link.periodId && !m.isPot);
    const payer =
      (parsed.payerName && members.find((m) => m.displayName.includes(parsed.payerName!))) || members[0];
    if (!payer) return { ok: true, reply: 'عضوی در دوره نیست.' };
    const expenseId = nanoid();
    mutate((d) => {
      d.expenses.push({
        id: expenseId,
        periodId: link.periodId,
        title: parsed.title,
        amount: parsed.amount,
        currency: d.periods.find((p) => p.id === link.periodId)?.currency || 'IRT',
        payerId: payer.id,
        splitMode: 'equal',
        shares: members.map((m) => ({ memberId: m.id, value: 1 })),
        tax: { type: 'none', value: 0 },
        service: { type: 'none', value: 0 },
        tip: { type: 'none', value: 0 },
        tags: ['تلگرام'],
        fxRate: 1,
        createdAt: new Date().toISOString(),
        occurredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      });
      bumpPeriodVersion(d, link.periodId);
    });
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

