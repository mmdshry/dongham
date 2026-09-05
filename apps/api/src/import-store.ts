import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDonghamExport } from '@dongham/ledger';
import { emptyDb, rewriteLegacyPeriodIds } from './db.js';
import { asPeriodId, hydrateDb, initMysql, persistMysql, prepareDb } from './mysql.js';
import type { DbShape } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultPath = join(__dirname, '..', 'data', 'store.json');

function counts(label: string, db: Pick<DbShape, 'users' | 'periods' | 'expenses' | 'payments'>) {
  const line = `${label}: users=${db.users.length} periods=${db.periods.length} expenses=${db.expenses.length} payments=${db.payments.length}`;
  console.log(line);
  return line;
}

function persistable(db: DbShape) {
  const periodIds = new Set<string>();
  const skippedPeriods: string[] = [];
  for (const p of db.periods) {
    const id = asPeriodId(p.id);
    if (!id) skippedPeriods.push(p.id);
    else periodIds.add(id);
  }
  const inPeriod = <T extends { periodId: string }>(rows: T[]) =>
    rows.filter((row) => {
      const id = asPeriodId(row.periodId);
      return Boolean(id && periodIds.has(id));
    });
  return {
    skippedPeriods,
    users: db.users.length,
    periods: periodIds.size,
    expenses: inPeriod(db.expenses).length,
    payments: inPeriod(db.payments).length,
  };
}

function looksLikeRedactedAdminExport(raw: Partial<DbShape>): boolean {
  const emailUsers = (raw.users || []).filter((u) => u.email);
  return emailUsers.length > 0 && emailUsers.every((u) => !u.passwordHash);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--force');
  const force = process.argv.includes('--force');
  const filePath = args[0] || defaultPath;
  if (!existsSync(filePath)) {
    console.error(`store file not found: ${filePath}`);
    process.exit(1);
  }

  let parsed: Partial<DbShape>;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    const env = parseDonghamExport(raw);
    parsed = (env.payload || raw) as Partial<DbShape>;
  } catch (err) {
    console.error(`cannot parse ${filePath}`, err);
    process.exit(1);
  }

  if (looksLikeRedactedAdminExport(parsed)) {
    console.error(
      'refusing admin-export-like dump (no passwordHash / payoutMethods). Import store.json, not GET /admin/export.',
    );
    process.exit(1);
  }

  const db: DbShape = { ...emptyDb(), ...parsed };
  counts('source', db);
  await rewriteLegacyPeriodIds(db);
  const prepared = prepareDb(db);
  counts('prepared', prepared);
  const expect = persistable(prepared);
  if (expect.skippedPeriods.length) {
    console.warn(`skipping ${expect.skippedPeriods.length} period(s) with invalid id: ${expect.skippedPeriods.join(', ')}`);
  }
  console.log(
    `expected persist: users=${expect.users} periods=${expect.periods} expenses=${expect.expenses} payments=${expect.payments}`,
  );

  await initMysql();
  const existing = await hydrateDb();
  const occupied = existing.users.length > 0 || existing.periods.length > 0;
  if (occupied && !force) {
    console.error('MySQL already has data. Re-run with --force to replace.');
    process.exit(1);
  }

  await persistMysql(prepared);
  const loaded = await hydrateDb();
  counts('mysql', loaded);

  const mismatch =
    loaded.users.length !== expect.users ||
    loaded.periods.length !== expect.periods ||
    loaded.expenses.length !== expect.expenses ||
    loaded.payments.length !== expect.payments;
  if (mismatch) {
    console.error('import count mismatch versus expected persistable rows');
    process.exit(1);
  }

  console.log(
    `imported ${filePath}: users=${loaded.users.length} periods=${loaded.periods.length} expenses=${loaded.expenses.length} payments=${loaded.payments.length}`,
  );
  process.exit(0);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
