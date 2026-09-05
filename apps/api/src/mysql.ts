import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPeriodId } from '@dongham/ledger';
import mysql from 'mysql2/promise';
import type { Pool, PoolConnection } from 'mysql2/promise';
import type {
  Charge,
  DbShape,
  ExpenseRecord,
  MemberRecord,
  PaymentRecord,
  PeriodRecord,
  RecurringCadence,
  ShebaLookupCache,
  UserRecord,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

/** Incremental SQL is the live path. hydrate/persist remain for import/export and tests. */

export type Row = Record<string, unknown>;

const CLEAR_TABLES = [
  'expense_payers',
  'expense_shares',
  'expense_tags',
  'recurring_shares',
  'sheba_lookup_cache',
  'platform_admin_phones',
  'fx_rates',
  'user_payout_methods',
  'user_fx_watchlist',
  'chat',
  'payments',
  'expenses',
  'attachments',
  'recurring',
  'invites',
  'activity',
  'notifications',
  'friends',
  'telegram_links',
  'zarinpal_pending',
  'billing_events',
  'otps',
  'sessions',
  'admin_audit',
  'impersonation_tickets',
  'sheba_lookup_days',
  'members',
  'periods',
  'users',
  'fx_cache',
] as const;

let pool: Pool | null = null;

export function mysqlConfig() {
  return {
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'dongham',
  };
}

export async function initMysql(): Promise<Pool> {
  if (pool) return pool;
  const cfg = mysqlConfig();
  const admin = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    charset: 'utf8mb4',
  });
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await admin.end();
  }
  pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: 'utf8mb4',
    timezone: 'Z',
    waitForConnections: true,
    connectionLimit: 8,
    decimalNumbers: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
  });
  await runMigrations(pool);
  return pool;
}

export function getPool(): Pool {
  if (!pool) throw new Error('MySQL is not initialized; call initMysql() first');
  return pool;
}

export async function runMigrations(conn: Pool | PoolConnection): Promise<void> {
  const owned = typeof (conn as Pool).getConnection === 'function';
  const runner = owned ? await (conn as Pool).getConnection() : conn;
  try {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(128) NOT NULL,
        applied_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const appliedRows = await all(runner, 'SELECT id FROM schema_migrations');
    const applied = new Set(appliedRows.map((r) => String(r.id)));
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => /^\d+_.*\.sql$/i.test(f))
      .sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      for (const stmt of splitSql(sql)) {
        await runner.query(stmt);
      }
      await runner.query('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [file, new Date()]);
      console.log(`mysql: applied ${file}`);
    }
  } finally {
    if (owned) (runner as PoolConnection).release();
  }
}

