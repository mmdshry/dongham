import type { PoolConnection } from 'mysql2/promise';
import { nanoid } from 'nanoid';
import { openField, sealIf } from './at-rest.js';
import {
  all,
  getPool,
  hydrateDb,
  insertRows,
  mapExpense,
  mapMember,
  mapPayment,
  mapPeriod,
  mapUser,
  persistMysql,
  type Row,
} from './mysql.js';
import type {
  ActivityRecord,
  AttachmentRecord,
  ChatMessageRecord,
  DbShape,
  ExpenseRecord,
  FriendRecord,
  InviteRecord,
  MemberRecord,
  PaymentRecord,
  PeriodRecord,
  UserRecord,
} from './types.js';

export async function withTx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  try {
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function loadDb(): Promise<DbShape> {
  const db = await hydrateDb();
  return decryptDb(db);
}

export async function replaceDb(db: DbShape): Promise<void> {
  await persistMysql(encryptDb(db));
}

export async function truncateAll(): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    const tables = await all(conn, 'SHOW TABLES');
    for (const row of tables) {
      const name = String(Object.values(row)[0]);
      if (name === 'schema_migrations') continue;
      await conn.query(`DELETE FROM \`${name}\``);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
  } finally {
    conn.release();
  }
}

function decryptDb(db: DbShape): DbShape {
  const enc = new Set(db.periods.filter((p) => p.encrypted).map((p) => p.id));
  return {
    ...db,
    members: db.members.map((m) => (enc.has(m.periodId) ? openMember(m) : m)),
    expenses: db.expenses.map((e) => (enc.has(e.periodId) ? openExpense(e) : e)),
    payments: db.payments.map((p) => (enc.has(p.periodId) ? openPayment(p) : p)),
    chat: db.chat.map((c) => (enc.has(c.periodId) ? { ...c, body: openField(c.body) || '' } : c)),
    attachments: db.attachments.map((a) =>
      enc.has(a.periodId) ? { ...a, dataBase64: openField(a.dataBase64) || '' } : a,
    ),
  };
}

function encryptDb(db: DbShape): DbShape {
  const enc = new Set(db.periods.filter((p) => p.encrypted).map((p) => p.id));
  return {
    ...db,
    members: db.members.map((m) => (enc.has(m.periodId) ? sealMember(m, true) : m)),
    expenses: db.expenses.map((e) => (enc.has(e.periodId) ? sealExpense(e, true) : e)),
    payments: db.payments.map((p) => (enc.has(p.periodId) ? sealPayment(p, true) : p)),
    chat: db.chat.map((c) =>
      enc.has(c.periodId) ? { ...c, body: sealIf(true, c.body) || c.body } : c,
    ),
    attachments: db.attachments.map((a) =>
      enc.has(a.periodId) ? { ...a, dataBase64: sealIf(true, a.dataBase64) || a.dataBase64 } : a,
    ),
  };
}

function openMember(m: MemberRecord): MemberRecord {
  return { ...m, cardNumber: openField(m.cardNumber), sheba: openField(m.sheba) };
}
function sealMember(m: MemberRecord, enc: boolean): MemberRecord {
  return { ...m, cardNumber: sealIf(enc, m.cardNumber), sheba: sealIf(enc, m.sheba) };
}
function openExpense(e: ExpenseRecord): ExpenseRecord {
  return { ...e, note: openField(e.note), attachmentDataUrl: openField(e.attachmentDataUrl) };
}
function sealExpense(e: ExpenseRecord, enc: boolean): ExpenseRecord {
  return { ...e, note: sealIf(enc, e.note), attachmentDataUrl: sealIf(enc, e.attachmentDataUrl) };
}
function openPayment(p: PaymentRecord): PaymentRecord {
  return { ...p, note: openField(p.note), receiptDataUrl: openField(p.receiptDataUrl) };
}
function sealPayment(p: PaymentRecord, enc: boolean): PaymentRecord {
  return { ...p, note: sealIf(enc, p.note), receiptDataUrl: sealIf(enc, p.receiptDataUrl) };
}

async function periodEncrypted(conn: PoolConnection | ReturnType<typeof getPool>, periodId: string): Promise<boolean> {
  const rows = await all(conn, 'SELECT encrypted FROM periods WHERE id = ?', [periodId]);
  return Boolean(rows[0]?.encrypted);
}

export async function getUserById(id: string): Promise<UserRecord | undefined> {
  const p = getPool();
  const users = await all(p, 'SELECT * FROM users WHERE id = ?', [id]);
  if (!users[0]) return undefined;
  const payouts = await all(p, 'SELECT * FROM user_payout_methods WHERE user_id = ?', [id]);
  const watch = await all(p, 'SELECT * FROM user_fx_watchlist WHERE user_id = ?', [id]);
  return mapUser(users[0], payouts, watch);
}

export async function findUserByPhone(phone: string): Promise<UserRecord | undefined> {
  const rows = await all(getPool(), 'SELECT id FROM users WHERE phone = ? AND deleted_at IS NULL', [phone]);
  return rows[0] ? getUserById(String(rows[0].id)) : undefined;
}

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  const rows = await all(getPool(), 'SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
  return rows[0] ? getUserById(String(rows[0].id)) : undefined;
}

export async function findUserByGoogleId(googleId: string): Promise<UserRecord | undefined> {
  const rows = await all(getPool(), 'SELECT id FROM users WHERE google_id = ? AND deleted_at IS NULL', [googleId]);
  return rows[0] ? getUserById(String(rows[0].id)) : undefined;
}

