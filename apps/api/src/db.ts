import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPeriodId, migratePeriodIds } from '@dongham/ledger';
import type { DbShape } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '..', 'data', 'store.json');

const emptyDb = (): DbShape => ({
  users: [],
  sessions: [],
  periods: [],
  members: [],
  expenses: [],
  payments: [],
  invites: [],
  chat: [],
  friends: [],
  attachments: [],
  otps: [],
  notifications: [],
  recurring: [],
  activity: [],
  zarinpalPending: [],
  telegramLinks: [],
  shebaLookups: [],
  adminAudit: [],
  impersonationTickets: [],
  billingEvents: [],
  platformSettings: { extraAdminPhones: [] },
});

export function loadDb(): DbShape {
  try {
    if (!existsSync(DATA_PATH)) return emptyDb();
    return { ...emptyDb(), ...JSON.parse(readFileSync(DATA_PATH, 'utf8')) };
  } catch {
    return emptyDb();
  }
}

export function saveDb(db: DbShape): void {
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(db, null, 2), 'utf8');
}

let db = loadDb();
let persistPg: ((d: DbShape) => Promise<void>) | null = null;

export async function initStore(): Promise<void> {
  if (process.env.DATABASE_URL) {
    const pg = await import('./pg.js');
    const loaded = await pg.initPostgres();
    persistPg = pg.persistPostgres;
    if (loaded) db = { ...emptyDb(), ...loaded };
    else await persistPg(db);
  }
  await migrateStoredPeriodIds();
}

async function migrateStoredPeriodIds(): Promise<void> {
  const ids = db.periods.map((p) => p.id);
  const needsId = ids.some((id) => !isPeriodId(id));
  const needsVis = db.periods.some((p) => !p.visibility);
  if (!needsId && !needsVis) return;
  const map = needsId ? await migratePeriodIds(ids) : new Map(ids.map((id) => [id, id] as const));
  const rewrite = (pid: string) => map.get(pid) || pid;
  mutate((d) => {
    d.periods = d.periods.map((p) => ({
      ...p,
      id: rewrite(p.id),
      visibility: p.visibility || 'private',
    }));
    const retarget = <T extends { periodId?: string }>(rows: T[] | undefined): T[] | undefined => {
      if (!rows) return rows;
      return rows.map((row) => (row.periodId ? { ...row, periodId: rewrite(row.periodId) } : row));
    };
    d.members = retarget(d.members)!;
    d.expenses = retarget(d.expenses)!;
    d.payments = retarget(d.payments)!;
    d.invites = retarget(d.invites)!;
    d.chat = retarget(d.chat)!;
    d.attachments = retarget(d.attachments)!;
    d.activity = retarget(d.activity)!;
    d.recurring = retarget(d.recurring)!;
    if (d.telegramLinks) d.telegramLinks = retarget(d.telegramLinks);
  });
}

export function bumpPeriodVersion(d: DbShape, periodId: string): void {
  const p = d.periods.find((x) => x.id === periodId);
  if (!p) return;
  p.version += 1;
  p.updatedAt = new Date().toISOString();
}

export function getDb(): DbShape {
  return db;
}

export function mutate(fn: (d: DbShape) => void): DbShape {
  fn(db);
  if (persistPg) void persistPg(db);
  else saveDb(db);
  return db;
}

export function resetDb(): void {
  db = emptyDb();
  saveDb(db);
}