export async function hydrateDb(): Promise<DbShape> {
  const p = getPool();
  const [
    users,
    payouts,
    watchlist,
    sessions,
    periods,
    members,
    attachments,
    expenses,
    payers,
    shares,
    tags,
    payments,
    invites,
    chat,
    friends,
    notifications,
    recurring,
    recShares,
    activity,
    otps,
    zarinpal,
    billing,
    telegram,
    shebaDays,
    shebaCache,
    audit,
    tickets,
    adminPhones,
    fxCache,
    fxRates,
  ] = await Promise.all([
    all(p, 'SELECT * FROM users'),
    all(p, 'SELECT * FROM user_payout_methods'),
    all(p, 'SELECT * FROM user_fx_watchlist'),
    all(p, 'SELECT * FROM sessions'),
    all(p, 'SELECT * FROM periods'),
    all(p, 'SELECT * FROM members'),
    all(p, 'SELECT * FROM attachments'),
    all(p, 'SELECT * FROM expenses'),
    all(p, 'SELECT * FROM expense_payers'),
    all(p, 'SELECT * FROM expense_shares'),
    all(p, 'SELECT * FROM expense_tags'),
    all(p, 'SELECT * FROM payments'),
    all(p, 'SELECT * FROM invites'),
    all(p, 'SELECT * FROM chat'),
    all(p, 'SELECT * FROM friends'),
    all(p, 'SELECT * FROM notifications'),
    all(p, 'SELECT * FROM recurring'),
    all(p, 'SELECT * FROM recurring_shares'),
    all(p, 'SELECT * FROM activity'),
    all(p, 'SELECT * FROM otps'),
    all(p, 'SELECT * FROM zarinpal_pending'),
    all(p, 'SELECT * FROM billing_events'),
    all(p, 'SELECT * FROM telegram_links'),
    all(p, 'SELECT * FROM sheba_lookup_days'),
    all(p, 'SELECT * FROM sheba_lookup_cache'),
    all(p, 'SELECT * FROM admin_audit'),
    all(p, 'SELECT * FROM impersonation_tickets'),
    all(p, 'SELECT * FROM platform_admin_phones'),
    all(p, 'SELECT * FROM fx_cache WHERE id = 1'),
    all(p, 'SELECT * FROM fx_rates'),
  ]);

  const payoutsByUser = group(payouts, 'user_id');
  const fxByUser = group(watchlist, 'user_id');
  const payersByExp = group(payers, 'expense_id');
  const sharesByExp = group(shares, 'expense_id');
  const tagsByExp = group(tags, 'expense_id');
  const recSharesBy = group(recShares, 'recurring_id');
  const shebaCacheBy = new Map<string, Row[]>();
  for (const row of shebaCache) {
    const key = `${str(row.identity)}|${str(row.day)}`;
    const list = shebaCacheBy.get(key) || [];
    list.push(row);
    shebaCacheBy.set(key, list);
  }

  const db: DbShape = {
    users: users.map((row) => mapUser(row, payoutsByUser.get(str(row.id)) || [], fxByUser.get(str(row.id)) || [])),
    sessions: sessions.map((row) => ({
      id: str(row.id),
      userId: str(row.user_id),
      deviceId: str(row.device_id),
      token: str(row.token),
      createdAt: toIso(row.created_at),
    })),
    periods: periods.map(mapPeriod),
    members: members.map(mapMember),
    expenses: expenses.map((row) =>
      mapExpense(row, payersByExp.get(str(row.id)) || [], sharesByExp.get(str(row.id)) || [], tagsByExp.get(str(row.id)) || []),
    ),
    payments: payments.map(mapPayment),
    invites: invites.map((row) => ({
      token: str(row.token),
      periodId: trimId(row.period_id),
      createdBy: str(row.created_by),
      createdAt: toIso(row.created_at),
      expiresAt: toIsoOpt(row.expires_at),
    })),
    chat: chat.map((row) => ({
      id: str(row.id),
      periodId: trimId(row.period_id),
      senderMemberId: str(row.sender_member_id),
      body: str(row.body),
      expenseId: strOpt(row.expense_id),
      createdAt: toIso(row.created_at),
    })),
    friends: friends.map((row) => ({
      id: str(row.id),
      userId: str(row.user_id),
      friendUserId: strOpt(row.friend_user_id),
      displayName: str(row.display_name),
      phone: strOpt(row.phone),
      email: strOpt(row.email),
    })),
    attachments: attachments.map((row) => ({
      id: str(row.id),
      periodId: trimId(row.period_id),
      mime: str(row.mime),
      dataBase64: str(row.data_base64),
      createdAt: toIso(row.created_at),
    })),
    otps: otps.map((row) => ({
      phone: str(row.phone),
      code: str(row.code),
      expiresAt: num(row.expires_at),
    })),
    notifications: notifications.map((row) => ({
      id: str(row.id),
      userId: str(row.user_id),
      title: str(row.title),
      body: str(row.body),
      read: bool(row.is_read),
      createdAt: toIso(row.created_at),
    })),
    recurring: recurring.map((row) => ({
      id: str(row.id),
      periodId: trimId(row.period_id),
      title: str(row.title),
      amount: num(row.amount),
      currency: str(row.currency),
      payerId: str(row.payer_id),
      splitMode: asSplit(row.split_mode),
      shares: (recSharesBy.get(str(row.id)) || []).map((s) => ({
        memberId: str(s.member_id),
        value: num(s.value),
        excluded: bool(s.excluded) || undefined,
      })),
      intervalDays: num(row.interval_days),
      cadence: asCadence(row.cadence),
      nextAt: toIso(row.next_at),
      active: bool(row.active),
    })),
    activity: activity.map((row) => ({
      id: str(row.id),
      periodId: trimId(row.period_id),
      actorName: str(row.actor_name),
      action: str(row.action),
      summary: str(row.summary),
      createdAt: toIso(row.created_at),
      entityId: strOpt(row.entity_id),
    })),
    zarinpalPending: zarinpal.map((row) => ({
      authority: str(row.authority),
      userId: str(row.user_id),
      sku: str(row.sku),
      amount: num(row.amount),
      createdAt: toIso(row.created_at),
    })),
    telegramLinks: telegram.map((row) => ({
      chatId: str(row.chat_id),
      periodId: trimId(row.period_id),
      payerMemberId: strOpt(row.payer_member_id),
    })),
    shebaLookups: shebaDays.map((row) => {
      const key = `${str(row.identity)}|${str(row.day)}`;
      const cache: Record<string, ShebaLookupCache> = {};
      for (const c of shebaCacheBy.get(key) || []) {
        cache[str(c.card_hash)] = {
          iban: str(c.iban),
          depositNumber: str(c.deposit_number),
          bank: str(c.bank),
          bankName: str(c.bank_name),
          bankCode: str(c.bank_code),
          holderName: str(c.holder_name),
        };
      }
      return {
        identity: str(row.identity),
        day: String(row.day).trim(),
        count: num(row.lookup_count),
        cache,
      };
    }),
    adminAudit: audit.map((row) => ({
      id: str(row.id),
      actorUserId: str(row.actor_user_id),
      actorPhone: strOpt(row.actor_phone),
      action: str(row.action),
      targetType: str(row.target_type),
      targetId: str(row.target_id),
      summary: str(row.summary),
      createdAt: toIso(row.created_at),
    })),
    impersonationTickets: tickets.map((row) => ({
      code: str(row.code),
      userId: str(row.user_id),
      actorUserId: str(row.actor_user_id),
      expiresAt: num(row.expires_at),
      token: strOpt(row.token),
      consumedAt: row.consumed_at == null ? undefined : num(row.consumed_at),
    })),
    billingEvents: billing.map((row) => ({
      id: str(row.id),
      userId: str(row.user_id),
      source: asBillingSource(row.source),
      sku: strOpt(row.sku),
      amount: row.amount == null ? undefined : num(row.amount),
      until: toIso(row.until_at),
      createdAt: toIso(row.created_at),
    })),
    platformSettings: {
      extraAdminPhones: adminPhones.map((row) => str(row.phone)),
    },
  };

  const fxRow = fxCache[0];
  if (fxRow) {
    const rates: Record<string, number> = {};
    for (const r of fxRates) rates[str(r.code)] = num(r.rate);
    db.fxCache = { rates, fetchedAt: toIso(fxRow.fetched_at), source: strOpt(fxRow.source) };
  }
  return db;
}