export async function insertUser(user: UserRecord): Promise<void> {
  await withTx(async (conn) => {
    await conn.query(
      `INSERT INTO users (id, phone, email, password_hash, google_id, display_name, created_at, deleted_at, banned_at, plan, premium_until, use_persian_digits, debt_reminders, calendar_mode, prefs_updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        user.id,
        user.phone || null,
        user.email || null,
        user.passwordHash || null,
        user.googleId || null,
        user.displayName,
        new Date(user.createdAt),
        user.deletedAt ? new Date(user.deletedAt) : null,
        user.bannedAt ? new Date(user.bannedAt) : null,
        user.plan || 'free',
        user.premiumUntil ? new Date(user.premiumUntil) : null,
        user.usePersianDigits == null ? null : user.usePersianDigits ? 1 : 0,
        user.debtReminders == null ? null : user.debtReminders ? 1 : 0,
        user.calendarMode || null,
        user.prefsUpdatedAt ? new Date(user.prefsUpdatedAt) : null,
      ],
    );
  });
}

export async function updateUser(user: UserRecord): Promise<void> {
  await withTx(async (conn) => {
    await conn.query(
      `UPDATE users SET phone=?, email=?, password_hash=?, google_id=?, display_name=?, deleted_at=?, banned_at=?, plan=?, premium_until=?, use_persian_digits=?, debt_reminders=?, calendar_mode=?, prefs_updated_at=? WHERE id=?`,
      [
        user.phone || null,
        user.email || null,
        user.passwordHash || null,
        user.googleId || null,
        user.displayName,
        user.deletedAt ? new Date(user.deletedAt) : null,
        user.bannedAt ? new Date(user.bannedAt) : null,
        user.plan || 'free',
        user.premiumUntil ? new Date(user.premiumUntil) : null,
        user.usePersianDigits == null ? null : user.usePersianDigits ? 1 : 0,
        user.debtReminders == null ? null : user.debtReminders ? 1 : 0,
        user.calendarMode || null,
        user.prefsUpdatedAt ? new Date(user.prefsUpdatedAt) : null,
        user.id,
      ],
    );
    await conn.query('DELETE FROM user_payout_methods WHERE user_id=?', [user.id]);
    await conn.query('DELETE FROM user_fx_watchlist WHERE user_id=?', [user.id]);
    if (user.payoutMethods?.length) {
      await insertRows(
        conn,
        'user_payout_methods',
        ['id', 'user_id', 'label', 'card_number', 'sheba', 'card_holder_name', 'bank_name', 'account_number', 'is_default'],
        user.payoutMethods
          .filter((m) => (m.cardNumber || '').replace(/\D/g, '').length === 16)
          .map((m) => [
            m.id,
            user.id,
            m.label || null,
            m.cardNumber.replace(/\D/g, '').slice(0, 16),
            m.sheba || null,
            m.cardHolderName || null,
            m.bankName || null,
            m.accountNumber || null,
            m.isDefault ? 1 : 0,
          ]),
      );
    }
    if (user.fxWatchlist?.length) {
      await insertRows(
        conn,
        'user_fx_watchlist',
        ['user_id', 'code'],
        user.fxWatchlist.map((code) => [user.id, code]),
      );
    }
  });
}

export async function insertSession(row: {
  id: string;
  userId: string;
  deviceId: string;
  token: string;
  createdAt: string;
}): Promise<void> {
  await getPool().query(
    'INSERT INTO sessions (id, user_id, device_id, token, created_at) VALUES (?,?,?,?,?)',
    [row.id, row.userId, row.deviceId, row.token, new Date(row.createdAt)],
  );
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await getPool().query('DELETE FROM sessions WHERE token=?', [token]);
}

export async function deleteSessionsForUser(userId: string): Promise<void> {
  await getPool().query('DELETE FROM sessions WHERE user_id=?', [userId]);
}

export async function findSession(token: string, userId: string): Promise<boolean> {
  const rows = await all(getPool(), 'SELECT id FROM sessions WHERE token=? AND user_id=?', [token, userId]);
  return rows.length > 0;
}

export async function storeOtp(phone: string, code: string, expiresAt: number): Promise<void> {
  await getPool().query(
    'INSERT INTO otps (phone, code, expires_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE code=VALUES(code), expires_at=VALUES(expires_at)',
    [phone, code, expiresAt],
  );
}

export async function consumeOtp(phone: string, code: string): Promise<boolean> {
  return withTx(async (conn) => {
    const rows = await all(conn, 'SELECT code, expires_at FROM otps WHERE phone=?', [phone]);
    const row = rows[0];
    if (!row || String(row.code) !== code || Number(row.expires_at) < Date.now()) return false;
    await conn.query('DELETE FROM otps WHERE phone=?', [phone]);
    return true;
  });
}

export async function extraAdminPhones(): Promise<string[]> {
  const rows = await all(getPool(), 'SELECT phone FROM platform_admin_phones');
  return rows.map((r) => String(r.phone));
}

export async function setExtraAdminPhones(phones: string[]): Promise<void> {
  await withTx(async (conn) => {
    await conn.query('DELETE FROM platform_admin_phones');
    if (phones.length) {
      await insertRows(
        conn,
        'platform_admin_phones',
        ['phone'],
        phones.map((p) => [p]),
      );
    }
  });
}

export async function getPeriod(id: string): Promise<PeriodRecord | undefined> {
  const rows = await all(getPool(), 'SELECT * FROM periods WHERE id = ? COLLATE utf8mb4_bin', [id]);
  return rows[0] ? mapPeriod(rows[0]) : undefined;
}

export async function listPeriodsForUser(userId: string, phone?: string, email?: string): Promise<PeriodRecord[]> {
  const rows = await all(
    getPool(),
    `SELECT DISTINCT p.* FROM periods p
     LEFT JOIN members m ON m.period_id = p.id
     WHERE p.owner_id = ? OR m.user_id = ? OR (? IS NOT NULL AND m.phone = ?) OR (? IS NOT NULL AND m.email = ?)`,
    [userId, userId, phone || null, phone || null, email || null, email || null],
  );
  return rows.map(mapPeriod);
}

export async function insertPeriod(period: PeriodRecord): Promise<void> {
  await getPool().query(
    `INSERT INTO periods (id, title, currency, owner_id, created_at, updated_at, version, kind, banker_member_id, template, round_to, building_charge, lunch_turn_member_id, encrypted, visibility)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      period.id,
      period.title,
      period.currency,
      period.ownerId,
      new Date(period.createdAt),
      new Date(period.updatedAt),
      period.version,
      period.kind || 'split',
      period.bankerMemberId || null,
      period.template || 'custom',
      period.roundTo ?? 0,
      period.buildingCharge ?? null,
      period.lunchTurnMemberId || null,
      period.encrypted ? 1 : 0,
      period.visibility || 'private',
    ],
  );
}

export async function updatePeriod(period: PeriodRecord): Promise<void> {
  const prev = await getPeriod(period.id);
  await getPool().query(
    `UPDATE periods SET title=?, currency=?, owner_id=?, updated_at=?, version=?, kind=?, banker_member_id=?, template=?, round_to=?, building_charge=?, lunch_turn_member_id=?, encrypted=?, visibility=? WHERE id=?`,
    [
      period.title,
      period.currency,
      period.ownerId,
      new Date(period.updatedAt),
      period.version,
      period.kind || 'split',
      period.bankerMemberId || null,
      period.template || 'custom',
      period.roundTo ?? 0,
      period.buildingCharge ?? null,
      period.lunchTurnMemberId || null,
      period.encrypted ? 1 : 0,
      period.visibility || 'private',
      period.id,
    ],
  );
  if (prev && Boolean(prev.encrypted) !== Boolean(period.encrypted)) {
    await retargetPeriodEncryption(period.id, Boolean(period.encrypted));
  }
}

async function retargetPeriodEncryption(periodId: string, encrypted: boolean): Promise<void> {
  const snap = await loadPeriodSnapshot(periodId);
  if (!snap) return;
  await withTx(async (conn) => {
    for (const m of snap.members) await writeMember(conn, sealMember(openMember(m), encrypted), encrypted);
    for (const e of snap.expenses) await writeExpense(conn, sealExpense(openExpense(e), encrypted), encrypted);
    for (const p of snap.payments) await writePayment(conn, sealPayment(openPayment(p), encrypted), encrypted);
    for (const c of snap.chat) {
      await conn.query('UPDATE chat SET body=? WHERE id=?', [sealIf(encrypted, openField(c.body) || c.body) || c.body, c.id]);
    }
    for (const a of snap.attachments || []) {
      await conn.query('UPDATE attachments SET data_base64=? WHERE id=?', [
        sealIf(encrypted, openField(a.dataBase64) || a.dataBase64) || a.dataBase64,
        a.id,
      ]);
    }
  });
}

export async function bumpPeriodVersion(periodId: string): Promise<number> {
  await getPool().query('UPDATE periods SET version = version + 1, updated_at = ? WHERE id=?', [
    new Date(),
    periodId,
  ]);
  const p = await getPeriod(periodId);
  return p?.version ?? 0;
}

export async function listMembers(periodId: string): Promise<MemberRecord[]> {
  const enc = await periodEncrypted(getPool(), periodId);
  const rows = await all(getPool(), 'SELECT * FROM members WHERE period_id=?', [periodId]);
  return rows.map((r) => (enc ? openMember(mapMember(r)) : mapMember(r)));
}

export async function listMembersByUser(userId: string): Promise<MemberRecord[]> {
  const rows = await all(getPool(), 'SELECT * FROM members WHERE user_id=?', [userId]);
  return Promise.all(
    rows.map(async (r) => {
      const m = mapMember(r);
      const enc = await periodEncrypted(getPool(), m.periodId);
      return enc ? openMember(m) : m;
    }),
  );
}

export async function upsertMember(member: MemberRecord): Promise<void> {
  await withTx(async (conn) => {
    const enc = await periodEncrypted(conn, member.periodId);
    await writeMember(conn, sealMember(member, enc), enc);
  });
}

async function existingUserId(conn: PoolConnection, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const rows = await all(conn, 'SELECT id FROM users WHERE id=?', [userId]);
  return rows[0] ? userId : null;
}

async function writeMember(conn: PoolConnection, m: MemberRecord, _enc: boolean): Promise<void> {
  const userId = await existingUserId(conn, m.userId);
  await conn.query(
    `INSERT INTO members (id, period_id, user_id, guest_key, display_name, weight_default, role, phone, email, card_number, sheba, card_holder_name, bank_name, exclude_from_new, is_pot, unit_label, pot_period)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), guest_key=VALUES(guest_key), display_name=VALUES(display_name), weight_default=VALUES(weight_default), role=VALUES(role), phone=VALUES(phone), email=VALUES(email), card_number=VALUES(card_number), sheba=VALUES(sheba), card_holder_name=VALUES(card_holder_name), bank_name=VALUES(bank_name), exclude_from_new=VALUES(exclude_from_new), is_pot=VALUES(is_pot), unit_label=VALUES(unit_label), pot_period=VALUES(pot_period)`,
    [
      m.id,
      m.periodId,
      userId,
      m.guestKey || null,
      m.displayName,
      m.weightDefault ?? 1,
      m.role,
      m.phone || null,
      m.email || null,
      m.cardNumber || null,
      m.sheba || null,
      m.cardHolderName || null,
      m.bankName || null,
      m.excludeFromNew ? 1 : 0,
      m.isPot ? 1 : 0,
      m.unitLabel || null,
      m.isPot ? m.periodId : null,
    ],
  );
}

export async function deleteMember(id: string): Promise<void> {
  await getPool().query('DELETE FROM members WHERE id=?', [id]);
}

export async function upsertExpense(expense: ExpenseRecord, opts?: { bump?: boolean }): Promise<void> {
  await withTx(async (conn) => {
    const enc = await periodEncrypted(conn, expense.periodId);
    await writeExpense(conn, sealExpense(expense, enc), enc);
  });
  if (opts?.bump !== false) await bumpPeriodVersion(expense.periodId);
}

async function writeExpense(conn: PoolConnection, e: ExpenseRecord, _enc: boolean): Promise<void> {
  await conn.query(
    `INSERT INTO expenses (id, period_id, title, amount, currency, payer_id, split_mode, tax_type, tax_value, service_type, service_value, tip_type, tip_value, note, attachment_id, attachment_data_url, fx_rate, created_at, occurred_at, updated_at, deleted_at, client_id, version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE title=VALUES(title), amount=VALUES(amount), currency=VALUES(currency), payer_id=VALUES(payer_id), split_mode=VALUES(split_mode), tax_type=VALUES(tax_type), tax_value=VALUES(tax_value), service_type=VALUES(service_type), service_value=VALUES(service_value), tip_type=VALUES(tip_type), tip_value=VALUES(tip_value), note=VALUES(note), attachment_id=VALUES(attachment_id), attachment_data_url=VALUES(attachment_data_url), fx_rate=VALUES(fx_rate), occurred_at=VALUES(occurred_at), updated_at=VALUES(updated_at), deleted_at=VALUES(deleted_at), version=VALUES(version)`,
    [
      e.id,
      e.periodId,
      e.title,
      Math.round(e.amount),
      e.currency,
      e.payerId,
      e.splitMode,
      e.tax?.type || 'none',
      e.tax?.value || 0,
      e.service?.type || null,
      e.service?.value ?? null,
      e.tip?.type || null,
      e.tip?.value ?? null,
      e.note || null,
      e.attachmentId || null,
      e.attachmentDataUrl || null,
      e.fxRate ?? 1,
      new Date(e.createdAt),
      e.occurredAt ? new Date(e.occurredAt) : null,
      new Date(e.updatedAt),
      e.deletedAt ? new Date(e.deletedAt) : null,
      e.clientId || null,
      e.version,
    ],
  );
  await conn.query('DELETE FROM expense_payers WHERE expense_id=?', [e.id]);
  await conn.query('DELETE FROM expense_shares WHERE expense_id=?', [e.id]);
  await conn.query('DELETE FROM expense_tags WHERE expense_id=?', [e.id]);
  if (e.payers?.length) {
    await insertRows(
      conn,
      'expense_payers',
      ['expense_id', 'member_id', 'amount'],
      e.payers.map((p) => [e.id, p.memberId, Math.round(p.amount)]),
    );
  }
  if (e.shares?.length) {
    await insertRows(
      conn,
      'expense_shares',
      ['expense_id', 'member_id', 'value', 'excluded'],
      e.shares.map((s) => [e.id, s.memberId, s.value, s.excluded ? 1 : 0]),
    );
  }
  if (e.tags?.length) {
    await insertRows(
      conn,
      'expense_tags',
      ['expense_id', 'tag'],
      e.tags.map((t) => [e.id, t]),
    );
  }
}

export async function upsertPayment(payment: PaymentRecord): Promise<void> {
  await withTx(async (conn) => {
    const enc = await periodEncrypted(conn, payment.periodId);
    await writePayment(conn, sealPayment(payment, enc), enc);
  });
  await bumpPeriodVersion(payment.periodId);
}

async function writePayment(conn: PoolConnection, p: PaymentRecord, _enc: boolean): Promise<void> {
  await conn.query(
    `INSERT INTO payments (id, period_id, from_member_id, to_member_id, amount, currency, kind, note, fx_rate, created_at, updated_at, deleted_at, version, status, receipt_data_url, index_asset, index_rate_at_create, pending_edge)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE amount=VALUES(amount), currency=VALUES(currency), kind=VALUES(kind), note=VALUES(note), fx_rate=VALUES(fx_rate), updated_at=VALUES(updated_at), deleted_at=VALUES(deleted_at), version=VALUES(version), status=VALUES(status), receipt_data_url=VALUES(receipt_data_url), index_asset=VALUES(index_asset), index_rate_at_create=VALUES(index_rate_at_create), pending_edge=VALUES(pending_edge)`,
    [
      p.id,
      p.periodId,
      p.fromMemberId,
      p.toMemberId,
      Math.round(p.amount),
      p.currency,
      p.kind,
      p.note || null,
      p.fxRate ?? 1,
      new Date(p.createdAt),
      new Date(p.updatedAt),
      p.deletedAt ? new Date(p.deletedAt) : null,
      p.version,
      p.status || 'settled',
      p.receiptDataUrl || null,
      p.indexAsset || 'none',
      p.indexRateAtCreate ?? null,
      (p.status || 'settled') === 'pending_confirm' && !p.deletedAt
        ? `${p.periodId}#${p.fromMemberId}#${p.toMemberId}`
        : null,
    ],
  );
}

export async function insertChat(msg: ChatMessageRecord): Promise<void> {
  const enc = await periodEncrypted(getPool(), msg.periodId);
  await getPool().query(
    'INSERT INTO chat (id, period_id, sender_member_id, body, expense_id, created_at) VALUES (?,?,?,?,?,?)',
    [msg.id, msg.periodId, msg.senderMemberId, sealIf(enc, msg.body) || msg.body, msg.expenseId || null, new Date(msg.createdAt)],
  );
  await bumpPeriodVersion(msg.periodId);
}

export async function listChat(periodId: string): Promise<ChatMessageRecord[]> {
  const enc = await periodEncrypted(getPool(), periodId);
  const rows = await all(getPool(), 'SELECT * FROM chat WHERE period_id=? ORDER BY created_at', [periodId]);
  return rows.map((row) => ({
    id: String(row.id),
    periodId,
    senderMemberId: String(row.sender_member_id),
    body: enc ? openField(String(row.body)) || '' : String(row.body),
    expenseId: row.expense_id ? String(row.expense_id) : undefined,
    createdAt: new Date(row.created_at as Date).toISOString(),
  }));
}

export async function insertInvite(invite: InviteRecord): Promise<void> {
  await getPool().query(
    'INSERT INTO invites (token, period_id, created_by, created_at, expires_at) VALUES (?,?,?,?,?)',
    [
      invite.token,
      invite.periodId,
      invite.createdBy,
      new Date(invite.createdAt),
      invite.expiresAt ? new Date(invite.expiresAt) : null,
    ],
  );
}

export async function getInvite(token: string): Promise<InviteRecord | undefined> {
  const rows = await all(getPool(), 'SELECT * FROM invites WHERE token=?', [token]);
  if (!rows[0]) return undefined;
  const row = rows[0];
  return {
    token: String(row.token),
    periodId: String(row.period_id).trim(),
    createdBy: String(row.created_by),
    createdAt: new Date(row.created_at as Date).toISOString(),
    expiresAt: row.expires_at ? new Date(row.expires_at as Date).toISOString() : undefined,
  };
}

export async function insertAttachment(a: AttachmentRecord): Promise<void> {
  const enc = await periodEncrypted(getPool(), a.periodId);
  await getPool().query(
    'INSERT INTO attachments (id, period_id, mime, data_base64, created_at) VALUES (?,?,?,?,?)',
    [a.id, a.periodId, a.mime, sealIf(enc, a.dataBase64) || a.dataBase64, new Date(a.createdAt)],
  );
}

export async function getAttachment(id: string): Promise<AttachmentRecord | undefined> {
  const rows = await all(getPool(), 'SELECT * FROM attachments WHERE id=?', [id]);
  if (!rows[0]) return undefined;
  const row = rows[0];
  const periodId = String(row.period_id).trim();
  const enc = await periodEncrypted(getPool(), periodId);
  const data = String(row.data_base64);
  return {
    id: String(row.id),
    periodId,
    mime: String(row.mime),
    dataBase64: enc ? openField(data) || '' : data,
    createdAt: new Date(row.created_at as Date).toISOString(),
  };
}

export async function listFriends(userId: string): Promise<FriendRecord[]> {
  const rows = await all(getPool(), 'SELECT * FROM friends WHERE user_id=?', [userId]);
  return rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    friendUserId: row.friend_user_id ? String(row.friend_user_id) : undefined,
    displayName: String(row.display_name),
    phone: row.phone ? String(row.phone) : undefined,
    email: row.email ? String(row.email) : undefined,
  }));
}

