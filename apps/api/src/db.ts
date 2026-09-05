import { isPeriodId, migratePeriodIds } from '@dongham/ledger';
import { initMysql } from './mysql.js';
import { loadDb, replaceDb, truncateAll } from './repo.js';
import type { DbShape } from './types.js';

export { emptyDb } from './types-empty.js';

export async function rewriteLegacyPeriodIds(d: DbShape): Promise<boolean> {
  const ids = d.periods.map((p) => p.id);
  const needsId = ids.some((id) => !isPeriodId(id));
  const needsVis = d.periods.some((p) => !p.visibility);
  if (!needsId && !needsVis) return false;
  const map = needsId ? await migratePeriodIds(ids) : new Map(ids.map((id) => [id, id] as const));
  const rewrite = (pid: string) => map.get(pid) || pid;
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
  return true;
}

export async function initStore(): Promise<void> {
  await initMysql();
}

export async function resetDb(): Promise<void> {
  await truncateAll();
}

/** Read-only snapshot from MySQL (tests / admin export). */
export async function getDb(): Promise<DbShape> {
  return loadDb();
}

/** Test/import helper: write a full graph through MySQL. */
export async function replaceStore(db: DbShape): Promise<void> {
  await replaceDb(db);
}

/** Test helper: load the full graph, apply a mutation, persist. Request handlers must not use this. */
export async function mutate(fn: (db: DbShape) => void | Promise<void>): Promise<void> {
  const db = await loadDb();
  await fn(db);
  await replaceDb(db);
}