export async function persistMysql(db: DbShape): Promise<void> {
  const prepared = prepareDb(db);
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    for (const table of CLEAR_TABLES) {
      await conn.query(`DELETE FROM \`${table}\``);
    }
    await insertAll(conn, prepared);
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function insertAll(conn: PoolConnection, db: DbShape): Promise<void> {
  await insertRows(
    conn,
    'users',
    [
      'id',
      'phone',
      'email',
      'password_hash',
      'google_id',
      'display_name',
      'created_at',
      'deleted_at',
      'banned_at',
      'plan',
      'premium_until',
      'use_persian_digits',
      'debt_reminders',
      'calendar_mode',
      'prefs_updated_at',
    ],
    db.users.map((u) => [
      clip(u.id, 32),
      nullStr(u.phone, 15),
      nullStr(u.email, 191),
      nullStr(u.passwordHash, 100),
      nullStr(u.googleId, 64),
      clip(u.displayName || 'کاربر', 80),
      toDate(u.createdAt) || new Date(),
      toDate(u.deletedAt),
      toDate(u.bannedAt),
      u.plan === 'premium' ? 'premium' : 'free',
      toDate(u.premiumUntil),
      boolSql(u.usePersianDigits),
      boolSql(u.debtReminders),
      u.calendarMode === 'gregorian' || u.calendarMode === 'jalali' ? u.calendarMode : null,
      toDate(u.prefsUpdatedAt),
    ]),
  );

  const payoutRows: unknown[][] = [];
  const fxWatchRows: unknown[][] = [];
  for (const u of db.users) {
    for (const m of u.payoutMethods || []) {
      const card = (m.cardNumber || '').replace(/\D/g, '').slice(0, 16);
      if (card.length !== 16) continue;
      payoutRows.push([
        clip(m.id, 32),
        clip(u.id, 32),
        nullStr(m.label, 80),
        card,
        nullStr(m.sheba, 32),
        nullStr(m.cardHolderName, 80),
        nullStr(m.bankName, 80),
        nullStr(m.accountNumber, 32),
        m.isDefault ? 1 : 0,
      ]);
    }
    for (const code of u.fxWatchlist || []) {
      if (!code) continue;
      fxWatchRows.push([clip(u.id, 32), clip(code, 16)]);
    }
  }
  await insertRows(
    conn,
    'user_payout_methods',
    ['id', 'user_id', 'label', 'card_number', 'sheba', 'card_holder_name', 'bank_name', 'account_number', 'is_default'],
    payoutRows,
  );
  await insertRows(conn, 'user_fx_watchlist', ['user_id', 'code'], fxWatchRows);

  await insertRows(
    conn,
    'sessions',
    ['id', 'user_id', 'device_id', 'token', 'created_at'],
    db.sessions.map((s) => [
      clip(s.id, 32),
      clip(s.userId, 32),
      clip(s.deviceId, 64),
      persistSessionToken(s.token),
      toDate(s.createdAt) || new Date(),
    ]),
  );

  const validUsers = new Set(db.users.map((u) => clip(u.id, 32)));
  const validPeriods = new Set<string>();
  const periodRows: unknown[][] = [];
  for (const p of db.periods) {
    const id = asPeriodId(p.id);
    if (!id) {
      console.warn(`mysql persist: skip period with invalid id ${p.id}`);
      continue;
    }
    validPeriods.add(id);
    periodRows.push([
      id,
      clip(p.title || 'دوره', 120),
      clip(p.currency || 'IRT', 8),
      clip(p.ownerId, 32),
      toDate(p.createdAt) || new Date(),
      toDate(p.updatedAt) || new Date(),
      num(p.version),
      asKind(p.kind),
      nullStr(p.bankerMemberId, 32),
      clip(p.template || 'custom', 32),
      asRoundTo(p.roundTo),
      p.buildingCharge == null ? null : Math.round(p.buildingCharge),
      nullStr(p.lunchTurnMemberId, 32),
      p.encrypted ? 1 : 0,
      p.visibility === 'public' ? 'public' : 'private',
    ]);
  }
  await insertRows(
    conn,
    'periods',
    [
      'id',
      'title',
      'currency',
      'owner_id',
      'created_at',
      'updated_at',
      'version',
      'kind',
      'banker_member_id',
      'template',
      'round_to',
      'building_charge',
      'lunch_turn_member_id',
      'encrypted',
      'visibility',
    ],
    periodRows,
  );

  await insertRows(
    conn,
    'members',
    [
      'id',
      'period_id',
      'user_id',
      'guest_key',
      'display_name',
      'weight_default',
      'role',
      'phone',
      'email',
      'card_number',
      'sheba',
      'card_holder_name',
      'bank_name',
      'exclude_from_new',
      'is_pot',
      'unit_label',
      'pot_period',
    ],
    db.members
      .filter((m) => validPeriods.has(asPeriodId(m.periodId) || ''))
      .map((m) => [
        clip(m.id, 32),
        asPeriodId(m.periodId),
        m.userId && validUsers.has(clip(m.userId, 32)) ? nullStr(m.userId, 32) : null,
        nullStr(m.guestKey, 64),
        clip(m.displayName || 'عضو', 80),
        num(m.weightDefault, 1),
        asRole(m.role),
        nullStr(m.phone, 15),
        nullStr(m.email, 191),
        persistMemberCard(m.cardNumber),
        nullStr(m.sheba, 32),
        nullStr(m.cardHolderName, 80),
        nullStr(m.bankName, 80),
        m.excludeFromNew ? 1 : 0,
        m.isPot ? 1 : 0,
        nullStr(m.unitLabel, 40),
        m.isPot ? asPeriodId(m.periodId) : null,
      ]),
  );

  await insertRows(
    conn,
    'attachments',
    ['id', 'period_id', 'mime', 'data_base64', 'created_at'],
    db.attachments
      .filter((a) => validPeriods.has(asPeriodId(a.periodId) || ''))
      .map((a) => [
        clip(a.id, 32),
        asPeriodId(a.periodId),
        clip(a.mime || 'application/octet-stream', 80),
        a.dataBase64 || '',
        toDate(a.createdAt) || new Date(),
      ]),
  );

  const expenseRows: unknown[][] = [];
  const payerRows: unknown[][] = [];
  const shareRows: unknown[][] = [];
  const tagRows: unknown[][] = [];
  const seenPayer = new Set<string>();
  const seenShare = new Set<string>();
  const seenTag = new Set<string>();
  for (const e of db.expenses) {
    const periodId = asPeriodId(e.periodId);
    if (!periodId || !validPeriods.has(periodId)) continue;
    const tax = asCharge(e.tax) || { type: 'none' as const, value: 0 };
    const service = asCharge(e.service);
    const tip = asCharge(e.tip);
    expenseRows.push([
      clip(e.id, 32),
      periodId,
      clip(e.title || 'هزینه', 200),
      Math.round(num(e.amount)),
      clip(e.currency || 'IRT', 8),
      clip(e.payerId, 32),
      asSplit(e.splitMode),
      tax.type,
      tax.value,
      service?.type ?? null,
      service?.value ?? null,
      tip?.type ?? null,
      tip?.value ?? null,
      nullStr(e.note),
      nullStr(e.attachmentId, 32),
      nullStr(e.attachmentDataUrl),
      num(e.fxRate, 1),
      toDate(e.createdAt) || new Date(),
      toDate(e.occurredAt),
      toDate(e.updatedAt) || new Date(),
      toDate(e.deletedAt),
      nullStr(e.clientId, 64),
      num(e.version),
    ]);
    for (const payer of e.payers || []) {
      const key = `${e.id}#${payer.memberId}`;
      if (seenPayer.has(key)) continue;
      seenPayer.add(key);
      payerRows.push([clip(e.id, 32), clip(payer.memberId, 32), Math.round(num(payer.amount))]);
    }
    for (const share of e.shares || []) {
      const key = `${e.id}#${share.memberId}`;
      if (seenShare.has(key)) continue;
      seenShare.add(key);
      shareRows.push([clip(e.id, 32), clip(share.memberId, 32), num(share.value), share.excluded ? 1 : 0]);
    }
    for (const tag of e.tags || []) {
      if (!tag) continue;
      const key = `${e.id}#${tag}`;
      if (seenTag.has(key)) continue;
      seenTag.add(key);
      tagRows.push([clip(e.id, 32), clip(tag, 64)]);
    }
  }
  await insertRows(
    conn,
    'expenses',
    [
      'id',
      'period_id',
      'title',
      'amount',
      'currency',
      'payer_id',
      'split_mode',
      'tax_type',
      'tax_value',
      'service_type',
      'service_value',
      'tip_type',
      'tip_value',
      'note',
      'attachment_id',
      'attachment_data_url',
      'fx_rate',
      'created_at',
      'occurred_at',
      'updated_at',
      'deleted_at',
      'client_id',
      'version',
    ],
    expenseRows,
  );
  await insertRows(conn, 'expense_payers', ['expense_id', 'member_id', 'amount'], payerRows);
  await insertRows(conn, 'expense_shares', ['expense_id', 'member_id', 'value', 'excluded'], shareRows);
  await insertRows(conn, 'expense_tags', ['expense_id', 'tag'], tagRows);

  await insertRows(
    conn,
    'payments',
    [
      'id',
      'period_id',
      'from_member_id',
      'to_member_id',
      'amount',
      'currency',
      'kind',
      'note',
      'fx_rate',
      'created_at',
      'updated_at',
      'deleted_at',
      'version',
      'status',
      'receipt_data_url',
      'index_asset',
      'index_rate_at_create',
      'pending_edge',
    ],
    db.payments
      .filter((p) => validPeriods.has(asPeriodId(p.periodId) || ''))
      .map((p) => [
        clip(p.id, 32),
        asPeriodId(p.periodId),
        clip(p.fromMemberId, 32),
        clip(p.toMemberId, 32),
        Math.round(num(p.amount)),
        clip(p.currency || 'IRT', 8),
        p.kind === 'loan' ? 'loan' : 'settlement',
        nullStr(p.note),
        num(p.fxRate, 1),
        toDate(p.createdAt) || new Date(),
        toDate(p.updatedAt) || new Date(),
        toDate(p.deletedAt),
        num(p.version),
        asStatus(p.status),
        nullStr(p.receiptDataUrl),
        asIndexAsset(p.indexAsset),
        p.indexRateAtCreate == null ? null : num(p.indexRateAtCreate),
        asStatus(p.status) === 'pending_confirm' && !p.deletedAt
          ? `${asPeriodId(p.periodId)}#${clip(p.fromMemberId, 32)}#${clip(p.toMemberId, 32)}`
          : null,
      ]),
  );

  await insertRows(
    conn,
    'invites',
    ['token', 'period_id', 'created_by', 'created_at', 'expires_at'],
    db.invites
      .filter((i) => validPeriods.has(asPeriodId(i.periodId) || ''))
      .map((i) => [
        clip(i.token, 16),
        asPeriodId(i.periodId),
        clip(i.createdBy, 32),
        toDate(i.createdAt) || new Date(),
        toDate(i.expiresAt),
      ]),
  );

  await insertRows(
    conn,
    'chat',
    ['id', 'period_id', 'sender_member_id', 'body', 'expense_id', 'created_at'],
    db.chat
      .filter((m) => validPeriods.has(asPeriodId(m.periodId) || ''))
      .map((m) => [
        clip(m.id, 32),
        asPeriodId(m.periodId),
        clip(m.senderMemberId, 32),
        m.body || '',
        nullStr(m.expenseId, 32),
        toDate(m.createdAt) || new Date(),
      ]),
  );

  await insertRows(
    conn,
    'friends',
    ['id', 'user_id', 'friend_user_id', 'display_name', 'phone', 'email'],
    db.friends.map((f) => [
      clip(f.id, 32),
      clip(f.userId, 32),
      nullStr(f.friendUserId, 32),
      clip(f.displayName || 'دوست', 80),
      nullStr(f.phone, 15),
      nullStr(f.email, 191),
    ]),
  );

  await insertRows(
    conn,
    'notifications',
    ['id', 'user_id', 'title', 'body', 'is_read', 'created_at'],
    db.notifications.map((n) => [
      clip(n.id, 32),
      clip(n.userId, 32),
      clip(n.title || '', 160),
      n.body || '',
      n.read ? 1 : 0,
      toDate(n.createdAt) || new Date(),
    ]),
  );

  const recRows: unknown[][] = [];
  const recShareRows: unknown[][] = [];
  const seenRecShare = new Set<string>();
  for (const r of db.recurring) {
    const periodId = asPeriodId(r.periodId);
    if (!periodId || !validPeriods.has(periodId)) continue;
    recRows.push([
      clip(r.id, 32),
      periodId,
      clip(r.title || 'تکراری', 200),
      Math.round(num(r.amount)),
      clip(r.currency || 'IRT', 8),
      clip(r.payerId, 32),
      asSplit(r.splitMode),
      num(r.intervalDays, 30),
      asCadence(r.cadence) ?? null,
      toDate(r.nextAt) || new Date(),
      r.active === false ? 0 : 1,
    ]);
    for (const share of r.shares || []) {
      const key = `${r.id}#${share.memberId}`;
      if (seenRecShare.has(key)) continue;
      seenRecShare.add(key);
      recShareRows.push([clip(r.id, 32), clip(share.memberId, 32), num(share.value), share.excluded ? 1 : 0]);
    }
  }
  await insertRows(
    conn,
    'recurring',
    ['id', 'period_id', 'title', 'amount', 'currency', 'payer_id', 'split_mode', 'interval_days', 'cadence', 'next_at', 'active'],
    recRows,
  );
  await insertRows(conn, 'recurring_shares', ['recurring_id', 'member_id', 'value', 'excluded'], recShareRows);

  await insertRows(
    conn,
    'activity',
    ['id', 'period_id', 'actor_name', 'action', 'summary', 'created_at', 'entity_id'],
    db.activity
      .filter((a) => validPeriods.has(asPeriodId(a.periodId) || ''))
      .map((a) => [
        clip(a.id, 32),
        asPeriodId(a.periodId),
        clip(a.actorName || '', 80),
        clip(a.action || '', 64),
        a.summary || '',
        toDate(a.createdAt) || new Date(),
        nullStr(a.entityId, 32),
      ]),
  );

  await insertRows(
    conn,
    'otps',
    ['phone', 'code', 'expires_at'],
    db.otps.map((o) => [clip(o.phone, 15), clip(o.code, 8), num(o.expiresAt)]),
  );

  await insertRows(
    conn,
    'zarinpal_pending',
    ['authority', 'user_id', 'sku', 'amount', 'created_at'],
    (db.zarinpalPending || []).map((z) => [
      clip(z.authority, 64),
      clip(z.userId, 32),
      clip(z.sku, 64),
      Math.round(num(z.amount)),
      toDate(z.createdAt) || new Date(),
    ]),
  );

  await insertRows(
    conn,
    'billing_events',
    ['id', 'user_id', 'source', 'sku', 'amount', 'until_at', 'created_at'],
    (db.billingEvents || []).map((e) => [
      clip(e.id, 32),
      clip(e.userId, 32),
      asBillingSource(e.source),
      nullStr(e.sku, 64),
      e.amount == null ? null : Math.round(num(e.amount)),
      toDate(e.until) || new Date(),
      toDate(e.createdAt) || new Date(),
    ]),
  );

  await insertRows(
    conn,
    'telegram_links',
    ['chat_id', 'period_id', 'payer_member_id'],
    (db.telegramLinks || [])
      .filter((l) => validPeriods.has(asPeriodId(l.periodId) || ''))
      .map((l) => [clip(l.chatId, 32), asPeriodId(l.periodId), nullStr(l.payerMemberId, 32)]),
  );

  await insertRows(
    conn,
    'sheba_lookup_days',
    ['identity', 'day', 'lookup_count'],
    (db.shebaLookups || []).map((s) => [clip(s.identity, 80), clip(s.day, 10), num(s.count)]),
  );
  const shebaCacheRows: unknown[][] = [];
  for (const s of db.shebaLookups || []) {
    for (const [hash, c] of Object.entries(s.cache || {})) {
      shebaCacheRows.push([
        clip(s.identity, 80),
        clip(s.day, 10),
        clip(hash, 64),
        clip(c.iban, 34),
        nullStr(c.depositNumber, 32),
        nullStr(c.bank, 32),
        nullStr(c.bankName, 80),
        nullStr(c.bankCode, 16),
        nullStr(c.holderName, 80),
      ]);
    }
  }
  await insertRows(
    conn,
    'sheba_lookup_cache',
    ['identity', 'day', 'card_hash', 'iban', 'deposit_number', 'bank', 'bank_name', 'bank_code', 'holder_name'],
    shebaCacheRows,
  );

  await insertRows(
    conn,
    'admin_audit',
    ['id', 'actor_user_id', 'actor_phone', 'action', 'target_type', 'target_id', 'summary', 'created_at'],
    (db.adminAudit || []).map((a) => [
      clip(a.id, 32),
      clip(a.actorUserId, 32),
      nullStr(a.actorPhone, 15),
      clip(a.action, 64),
      clip(a.targetType, 32),
      clip(a.targetId, 64),
      a.summary || '',
      toDate(a.createdAt) || new Date(),
    ]),
  );

  await insertRows(
    conn,
    'impersonation_tickets',
    ['code', 'user_id', 'actor_user_id', 'expires_at', 'token', 'consumed_at'],
    (db.impersonationTickets || []).map((t) => [
      clip(t.code, 24),
      clip(t.userId, 32),
      clip(t.actorUserId, 32),
      num(t.expiresAt),
      nullStr(t.token, 1024),
      t.consumedAt == null ? null : num(t.consumedAt),
    ]),
  );

  await insertRows(
    conn,
    'platform_admin_phones',
    ['phone'],
    (db.platformSettings?.extraAdminPhones || [])
      .map((phone) => nullStr(phone, 15))
      .filter((phone): phone is string => Boolean(phone))
      .map((phone) => [phone]),
  );

  if (db.fxCache) {
    await insertRows(
      conn,
      'fx_cache',
      ['id', 'fetched_at', 'source'],
      [[1, toDate(db.fxCache.fetchedAt) || new Date(), nullStr(db.fxCache.source, 64)]],
    );
    await insertRows(
      conn,
      'fx_rates',
      ['code', 'rate'],
      Object.entries(db.fxCache.rates || {}).map(([code, rate]) => [clip(code, 16), num(rate)]),
    );
  }
}

export function prepareDb(input: DbShape): DbShape {
  const db: DbShape = JSON.parse(JSON.stringify(input)) as DbShape;
  dedupeById(db.users, (u) => u.id);
  const seenPhone = new Set<string>();
  const seenEmail = new Set<string>();
  const seenGoogle = new Set<string>();
  for (const u of db.users) {
    if (u.deletedAt) continue;
    if (u.phone) {
      if (seenPhone.has(u.phone)) {
        console.warn(`mysql: duplicate user phone ${u.phone}, clearing on ${u.id}`);
        delete u.phone;
      } else seenPhone.add(u.phone);
    }
    if (u.email) {
      if (seenEmail.has(u.email)) {
        console.warn(`mysql: duplicate user email ${u.email}, clearing on ${u.id}`);
        delete u.email;
      } else seenEmail.add(u.email);
    }
    if (u.googleId) {
      if (seenGoogle.has(u.googleId)) {
        console.warn(`mysql: duplicate google id, clearing on ${u.id}`);
        delete u.googleId;
      } else seenGoogle.add(u.googleId);
    }
    if (u.payoutMethods?.length) {
      const cards = new Set<string>();
      let hasDefault = false;
      u.payoutMethods = u.payoutMethods.filter((m) => {
        const card = (m.cardNumber || '').replace(/\D/g, '');
        if (card.length !== 16 || cards.has(card)) return false;
        cards.add(card);
        if (m.isDefault) {
          if (hasDefault) m.isDefault = false;
          else hasDefault = true;
        }
        return true;
      });
    }
  }

  const seenMemberUser = new Set<string>();
  const seenMemberGuest = new Set<string>();
  const seenPot = new Set<string>();
  for (const m of db.members) {
    if (m.userId) {
      const key = `${m.periodId}#${m.userId}`;
      if (seenMemberUser.has(key)) {
        console.warn(`mysql: duplicate member user ${key}, clearing userId on ${m.id}`);
        delete m.userId;
      } else seenMemberUser.add(key);
    }
    if (m.guestKey) {
      const key = `${m.periodId}#${m.guestKey}`;
      if (seenMemberGuest.has(key)) {
        console.warn(`mysql: duplicate member guest ${key}, clearing guestKey on ${m.id}`);
        delete m.guestKey;
      } else seenMemberGuest.add(key);
    }
    if (m.isPot) {
      if (seenPot.has(m.periodId)) {
        console.warn(`mysql: extra pot member in ${m.periodId}, clearing isPot on ${m.id}`);
        m.isPot = false;
      } else seenPot.add(m.periodId);
    }
  }

  const seenPending = new Set<string>();
  for (const p of db.payments) {
    if (p.status === 'pending_confirm' && !p.deletedAt) {
      const key = `${p.periodId}#${p.fromMemberId}#${p.toMemberId}`;
      if (seenPending.has(key)) {
        console.warn(`mysql: extra pending payment ${key}, marking ${p.id} as sent`);
        p.status = 'sent';
      } else seenPending.add(key);
    }
  }

  const seenFriendPhone = new Set<string>();
  const seenFriendEmail = new Set<string>();
  for (const f of db.friends) {
    if (f.phone) {
      const key = `${f.userId}#${f.phone}`;
      if (seenFriendPhone.has(key)) delete f.phone;
      else seenFriendPhone.add(key);
    }
    if (f.email) {
      const key = `${f.userId}#${f.email}`;
      if (seenFriendEmail.has(key)) delete f.email;
      else seenFriendEmail.add(key);
    }
  }

  dedupeById(db.sessions, (s) => s.id);
  dedupeById(db.periods, (p) => p.id);
  dedupeById(db.members, (m) => m.id);
  dedupeById(db.expenses, (e) => e.id);
  dedupeById(db.payments, (p) => p.id);
  dedupeById(db.invites, (i) => i.token);
  dedupeById(db.chat, (c) => c.id);
  dedupeById(db.friends, (f) => f.id);
  dedupeById(db.attachments, (a) => a.id);
  dedupeById(db.notifications, (n) => n.id);
  dedupeById(db.recurring, (r) => r.id);
  dedupeById(db.activity, (a) => a.id);
  if (db.zarinpalPending) dedupeById(db.zarinpalPending, (z) => z.authority);
  if (db.telegramLinks) dedupeById(db.telegramLinks, (l) => l.chatId);
  if (db.adminAudit) dedupeById(db.adminAudit, (a) => a.id);
  if (db.impersonationTickets) dedupeById(db.impersonationTickets, (t) => t.code);
  if (db.billingEvents) dedupeById(db.billingEvents, (e) => e.id);
  dedupeById(db.otps, (o) => o.phone);
  if (db.shebaLookups) dedupeById(db.shebaLookups, (s) => `${s.identity}|${s.day}`);
  if (db.platformSettings?.extraAdminPhones) {
    db.platformSettings.extraAdminPhones = [...new Set(db.platformSettings.extraAdminPhones.filter(Boolean))];
  }
  return db;
}

export function mapUser(row: Row, payouts: Row[], watch: Row[]): UserRecord {
  const user: UserRecord = {
    id: str(row.id),
    displayName: str(row.display_name),
    createdAt: toIso(row.created_at),
    plan: row.plan === 'premium' ? 'premium' : 'free',
  };
  const phone = strOpt(row.phone);
  const email = strOpt(row.email);
  const googleId = strOpt(row.google_id);
  const passwordHash = strOpt(row.password_hash);
  if (phone) user.phone = phone;
  if (email) user.email = email;
  if (googleId) user.googleId = googleId;
  if (passwordHash) user.passwordHash = passwordHash;
  const deletedAt = toIsoOpt(row.deleted_at);
  const bannedAt = toIsoOpt(row.banned_at);
  const premiumUntil = toIsoOpt(row.premium_until);
  const prefsUpdatedAt = toIsoOpt(row.prefs_updated_at);
  if (deletedAt) user.deletedAt = deletedAt;
  if (bannedAt) user.bannedAt = bannedAt;
  if (premiumUntil) user.premiumUntil = premiumUntil;
  if (row.use_persian_digits != null) user.usePersianDigits = bool(row.use_persian_digits);
  if (row.debt_reminders != null) user.debtReminders = bool(row.debt_reminders);
  if (row.calendar_mode === 'jalali' || row.calendar_mode === 'gregorian') user.calendarMode = row.calendar_mode;
  if (prefsUpdatedAt) user.prefsUpdatedAt = prefsUpdatedAt;
  if (payouts.length) {
    user.payoutMethods = payouts.map((m) => ({
      id: str(m.id),
      label: strOpt(m.label),
      cardNumber: str(m.card_number).trim(),
      sheba: strOpt(m.sheba),
      cardHolderName: strOpt(m.card_holder_name),
      bankName: strOpt(m.bank_name),
      accountNumber: strOpt(m.account_number),
      isDefault: bool(m.is_default) || undefined,
    }));
  }
  if (watch.length) user.fxWatchlist = watch.map((w) => str(w.code));
  return user;
}

export function mapPeriod(row: Row): PeriodRecord {
  const period: PeriodRecord = {
    id: trimId(row.id),
    title: str(row.title),
    currency: str(row.currency),
    ownerId: str(row.owner_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: num(row.version),
    kind: asKind(row.kind),
    template: str(row.template) as PeriodRecord['template'],
    roundTo: asRoundTo(row.round_to) as PeriodRecord['roundTo'],
    visibility: row.visibility === 'public' ? 'public' : 'private',
  };
  const banker = strOpt(row.banker_member_id);
  const lunch = strOpt(row.lunch_turn_member_id);
  if (banker) period.bankerMemberId = banker;
  if (lunch) period.lunchTurnMemberId = lunch;
  if (row.building_charge != null) period.buildingCharge = num(row.building_charge);
  if (bool(row.encrypted)) period.encrypted = true;
  return period;
}

export function mapMember(row: Row): MemberRecord {
  const member: MemberRecord = {
    id: str(row.id),
    periodId: trimId(row.period_id),
    displayName: str(row.display_name),
    weightDefault: num(row.weight_default, 1),
    role: asRole(row.role),
  };
  const userId = strOpt(row.user_id);
  const guestKey = strOpt(row.guest_key);
  const phone = strOpt(row.phone);
  const email = strOpt(row.email);
  if (userId) member.userId = userId;
  if (guestKey) member.guestKey = guestKey;
  if (phone) member.phone = phone;
  if (email) member.email = email;
  const card = strOpt(row.card_number);
  const sheba = strOpt(row.sheba);
  const holder = strOpt(row.card_holder_name);
  const bank = strOpt(row.bank_name);
  const unit = strOpt(row.unit_label);
  if (card) member.cardNumber = card;
  if (sheba) member.sheba = sheba;
  if (holder) member.cardHolderName = holder;
  if (bank) member.bankName = bank;
  if (unit) member.unitLabel = unit;
  if (bool(row.exclude_from_new)) member.excludeFromNew = true;
  if (bool(row.is_pot)) member.isPot = true;
  return member;
}

export function mapExpense(row: Row, payers: Row[], shares: Row[], tags: Row[]): ExpenseRecord {
  const expense: ExpenseRecord = {
    id: str(row.id),
    periodId: trimId(row.period_id),
    title: str(row.title),
    amount: num(row.amount),
    currency: str(row.currency),
    payerId: str(row.payer_id),
    splitMode: asSplit(row.split_mode),
    shares: shares.map((s) => ({
      memberId: str(s.member_id),
      value: num(s.value),
      excluded: bool(s.excluded) || undefined,
    })),
    tax: { type: asChargeType(row.tax_type), value: num(row.tax_value) },
    tags: tags.map((t) => str(t.tag)),
    fxRate: num(row.fx_rate, 1),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: num(row.version),
  };
  if (payers.length) {
    expense.payers = payers.map((p) => ({ memberId: str(p.member_id), amount: num(p.amount) }));
  }
  if (row.service_type) expense.service = { type: asChargeType(row.service_type), value: num(row.service_value) };
  if (row.tip_type) expense.tip = { type: asChargeType(row.tip_type), value: num(row.tip_value) };
  const note = strOpt(row.note);
  const attachmentId = strOpt(row.attachment_id);
  const attachmentDataUrl = strOpt(row.attachment_data_url);
  const occurredAt = toIsoOpt(row.occurred_at);
  const deletedAt = toIsoOpt(row.deleted_at);
  const clientId = strOpt(row.client_id);
  if (note) expense.note = note;
  if (attachmentId) expense.attachmentId = attachmentId;
  if (attachmentDataUrl) expense.attachmentDataUrl = attachmentDataUrl;
  if (occurredAt) expense.occurredAt = occurredAt;
  if (deletedAt) expense.deletedAt = deletedAt;
  if (clientId) expense.clientId = clientId;
  return expense;
}

export function mapPayment(row: Row): PaymentRecord {
  const payment: PaymentRecord = {
    id: str(row.id),
    periodId: trimId(row.period_id),
    fromMemberId: str(row.from_member_id),
    toMemberId: str(row.to_member_id),
    amount: num(row.amount),
    currency: str(row.currency),
    kind: row.kind === 'loan' ? 'loan' : 'settlement',
    fxRate: num(row.fx_rate, 1),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: num(row.version),
    status: asStatus(row.status),
    indexAsset: asIndexAsset(row.index_asset),
  };
  const note = strOpt(row.note);
  const deletedAt = toIsoOpt(row.deleted_at);
  const receipt = strOpt(row.receipt_data_url);
  if (note) payment.note = note;
  if (deletedAt) payment.deletedAt = deletedAt;
  if (receipt) payment.receiptDataUrl = receipt;
  if (row.index_rate_at_create != null) payment.indexRateAtCreate = num(row.index_rate_at_create);
  return payment;
}

function splitSql(sql: string): string[] {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map((part) =>
      part
        .split('\n')
        .map((line) => line.replace(/--.*$/, '').trimEnd())
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

export async function all(conn: Pool | PoolConnection, sql: string, params?: unknown[]): Promise<Row[]> {
  const [rows] = await conn.query(sql, params);
  return rows as Row[];
}

export async function insertRows(
  conn: PoolConnection,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void> {
  if (!rows.length) return;
  const placeholders = `(${columns.map(() => '?').join(',')})`;
  const chunkSize = 80;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const sql = `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(',')}) VALUES ${chunk
      .map(() => placeholders)
      .join(',')}`;
    await conn.query(sql, chunk.flat());
  }
}

function group(rows: Row[], key: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const id = str(row[key]);
    const list = map.get(id) || [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

function dedupeById<T>(rows: T[], key: (row: T) => string): void {
  const last = new Map<string, T>();
  for (const row of rows) last.set(key(row), row);
  rows.length = 0;
  rows.push(...last.values());
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function strOpt(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

function trimId(v: unknown): string {
  return str(v).trim();
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: unknown): boolean {
  return v === true || v === 1 || v === '1';
}

function boolSql(v: boolean | undefined): number | null {
  if (v == null) return null;
  return v ? 1 : 0;
}

function nullStr(v?: string | null, max?: number): string | null {
  if (v == null) return null;
  const s = v.trim();
  if (!s) return null;
  return max ? s.slice(0, max) : s;
}

function clip(v: string, max: number): string {
  return (v || '').slice(0, max);
}

function toDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (/^\d{4}-\d{2}-\d{2} /.test(trimmed)) {
      const asUtc = new Date(`${trimmed.replace(' ', 'T')}Z`);
      if (!Number.isNaN(asUtc.getTime())) return asUtc.toISOString();
    }
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function toIsoOpt(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  return toIso(v);
}

export function persistSessionToken(token: string): string {
  return token || '';
}

export function persistMemberCard(raw?: string | null): string | null {
  if (raw == null) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length === 16 ? digits : null;
}

export function asPeriodId(id: string): string | null {
  const t = (id || '').trim();
  return isPeriodId(t) ? t : null;
}

function asKind(v: unknown): NonNullable<PeriodRecord['kind']> {
  return v === 'banker' || v === 'pot' ? v : 'split';
}

function asRole(v: unknown): NonNullable<MemberRecord['role']> {
  return v === 'owner' || v === 'viewer' ? v : 'member';
}

function asSplit(v: unknown): ExpenseRecord['splitMode'] {
  return v === 'weight' || v === 'exact' || v === 'percent' ? v : 'equal';
}

function asChargeType(v: unknown): Charge['type'] {
  return v === 'percent' || v === 'amount' ? v : 'none';
}

function asCharge(v?: Charge): Charge | undefined {
  if (!v) return undefined;
  return { type: asChargeType(v.type), value: num(v.value) };
}

function asRoundTo(v: unknown): 0 | 1000 | 10000 {
  const n = num(v);
  return n === 1000 || n === 10000 ? n : 0;
}

function asStatus(v: unknown): NonNullable<PaymentRecord['status']> {
  return v === 'sent' || v === 'pending_confirm' ? v : 'settled';
}

function asIndexAsset(v: unknown): NonNullable<PaymentRecord['indexAsset']> {
  return v === 'gold' || v === 'usd' ? v : 'none';
}

function asCadence(v: unknown): RecurringCadence | undefined {
  if (v === 'days' || v === 'jalaliMonthly' || v === 'jalaliBimonthly') return v;
  return undefined;
}

function asBillingSource(v: unknown): NonNullable<DbShape['billingEvents']>[number]['source'] {
  return v === 'bazaar' || v === 'myket' || v === 'zarinpal' || v === 'admin' ? v : 'admin';
}