export async function upsertFriend(f: FriendRecord): Promise<void> {
  await getPool().query(
    `INSERT INTO friends (id, user_id, friend_user_id, display_name, phone, email) VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), phone=VALUES(phone), email=VALUES(email), friend_user_id=VALUES(friend_user_id)`,
    [f.id, f.userId, f.friendUserId || null, f.displayName, f.phone || null, f.email || null],
  );
}

export async function deleteFriend(id: string, userId: string): Promise<void> {
  await getPool().query('DELETE FROM friends WHERE id=? AND user_id=?', [id, userId]);
}

export async function listNotifications(userId: string, limit = 100) {
  const rows = await all(
    getPool(),
    'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ?',
    [userId, limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    title: String(row.title),
    body: String(row.body),
    read: Boolean(row.is_read),
    createdAt: new Date(row.created_at as Date).toISOString(),
  }));
}

export async function insertNotification(n: {
  id?: string;
  userId: string;
  title: string;
  body: string;
  read?: boolean;
  createdAt?: string;
}): Promise<void> {
  await getPool().query(
    'INSERT INTO notifications (id, user_id, title, body, is_read, created_at) VALUES (?,?,?,?,?,?)',
    [n.id || nanoid(), n.userId, n.title, n.body, n.read ? 1 : 0, new Date(n.createdAt || Date.now())],
  );
}

