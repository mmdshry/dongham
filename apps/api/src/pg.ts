import type { DbShape } from './types.js';

let pool: import('pg').Pool | null = null;

export function usingPostgres(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function initPostgres(): Promise<DbShape | null> {
  if (!process.env.DATABASE_URL) return null;
  const { Pool } = await import('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dongham_store (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  const res = await pool.query<{ value: DbShape }>('SELECT value FROM dongham_store WHERE key = $1', ['main']);
  return res.rows[0]?.value ?? null;
}

export async function persistPostgres(db: DbShape): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO dongham_store(key, value, updated_at)
     VALUES ('main', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(db)],
  );
}
