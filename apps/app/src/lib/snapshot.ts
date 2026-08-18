import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import { db, noneCharge, type LocalExpense, type LocalMember, type LocalPayment, type LocalPeriod, type LocalRecurring } from './db';
import { queueOp } from './sync';

export interface ExportSnapshot {
  v: 1;
  period: LocalPeriod;
  members: LocalMember[];
  expenses: LocalExpense[];
  payments: LocalPayment[];
  recurring: LocalRecurring[];
}

/** @deprecated Use ExportSnapshot — cloud sync uses CloudPeriodSnapshot. */
export type PeriodSnapshot = ExportSnapshot;

const QR_MAX = 1800;

export async function buildPeriodSnapshot(periodId: string): Promise<ExportSnapshot> {
  const period = await db.periods.get(periodId);
  if (!period) throw new Error('دوره پیدا نشد');
  return {
    v: 1,
    period,
    members: await db.members.where('periodId').equals(periodId).toArray(),
    expenses: (await db.expenses.where('periodId').equals(periodId).toArray()).filter((e) => !e.deletedAt),
    payments: (await db.payments.where('periodId').equals(periodId).toArray()).filter((p) => !p.deletedAt),
    recurring: await db.recurring.where('periodId').equals(periodId).toArray(),
  };
}

export async function serializeSnapshot(snap: ExportSnapshot, passphrase?: string): Promise<string> {
  const json = JSON.stringify(snap);
  if (passphrase) return `DH1:${await encryptWithPass(json, passphrase)}`;
  return json;
}

export async function parseSnapshot(raw: string, passphrase?: string): Promise<ExportSnapshot> {
  let json = raw.trim();
  if (json.startsWith('DH1:')) {
    if (!passphrase) throw new Error('رمز دوره لازم است');
    json = await decryptWithPass(json.slice(4), passphrase);
  }
  const snap = JSON.parse(json) as ExportSnapshot;
  if (snap.v !== 1 || !snap.period?.id) throw new Error('اسنپ‌شات نامعتبر است');
  return snap;
}

export async function snapshotQrDataUrl(payload: string): Promise<string | null> {
  if (payload.length > QR_MAX) return null;
  return QRCode.toDataURL(payload, { margin: 1, width: 320, errorCorrectionLevel: 'L' });
}

export async function importPeriodSnapshot(snap: ExportSnapshot): Promise<string> {
  const id = snap.period.id || nanoid();
  const period = { ...snap.period, id, synced: false, updatedAt: new Date().toISOString() };
  await db.periods.put(period);
  await queueOp(id, 'period', 'upsert', {
    title: period.title,
    currency: period.currency,
    kind: period.kind,
    template: period.template,
    roundTo: period.roundTo,
    bankerMemberId: period.bankerMemberId,
    buildingCharge: period.buildingCharge,
    lunchTurnMemberId: period.lunchTurnMemberId,
    encrypted: period.encrypted,
    visibility: period.visibility,
  });
  for (const m of snap.members) {
    const member = { ...m, periodId: id };
    await db.members.put(member);
    await queueOp(id, 'member', 'upsert', member);
  }
  for (const e of snap.expenses) {
    const expense = {
      ...e,
      periodId: id,
      service: e.service || noneCharge(),
      tip: e.tip || noneCharge(),
      tax: e.tax || noneCharge(),
      payers: e.payers || [],
      occurredAt: e.occurredAt || e.createdAt,
    };
    await db.expenses.put(expense);
    await queueOp(id, 'expense', 'upsert', expense);
  }
  for (const p of snap.payments) {
    const payment = { ...p, periodId: id };
    await db.payments.put(payment);
    await queueOp(id, 'payment', 'upsert', payment);
  }
  for (const r of snap.recurring) {
    const rule = { ...r, periodId: id };
    await db.recurring.put(rule);
    await queueOp(id, 'recurring', 'upsert', rule);
  }
  return id;
}

async function keyFromPass(pass: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`dongham-period:${pass}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptWithPass(plain: string, pass: string): Promise<string> {
  const key = await keyFromPass(pass);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  const packed = new Uint8Array(iv.length + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...packed));
}

async function decryptWithPass(payload: string, pass: string): Promise<string> {
  const key = await keyFromPass(pass);
  const packed = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const iv = packed.slice(0, 12);
  const data = packed.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plain);
}