export async function markNotificationRead(id: string, userId: string): Promise<void> {
  await getPool().query('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [id, userId]);
}

export async function upsertRecurring(rule: DbShape['recurring'][number], opts?: { bump?: boolean }): Promise<void> {
  await withTx(async (conn) => {
    await conn.query(
      `INSERT INTO recurring (id, period_id, title, amount, currency, payer_id, split_mode, interval_days, cadence, next_at, active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE title=VALUES(title), amount=VALUES(amount), currency=VALUES(currency), payer_id=VALUES(payer_id), split_mode=VALUES(split_mode), interval_days=VALUES(interval_days), cadence=VALUES(cadence), next_at=VALUES(next_at), active=VALUES(active)`,
      [
        rule.id,
        rule.periodId,
        rule.title,
        Math.round(rule.amount),
        rule.currency,
        rule.payerId,
        rule.splitMode,
        rule.intervalDays,
        rule.cadence || null,
        new Date(rule.nextAt),
        rule.active ? 1 : 0,
      ],
    );
    await conn.query('DELETE FROM recurring_shares WHERE recurring_id=?', [rule.id]);
    if (rule.shares?.length) {
      await insertRows(
        conn,
        'recurring_shares',
        ['recurring_id', 'member_id', 'value', 'excluded'],
        rule.shares.map((s) => [rule.id, s.memberId, s.value, s.excluded ? 1 : 0]),
      );
    }
  });
  if (opts?.bump !== false) await bumpPeriodVersion(rule.periodId);
}

export async function insertActivity(a: ActivityRecord): Promise<void> {
  await getPool().query(
    'INSERT INTO activity (id, period_id, actor_name, action, summary, created_at, entity_id) VALUES (?,?,?,?,?,?,?)',
    [a.id, a.periodId, a.actorName, a.action, a.summary, new Date(a.createdAt), a.entityId || null],
  );
}

export type PeriodSnapshot = {
  period: PeriodRecord;
  members: MemberRecord[];
  expenses: ExpenseRecord[];
  payments: PaymentRecord[];
  chat: ChatMessageRecord[];
  invites: InviteRecord[];
  recurring: DbShape['recurring'];
  activity: ActivityRecord[];
  attachments: AttachmentRecord[];
  version: number;
};

export async function loadPeriodSnapshot(periodId: string): Promise<PeriodSnapshot | null> {
  const period = await getPeriod(periodId);
  if (!period) return null;
  const enc = Boolean(period.encrypted);
  const p = getPool();
  const [members, expenses, payers, shares, tags, payments, chat, invites, recurring, recShares, activity, attachments] =
    await Promise.all([
      all(p, 'SELECT * FROM members WHERE period_id=?', [periodId]),
      all(p, 'SELECT * FROM expenses WHERE period_id=?', [periodId]),
      all(
        p,
        'SELECT ep.* FROM expense_payers ep JOIN expenses e ON e.id=ep.expense_id WHERE e.period_id=?',
        [periodId],
      ),
      all(
        p,
        'SELECT es.* FROM expense_shares es JOIN expenses e ON e.id=es.expense_id WHERE e.period_id=?',
        [periodId],
      ),
      all(p, 'SELECT et.* FROM expense_tags et JOIN expenses e ON e.id=et.expense_id WHERE e.period_id=?', [periodId]),
      all(p, 'SELECT * FROM payments WHERE period_id=?', [periodId]),
      all(p, 'SELECT * FROM chat WHERE period_id=? ORDER BY created_at', [periodId]),
      all(p, 'SELECT * FROM invites WHERE period_id=?', [periodId]),
      all(p, 'SELECT * FROM recurring WHERE period_id=?', [periodId]),
      all(
        p,
        'SELECT rs.* FROM recurring_shares rs JOIN recurring r ON r.id=rs.recurring_id WHERE r.period_id=?',
        [periodId],
      ),
      all(p, 'SELECT * FROM activity WHERE period_id=? ORDER BY created_at', [periodId]),
      all(p, 'SELECT * FROM attachments WHERE period_id=?', [periodId]),
    ]);
  const payersBy = group(payers, 'expense_id');
  const sharesBy = group(shares, 'expense_id');
  const tagsBy = group(tags, 'expense_id');
  const recBy = group(recShares, 'recurring_id');
  const mappedExpenses = expenses.map((row) => {
    const e = mapExpense(row, payersBy.get(String(row.id)) || [], sharesBy.get(String(row.id)) || [], tagsBy.get(String(row.id)) || []);
    return enc ? openExpense(e) : e;
  });
  return {
    period,
    members: members.map((r) => (enc ? openMember(mapMember(r)) : mapMember(r))),
    expenses: mappedExpenses,
    payments: payments.map((r) => (enc ? openPayment(mapPayment(r)) : mapPayment(r))),
    chat: chat.map((row) => ({
      id: String(row.id),
      periodId,
      senderMemberId: String(row.sender_member_id),
      body: enc ? openField(String(row.body)) || '' : String(row.body),
      expenseId: row.expense_id ? String(row.expense_id) : undefined,
      createdAt: new Date(row.created_at as Date).toISOString(),
    })),
    invites: invites.map((row) => ({
      token: String(row.token),
      periodId,
      createdBy: String(row.created_by),
      createdAt: new Date(row.created_at as Date).toISOString(),
      expiresAt: row.expires_at ? new Date(row.expires_at as Date).toISOString() : undefined,
    })),
    recurring: recurring.map((row) => ({
      id: String(row.id),
      periodId,
      title: String(row.title),
      amount: Number(row.amount),
      currency: String(row.currency),
      payerId: String(row.payer_id),
      splitMode: String(row.split_mode) as ExpenseRecord['splitMode'],
      shares: (recBy.get(String(row.id)) || []).map((s) => ({
        memberId: String(s.member_id),
        value: Number(s.value),
        excluded: Boolean(s.excluded) || undefined,
      })),
      intervalDays: Number(row.interval_days),
      cadence: row.cadence as DbShape['recurring'][number]['cadence'],
      nextAt: new Date(row.next_at as Date).toISOString(),
      active: Boolean(row.active),
    })),
    activity: activity.map((row) => ({
      id: String(row.id),
      periodId,
      actorName: String(row.actor_name),
      action: String(row.action),
      summary: String(row.summary),
      createdAt: new Date(row.created_at as Date).toISOString(),
      entityId: row.entity_id ? String(row.entity_id) : undefined,
    })),
    attachments: attachments.map((row) => ({
      id: String(row.id),
      periodId,
      mime: String(row.mime),
      dataBase64: enc ? openField(String(row.data_base64)) || '' : String(row.data_base64),
      createdAt: new Date(row.created_at as Date).toISOString(),
    })),
    version: period.version,
  };
}

function group(rows: Row[], key: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const id = String(row[key]);
    const list = map.get(id) || [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

export async function notifyPeriodMembers(periodId: string, exceptUserId: string, title: string, body: string): Promise<void> {
  const members = await listMembers(periodId);
  for (const m of members) {
    if (!m.userId || m.userId === exceptUserId) continue;
    await insertNotification({ userId: m.userId, title, body });
  }
}

export async function claimMemberships(user: UserRecord): Promise<void> {
  const phone = user.phone || null;
  const email = user.email || null;
  if (!phone && !email) return;
  await getPool().query(
    `UPDATE members SET user_id=? WHERE user_id IS NULL AND ((? IS NOT NULL AND phone=?) OR (? IS NOT NULL AND email=?))`,
    [user.id, phone, phone, email, email],
  );
}

export async function listPeriodIds(): Promise<string[]> {
  const rows = await all(getPool(), 'SELECT id FROM periods');
  return rows.map((r) => String(r.id));
}

export async function listAllPeriods(): Promise<PeriodRecord[]> {
  const rows = await all(getPool(), 'SELECT * FROM periods ORDER BY updated_at DESC');
  return rows.map(mapPeriod);
}

export async function listUsers(q?: string): Promise<UserRecord[]> {
  const needle = (q || '').trim().toLowerCase();
  const rows = needle
    ? await all(
        getPool(),
        `SELECT * FROM users WHERE LOWER(CONCAT(id, ' ', display_name, ' ', COALESCE(phone,''), ' ', COALESCE(email,''), ' ', COALESCE(plan,''))) LIKE ? ORDER BY created_at DESC`,
        [`%${needle}%`],
      )
    : await all(getPool(), 'SELECT * FROM users ORDER BY created_at DESC');
  return rows.map((row) => mapUser(row, [], []));
}

export async function listActiveUserIds(): Promise<string[]> {
  const rows = await all(getPool(), 'SELECT id FROM users WHERE deleted_at IS NULL');
  return rows.map((r) => String(r.id));
}

export async function adminCounts() {
  const [users, periods, expenses, payments, sessions, zarinpal, telegram] = await Promise.all([
    all(
      getPool(),
      `SELECT
        SUM(deleted_at IS NULL AND banned_at IS NULL) AS active,
        SUM(deleted_at IS NOT NULL) AS deleted,
        SUM(deleted_at IS NULL AND banned_at IS NULL AND plan='premium' AND (premium_until IS NULL OR premium_until > UTC_TIMESTAMP())) AS premium
       FROM users`,
    ),
    all(getPool(), 'SELECT COUNT(*) AS n FROM periods'),
    all(getPool(), 'SELECT COUNT(*) AS n FROM expenses WHERE deleted_at IS NULL'),
    all(getPool(), 'SELECT COUNT(*) AS n FROM payments WHERE deleted_at IS NULL'),
    all(getPool(), 'SELECT COUNT(*) AS n FROM sessions'),
    all(getPool(), 'SELECT COUNT(*) AS n FROM zarinpal_pending'),
    all(getPool(), 'SELECT COUNT(*) AS n FROM telegram_links'),
  ]);
  return {
    usersActive: Number(users[0]?.active || 0),
    usersDeleted: Number(users[0]?.deleted || 0),
    usersPremium: Number(users[0]?.premium || 0),
    periods: Number(periods[0]?.n || 0),
    expenses: Number(expenses[0]?.n || 0),
    payments: Number(payments[0]?.n || 0),
    sessions: Number(sessions[0]?.n || 0),
    zarinpalPending: Number(zarinpal[0]?.n || 0),
    telegramLinks: Number(telegram[0]?.n || 0),
  };
}

export async function listAdminPeriods(q?: string) {
  const needle = (q || '').trim().toLowerCase();
  const rows = needle
    ? await all(
        getPool(),
        `SELECT p.*, u.display_name AS owner_name,
          (SELECT COUNT(*) FROM members m WHERE m.period_id = p.id) AS member_count,
          (SELECT COUNT(*) FROM expenses e WHERE e.period_id = p.id AND e.deleted_at IS NULL) AS expense_count
         FROM periods p
         LEFT JOIN users u ON u.id = p.owner_id
         WHERE LOWER(CONCAT(p.id, ' ', p.title, ' ', p.currency, ' ', COALESCE(u.display_name,''), ' ', COALESCE(u.phone,''))) LIKE ?
         ORDER BY p.updated_at DESC`,
        [`%${needle}%`],
      )
    : await all(
        getPool(),
        `SELECT p.*, u.display_name AS owner_name,
          (SELECT COUNT(*) FROM members m WHERE m.period_id = p.id) AS member_count,
          (SELECT COUNT(*) FROM expenses e WHERE e.period_id = p.id AND e.deleted_at IS NULL) AS expense_count
         FROM periods p
         LEFT JOIN users u ON u.id = p.owner_id
         ORDER BY p.updated_at DESC`,
      );
  return rows.map((row) => ({
    ...mapPeriod(row),
    ownerName: row.owner_name ? String(row.owner_name) : undefined,
    memberCount: Number(row.member_count || 0),
    expenseCount: Number(row.expense_count || 0),
  }));
}

export async function getMember(id: string): Promise<MemberRecord | undefined> {
  const rows = await all(getPool(), 'SELECT * FROM members WHERE id=?', [id]);
  if (!rows[0]) return undefined;
  const m = mapMember(rows[0]);
  return (await periodEncrypted(getPool(), m.periodId)) ? openMember(m) : m;
}

export async function getExpense(id: string): Promise<ExpenseRecord | undefined> {
  const rows = await all(getPool(), 'SELECT * FROM expenses WHERE id=?', [id]);
  if (!rows[0]) return undefined;
  const [payers, shares, tags] = await Promise.all([
    all(getPool(), 'SELECT * FROM expense_payers WHERE expense_id=?', [id]),
    all(getPool(), 'SELECT * FROM expense_shares WHERE expense_id=?', [id]),
    all(getPool(), 'SELECT * FROM expense_tags WHERE expense_id=?', [id]),
  ]);
  const e = mapExpense(rows[0], payers, shares, tags);
  return (await periodEncrypted(getPool(), e.periodId)) ? openExpense(e) : e;
}

export async function getPayment(id: string): Promise<PaymentRecord | undefined> {
  const rows = await all(getPool(), 'SELECT * FROM payments WHERE id=?', [id]);
  if (!rows[0]) return undefined;
  const p = mapPayment(rows[0]);
  return (await periodEncrypted(getPool(), p.periodId)) ? openPayment(p) : p;
}

export async function hasPendingPayment(
  periodId: string,
  fromMemberId: string,
  toMemberId: string,
  exceptId?: string,
): Promise<boolean> {
  const rows = await all(
    getPool(),
    `SELECT id FROM payments WHERE period_id=? AND from_member_id=? AND to_member_id=? AND status='pending_confirm' AND deleted_at IS NULL AND id <> ?`,
    [periodId, fromMemberId, toMemberId, exceptId || ''],
  );
  return rows.length > 0;
}

export type RecurringRule = DbShape['recurring'][number];

export async function getRecurring(id: string): Promise<RecurringRule | undefined> {
  const rows = await all(getPool(), 'SELECT * FROM recurring WHERE id=?', [id]);
  if (!rows[0]) return undefined;
  const shares = await all(getPool(), 'SELECT * FROM recurring_shares WHERE recurring_id=?', [id]);
  return mapRecurring(rows[0], shares);
}

export async function listDueRecurring(periodId: string, now = new Date()): Promise<RecurringRule[]> {
  const rows = await all(
    getPool(),
    'SELECT * FROM recurring WHERE period_id=? AND active=1 AND next_at <= ?',
    [periodId, now],
  );
  return Promise.all(
    rows.map(async (row) => {
      const shares = await all(getPool(), 'SELECT * FROM recurring_shares WHERE recurring_id=?', [row.id]);
      return mapRecurring(row, shares);
    }),
  );
}

function mapRecurring(row: Row, shares: Row[]): RecurringRule {
  return {
    id: String(row.id),
    periodId: String(row.period_id).trim(),
    title: String(row.title),
    amount: Number(row.amount),
    currency: String(row.currency),
    payerId: String(row.payer_id),
    splitMode: String(row.split_mode) as ExpenseRecord['splitMode'],
    shares: shares.map((s) => ({
      memberId: String(s.member_id),
      value: Number(s.value),
      excluded: Boolean(s.excluded) || undefined,
    })),
    intervalDays: Number(row.interval_days),
    cadence: row.cadence as RecurringRule['cadence'],
    nextAt: new Date(row.next_at as Date).toISOString(),
    active: Boolean(row.active),
  };
}

export async function deleteChat(id: string): Promise<void> {
  await getPool().query('DELETE FROM chat WHERE id=?', [id]);
}

export async function deleteInvite(token: string): Promise<void> {
  await getPool().query('DELETE FROM invites WHERE token=?', [token]);
}

export async function deleteRecurring(id: string): Promise<void> {
  await getPool().query('DELETE FROM recurring WHERE id=?', [id]);
}

export async function deleteAttachment(id: string): Promise<void> {
  await getPool().query('DELETE FROM attachments WHERE id=?', [id]);
}

export async function deletePeriodCascade(periodId: string): Promise<void> {
  await getPool().query('DELETE FROM periods WHERE id=?', [periodId]);
}

export async function transferPeriodOwner(periodId: string, newOwnerUserId: string): Promise<void> {
  const period = await getPeriod(periodId);
  if (!period) return;
  period.ownerId = newOwnerUserId;
  period.updatedAt = new Date().toISOString();
  await updatePeriod(period);
  const members = await listMembers(periodId);
  for (const m of members) {
    const next = {
      ...m,
      role: m.userId === newOwnerUserId ? ('owner' as const) : m.role === 'owner' ? ('member' as const) : m.role,
    };
    if (next.role !== m.role) await upsertMember(next);
  }
}

export async function listSessionsForUser(userId: string) {
  const rows = await all(getPool(), 'SELECT id, user_id, device_id, created_at FROM sessions WHERE user_id=?', [userId]);
  return rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    deviceId: String(row.device_id),
    createdAt: new Date(row.created_at as Date).toISOString(),
  }));
}

