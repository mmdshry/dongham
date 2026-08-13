import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  if (!process.env.DATABASE_URL) return;
  const pg = await import('./pg.js');
  const loaded = await pg.initPostgres();
  persistPg = pg.persistPostgres;
  if (loaded) db = { ...emptyDb(), ...loaded };
  else await persistPg(db);
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
