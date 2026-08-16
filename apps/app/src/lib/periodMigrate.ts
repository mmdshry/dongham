import { isPeriodId, migratePeriodIds } from '@dongham/ledger';
import { db, type LocalPeriod } from './db';

export async function migrateLocalPeriodIds(): Promise<void> {
  const periods = await db.periods.toArray();
  if (!periods.length) return;
  const needsId = periods.some((p) => !isPeriodId(p.id));
  const needsVis = periods.some((p) => !p.visibility);
  if (!needsId && !needsVis) return;

  const map = needsId ? await migratePeriodIds(periods.map((p) => p.id)) : new Map(periods.map((p) => [p.id, p.id]));

  await db.transaction(
    'rw',
    [db.periods, db.members, db.expenses, db.payments, db.chat, db.outbox, db.invites, db.recurring, db.activity],
    async () => {
      for (const p of periods) {
        const nextId = map.get(p.id) || p.id;
        const next: LocalPeriod = { ...p, id: nextId, visibility: p.visibility || 'private' };
        if (nextId !== p.id) await db.periods.delete(p.id);
        await db.periods.put(next);
      }
      const rewrite = async <T extends { periodId: string }>(table: { toArray: () => Promise<T[]>; put: (row: T) => Promise<unknown> }) => {
        const rows = await table.toArray();
        for (const row of rows) {
          const next = map.get(row.periodId);
          if (!next || next === row.periodId) continue;
          await table.put({ ...row, periodId: next });
        }
      };
      await rewrite(db.members);
      await rewrite(db.expenses);
      await rewrite(db.payments);
      await rewrite(db.chat);
      await rewrite(db.outbox);
      await rewrite(db.invites);
      await rewrite(db.recurring);
      await rewrite(db.activity);
    },
  );

  if (typeof window === 'undefined') return;
  const match = window.location.pathname.match(/^\/periods\/([^/]+)/);
  if (!match) return;
  const current = decodeURIComponent(match[1]);
  const next = map.get(current);
  if (next && next !== current) {
    window.history.replaceState(null, '', `${window.location.pathname.replace(match[1], encodeURIComponent(next))}${window.location.search}`);
  }
}