export async function deleteSessionsForUserExcept(userId: string, keepToken?: string | null): Promise<void> {
  if (keepToken) {
    await getPool().query('DELETE FROM sessions WHERE user_id=? AND token <> ?', [userId, keepToken]);
    return;
  }
  await deleteSessionsForUser(userId);
}

export async function countSessions(): Promise<number> {
  const rows = await all(getPool(), 'SELECT COUNT(*) AS n FROM sessions');
  return Number(rows[0]?.n || 0);
}

export async function countActiveOtps(now = Date.now()): Promise<number> {
  const rows = await all(getPool(), 'SELECT COUNT(*) AS n FROM otps WHERE expires_at > ?', [now]);
  return Number(rows[0]?.n || 0);
}

export async function getFxCache(): Promise<DbShape['fxCache']> {
  const [cache, rates] = await Promise.all([
    all(getPool(), 'SELECT * FROM fx_cache WHERE id=1'),
    all(getPool(), 'SELECT * FROM fx_rates'),
  ]);
  if (!cache[0]) return undefined;
  const mapped: Record<string, number> = {};
  for (const r of rates) mapped[String(r.code)] = Number(r.rate);
  return {
    rates: mapped,
    fetchedAt: new Date(cache[0].fetched_at as Date).toISOString(),
    source: cache[0].source ? String(cache[0].source) : undefined,
  };
}

