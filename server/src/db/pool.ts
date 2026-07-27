import { Pool, QueryResultRow } from 'pg';
import { config } from '../config';

/**
 * Shared PostgreSQL connection pool. SSL is enabled automatically for managed
 * providers (Render) where the connection string points at a remote host.
 */
export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
});

/** Runs a parameterised query and returns the typed rows. */
export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

/** Runs a query expected to return at most one row. */
export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
