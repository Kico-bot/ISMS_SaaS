import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function createPool(connectionString: string, extra: PoolConfig = {}): Pool {
  return new Pool({ connectionString, max: 10, ...extra });
}

export function createDb(pool: Pool): Db {
  return drizzle(pool, { schema, casing: 'snake_case' });
}

/**
 * Führt `fn` in einer Transaktion aus, in der Row-Level-Security auf den Mandanten gebunden ist.
 * `SET LOCAL` gilt nur für diese Transaktion — nach COMMIT/ROLLBACK ist die Verbindung wieder neutral.
 * Ohne tenantId (Plattform-Kontext) bleibt `app.tenant_id` leer → RLS liefert keine Mandantenzeilen.
 */
export async function withTenant<T>(db: Db, tenantId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    if (tenantId) {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    }
    return fn(tx);
  });
}

export { schema };