export async function setFxCache(cache: NonNullable<DbShape['fxCache']>): Promise<void> {
  await withTx(async (conn) => {
    await conn.query(
      'INSERT INTO fx_cache (id, fetched_at, source) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE fetched_at=VALUES(fetched_at), source=VALUES(source)',
      [new Date(cache.fetchedAt), cache.source || null],
    );
    await conn.query('DELETE FROM fx_rates');
    if (Object.keys(cache.rates).length) {
      await insertRows(
        conn,
        'fx_rates',
        ['code', 'rate'],
        Object.entries(cache.rates).map(([code, rate]) => [code, rate]),
      );
    }
  });
}

export async function insertZarinpalPending(row: {
  authority: string;
  userId: string;
  sku: string;
  amount: number;
  createdAt?: string;
}): Promise<void> {
  await getPool().query(
    'INSERT INTO zarinpal_pending (authority, user_id, sku, amount, created_at) VALUES (?,?,?,?,?)',
    [row.authority, row.userId, row.sku, Math.round(row.amount), new Date(row.createdAt || Date.now())],
  );
}

export async function getZarinpalPending(authority: string) {
  const rows = await all(getPool(), 'SELECT * FROM zarinpal_pending WHERE authority=?', [authority]);
  if (!rows[0]) return undefined;
  return {
    authority: String(rows[0].authority),
    userId: String(rows[0].user_id),
    sku: String(rows[0].sku),
    amount: Number(rows[0].amount),
    createdAt: new Date(rows[0].created_at as Date).toISOString(),
  };
}

export async function listZarinpalPending() {
  const rows = await all(getPool(), 'SELECT * FROM zarinpal_pending ORDER BY created_at DESC');
  return rows.map((row) => ({
    authority: String(row.authority),
    userId: String(row.user_id),
    sku: String(row.sku),
    amount: Number(row.amount),
    createdAt: new Date(row.created_at as Date).toISOString(),
  }));
}

export async function deleteZarinpalPending(authority: string): Promise<void> {
  await getPool().query('DELETE FROM zarinpal_pending WHERE authority=?', [authority]);
}

export async function deleteZarinpalPendingForUserSku(userId: string, sku: string): Promise<void> {
  await getPool().query('DELETE FROM zarinpal_pending WHERE user_id=? AND sku=?', [userId, sku]);
}

export async function insertBillingEvent(e: {
  id?: string;
  userId: string;
  source: 'bazaar' | 'myket' | 'zarinpal' | 'admin';
  sku?: string;
  amount?: number;
  until: string;
  createdAt?: string;
}): Promise<void> {
  await getPool().query(
    'INSERT INTO billing_events (id, user_id, source, sku, amount, until_at, created_at) VALUES (?,?,?,?,?,?,?)',
    [
      e.id || nanoid(),
      e.userId,
      e.source,
      e.sku || null,
      e.amount == null ? null : Math.round(e.amount),
      new Date(e.until),
      new Date(e.createdAt || Date.now()),
    ],
  );
}

export async function listBillingEvents() {
  const rows = await all(getPool(), 'SELECT * FROM billing_events ORDER BY created_at DESC');
  return rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    source: String(row.source) as 'bazaar' | 'myket' | 'zarinpal' | 'admin',
    sku: row.sku ? String(row.sku) : undefined,
    amount: row.amount == null ? undefined : Number(row.amount),
    until: new Date(row.until_at as Date).toISOString(),
    createdAt: new Date(row.created_at as Date).toISOString(),
  }));
}

export async function upsertTelegramLink(link: {
  chatId: string;
  periodId: string;
  payerMemberId?: string;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO telegram_links (chat_id, period_id, payer_member_id) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE period_id=VALUES(period_id), payer_member_id=VALUES(payer_member_id)`,
    [link.chatId, link.periodId, link.payerMemberId || null],
  );
}

export async function getTelegramLink(chatId: string) {
  const rows = await all(getPool(), 'SELECT * FROM telegram_links WHERE chat_id=?', [chatId]);
  if (!rows[0]) return undefined;
  return {
    chatId: String(rows[0].chat_id),
    periodId: String(rows[0].period_id).trim(),
    payerMemberId: rows[0].payer_member_id ? String(rows[0].payer_member_id) : undefined,
  };
}

export async function listTelegramLinks() {
  const rows = await all(getPool(), 'SELECT * FROM telegram_links');
  return rows.map((row) => ({
    chatId: String(row.chat_id),
    periodId: String(row.period_id).trim(),
    payerMemberId: row.payer_member_id ? String(row.payer_member_id) : undefined,
  }));
}

export async function deleteTelegramLink(chatId: string): Promise<void> {
  await getPool().query('DELETE FROM telegram_links WHERE chat_id=?', [chatId]);
}

export async function getShebaDay(identity: string, day: string) {
  const days = await all(getPool(), 'SELECT * FROM sheba_lookup_days WHERE identity=? AND day=?', [identity, day]);
  const cacheRows = await all(getPool(), 'SELECT * FROM sheba_lookup_cache WHERE identity=?', [identity]);
  const cache: Record<string, {
    iban: string;
    depositNumber: string;
    bank: string;
    bankName: string;
    bankCode: string;
    holderName: string;
  }> = {};
  for (const c of cacheRows) {
    cache[String(c.card_hash)] = {
      iban: String(c.iban),
      depositNumber: String(c.deposit_number || ''),
      bank: String(c.bank || ''),
      bankName: String(c.bank_name || ''),
      bankCode: String(c.bank_code || ''),
      holderName: String(c.holder_name || ''),
    };
  }
  return {
    identity,
    day,
    count: days[0] ? Number(days[0].lookup_count) : 0,
    cache,
  };
}

export async function upsertShebaLookup(row: {
  identity: string;
  day: string;
  count: number;
  cache: Record<string, {
    iban: string;
    depositNumber: string;
    bank: string;
    bankName: string;
    bankCode: string;
    holderName: string;
  }>;
}): Promise<void> {
  await withTx(async (conn) => {
    await conn.query(
      `INSERT INTO sheba_lookup_days (identity, day, lookup_count) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE lookup_count=VALUES(lookup_count)`,
      [row.identity, row.day, row.count],
    );
    for (const [hash, c] of Object.entries(row.cache || {})) {
      await conn.query(
        `INSERT INTO sheba_lookup_cache (identity, day, card_hash, iban, deposit_number, bank, bank_name, bank_code, holder_name)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE iban=VALUES(iban), deposit_number=VALUES(deposit_number), bank=VALUES(bank), bank_name=VALUES(bank_name), bank_code=VALUES(bank_code), holder_name=VALUES(holder_name)`,
        [row.identity, row.day, hash, c.iban, c.depositNumber || null, c.bank || null, c.bankName || null, c.bankCode || null, c.holderName || null],
      );
    }
  });
}

export async function listShebaLookups() {
  const rows = await all(getPool(), 'SELECT identity, day, lookup_count FROM sheba_lookup_days');
  return rows.map((row) => ({
    identity: String(row.identity),
    day: String(row.day).trim(),
    count: Number(row.lookup_count),
  }));
}

export async function insertAdminAudit(row: {
  id?: string;
  actorUserId: string;
  actorPhone?: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt?: string;
}): Promise<void> {
  await getPool().query(
    'INSERT INTO admin_audit (id, actor_user_id, actor_phone, action, target_type, target_id, summary, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [
      row.id || nanoid(),
      row.actorUserId,
      row.actorPhone || null,
      row.action,
      row.targetType,
      row.targetId,
      row.summary,
      new Date(row.createdAt || Date.now()),
    ],
  );
}

export async function listAdminAudit() {
  const rows = await all(getPool(), 'SELECT * FROM admin_audit ORDER BY created_at DESC');
  return rows.map((row) => ({
    id: String(row.id),
    actorUserId: String(row.actor_user_id),
    actorPhone: row.actor_phone ? String(row.actor_phone) : undefined,
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: String(row.target_id),
    summary: String(row.summary),
    createdAt: new Date(row.created_at as Date).toISOString(),
  }));
}

export async function insertImpersonationTicket(t: {
  code: string;
  userId: string;
  actorUserId: string;
  expiresAt: number;
  token?: string;
  consumedAt?: number;
}): Promise<void> {
  await getPool().query(
    'INSERT INTO impersonation_tickets (code, user_id, actor_user_id, expires_at, token, consumed_at) VALUES (?,?,?,?,?,?)',
    [t.code, t.userId, t.actorUserId, t.expiresAt, t.token || null, t.consumedAt ?? null],
  );
}

export async function getImpersonationTicket(code: string) {
  const rows = await all(getPool(), 'SELECT * FROM impersonation_tickets WHERE code=?', [code]);
  if (!rows[0]) return undefined;
  return {
    code: String(rows[0].code),
    userId: String(rows[0].user_id),
    actorUserId: String(rows[0].actor_user_id),
    expiresAt: Number(rows[0].expires_at),
    token: rows[0].token ? String(rows[0].token) : undefined,
    consumedAt: rows[0].consumed_at == null ? undefined : Number(rows[0].consumed_at),
  };
}

export async function updateImpersonationTicket(t: {
  code: string;
  token?: string;
  consumedAt?: number;
}): Promise<void> {
  await getPool().query('UPDATE impersonation_tickets SET token=?, consumed_at=? WHERE code=?', [
    t.token || null,
    t.consumedAt ?? null,
    t.code,
  ]);
}

export async function purgeImpersonationTickets(now = Date.now()): Promise<void> {
  await getPool().query(
    'DELETE FROM impersonation_tickets WHERE (token IS NULL AND expires_at <= ?) OR (token IS NOT NULL AND consumed_at IS NOT NULL AND consumed_at < ?)',
    [now, now - 15_000],
  );
}

export type SyncApplyOp = {
  entity: 'expense' | 'payment' | 'member' | 'chat' | 'period' | 'activity' | 'recurring';
  action: 'upsert' | 'delete';
  payload: Record<string, unknown>;
};

export async function applyPeriodOps(periodId: string, ops: SyncApplyOp[]): Promise<void> {
  const period = await getPeriod(periodId);
  if (!period) throw new Error('period missing');
  await withTx(async (conn) => {
    const enc = await periodEncrypted(conn, periodId);
    for (const op of ops) {
      if (op.entity === 'expense') {
        const payload = op.payload as unknown as ExpenseRecord;
        if (op.action === 'delete') {
          const existing = await getExpense(payload.id);
          if (existing) {
            existing.deletedAt = new Date().toISOString();
            existing.updatedAt = existing.deletedAt;
            existing.version = (existing.version || 0) + 1;
            await writeExpense(conn, sealExpense(existing, enc), enc);
          }
        } else {
          const prev = await getExpense(payload.id);
          const next: ExpenseRecord = {
            ...(prev || ({} as ExpenseRecord)),
            ...payload,
            periodId,
            tax: payload.tax || prev?.tax || { type: 'none', value: 0 },
            service: payload.service || prev?.service || { type: 'none', value: 0 },
            tip: payload.tip || prev?.tip || { type: 'none', value: 0 },
            tags: payload.tags || prev?.tags || [],
            shares: payload.shares || prev?.shares || [],
            fxRate: payload.fxRate ?? prev?.fxRate ?? 1,
            createdAt: payload.createdAt || prev?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: (payload.version || prev?.version || 0) + 1,
          };
          await writeExpense(conn, sealExpense(next, enc), enc);
        }
      }
      if (op.entity === 'payment') {
        const payload = op.payload as unknown as PaymentRecord;
        if (op.action === 'delete') {
          const existing = await getPayment(payload.id);
          if (existing) {
            existing.deletedAt = new Date().toISOString();
            existing.updatedAt = existing.deletedAt;
            existing.version = (existing.version || 0) + 1;
            await writePayment(conn, sealPayment(existing, enc), enc);
          }
        } else {
          if (payload.status === 'pending_confirm') {
            const dup = await hasPendingPayment(periodId, payload.fromMemberId, payload.toMemberId, payload.id);
            if (dup) continue;
          }
          const prev = await getPayment(payload.id);
          const next: PaymentRecord = {
            ...(prev || ({} as PaymentRecord)),
            ...payload,
            periodId,
            fxRate: payload.fxRate ?? prev?.fxRate ?? 1,
            createdAt: payload.createdAt || prev?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: (payload.version || prev?.version || 0) + 1,
          };
          await writePayment(conn, sealPayment(next, enc), enc);
        }
      }
      if (op.entity === 'member' && op.action === 'upsert') {
        const payload = op.payload as unknown as MemberRecord;
        const existing = await getMember(payload.id);
        const next: MemberRecord = existing
          ? {
              ...existing,
              displayName: payload.displayName,
              userId: payload.userId || existing.userId,
              phone: payload.phone !== undefined ? payload.phone : existing.phone,
              email: payload.email !== undefined ? payload.email : existing.email,
              role: payload.role || existing.role,
              excludeFromNew: payload.excludeFromNew !== undefined ? payload.excludeFromNew : existing.excludeFromNew,
              isPot: payload.isPot !== undefined ? payload.isPot : existing.isPot,
              cardNumber: payload.cardNumber !== undefined ? payload.cardNumber : existing.cardNumber,
              sheba: payload.sheba !== undefined ? payload.sheba : existing.sheba,
              cardHolderName: payload.cardHolderName !== undefined ? payload.cardHolderName : existing.cardHolderName,
              bankName: payload.bankName !== undefined ? payload.bankName : existing.bankName,
              unitLabel: payload.unitLabel !== undefined ? payload.unitLabel : existing.unitLabel,
              weightDefault: payload.weightDefault !== undefined ? payload.weightDefault : existing.weightDefault,
            }
          : {
              id: payload.id,
              periodId,
              displayName: payload.displayName,
              guestKey: payload.guestKey,
              userId: payload.userId,
              weightDefault: payload.weightDefault ?? 1,
              role: payload.role || 'member',
              phone: payload.phone,
              email: payload.email,
              excludeFromNew: payload.excludeFromNew,
              isPot: payload.isPot,
              cardNumber: payload.cardNumber,
              sheba: payload.sheba,
              cardHolderName: payload.cardHolderName,
              bankName: payload.bankName,
              unitLabel: payload.unitLabel,
            };
        await writeMember(conn, sealMember(next, enc), enc);
      }
      if (op.entity === 'chat' && op.action === 'upsert') {
        const payload = op.payload as unknown as ChatMessageRecord;
        const exists = await all(conn, 'SELECT id FROM chat WHERE id=?', [payload.id]);
        if (!exists[0]) {
          await conn.query(
            'INSERT INTO chat (id, period_id, sender_member_id, body, expense_id, created_at) VALUES (?,?,?,?,?,?)',
            [
              payload.id,
              periodId,
              payload.senderMemberId,
              sealIf(enc, payload.body) || payload.body,
              payload.expenseId || null,
              new Date(payload.createdAt || Date.now()),
            ],
          );
        }
      }
      if (op.entity === 'period' && op.action === 'upsert') {
        const payload = op.payload as Partial<PeriodRecord>;
        const p = await getPeriod(periodId);
        if (p) {
          const wasEncrypted = Boolean(p.encrypted);
          if (payload.title) p.title = payload.title;
          if (payload.currency) p.currency = payload.currency;
          if (payload.kind) p.kind = payload.kind;
          if (payload.template) p.template = payload.template;
          if (payload.roundTo !== undefined) p.roundTo = payload.roundTo;
          if (payload.bankerMemberId) p.bankerMemberId = payload.bankerMemberId;
          if (payload.buildingCharge !== undefined) p.buildingCharge = payload.buildingCharge;
          if (payload.lunchTurnMemberId) p.lunchTurnMemberId = payload.lunchTurnMemberId;
          if (payload.encrypted !== undefined) p.encrypted = payload.encrypted;
          if (payload.visibility === 'public' || payload.visibility === 'private') p.visibility = payload.visibility;
          p.updatedAt = new Date().toISOString();
          await conn.query(
            `UPDATE periods SET title=?, currency=?, owner_id=?, updated_at=?, kind=?, banker_member_id=?, template=?, round_to=?, building_charge=?, lunch_turn_member_id=?, encrypted=?, visibility=? WHERE id=?`,
            [
              p.title,
              p.currency,
              p.ownerId,
              new Date(p.updatedAt),
              p.kind || 'split',
              p.bankerMemberId || null,
              p.template || 'custom',
              p.roundTo ?? 0,
              p.buildingCharge ?? null,
              p.lunchTurnMemberId || null,
              p.encrypted ? 1 : 0,
              p.visibility || 'private',
              p.id,
            ],
          );
          if (payload.encrypted !== undefined && wasEncrypted !== Boolean(p.encrypted)) {
            await retargetPeriodEncryption(periodId, Boolean(p.encrypted));
          }
        }
      }
      if (op.entity === 'activity' && op.action === 'upsert') {
        const payload = op.payload as unknown as ActivityRecord;
        const exists = await all(conn, 'SELECT id FROM activity WHERE id=?', [payload.id]);
        if (!exists[0]) {
          await conn.query(
            'INSERT INTO activity (id, period_id, actor_name, action, summary, created_at, entity_id) VALUES (?,?,?,?,?,?,?)',
            [
              payload.id,
              periodId,
              payload.actorName,
              payload.action,
              payload.summary,
              new Date(payload.createdAt || Date.now()),
              payload.entityId || null,
            ],
          );
        }
      }
      if (op.entity === 'recurring' && op.action === 'upsert') {
        const payload = op.payload as RecurringRule;
        await conn.query(
          `INSERT INTO recurring (id, period_id, title, amount, currency, payer_id, split_mode, interval_days, cadence, next_at, active)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE title=VALUES(title), amount=VALUES(amount), currency=VALUES(currency), payer_id=VALUES(payer_id), split_mode=VALUES(split_mode), interval_days=VALUES(interval_days), cadence=VALUES(cadence), next_at=VALUES(next_at), active=VALUES(active)`,
          [
            payload.id,
            periodId,
            payload.title,
            Math.round(payload.amount),
            payload.currency,
            payload.payerId,
            payload.splitMode,
            payload.intervalDays,
            payload.cadence || null,
            new Date(payload.nextAt),
            payload.active !== false ? 1 : 0,
          ],
        );
        await conn.query('DELETE FROM recurring_shares WHERE recurring_id=?', [payload.id]);
        if (payload.shares?.length) {
          await insertRows(
            conn,
            'recurring_shares',
            ['recurring_id', 'member_id', 'value', 'excluded'],
            payload.shares.map((s) => [payload.id, s.memberId, s.value, s.excluded ? 1 : 0]),
          );
        }
      }
    }
    await conn.query('UPDATE periods SET version = version + 1, updated_at = ? WHERE id=?', [new Date(), periodId]);
  });
}
