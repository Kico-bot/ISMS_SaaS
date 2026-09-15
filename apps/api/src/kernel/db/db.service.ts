import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createDb, createPool, withTenant, type Db, type Tx } from '@isms/db';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import type { RefKind } from '@isms/shared';
import { loadEnv } from '../../config/env';

/** Transaktion mit gesetztem Mandantenkontext (RLS aktiv). */
export type TenantTx = Tx;

/**
 * Zentrale DB-Anbindung. Fachcode nutzt ausschließlich `tenant(ctx, fn)` — damit ist jede
 * Mandantenabfrage automatisch an die RLS-Policy gebunden. `platform(fn)` ist für die
 * mandantenlosen Tabellen (user, tenant, tenant_membership) reserviert.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool: Pool;
  readonly db: Db;

  constructor() {
    const env = loadEnv();
    this.pool = createPool(env.DATABASE_URL, { max: env.NODE_ENV === 'test' ? 4 : 10 });
    this.db = createDb(this.pool);
  }

  tenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return withTenant(this.db, tenantId, fn);
  }

  platform<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return withTenant(this.db, null, fn);
  }

  /**
   * Nächste fortlaufende Referenznummer des Mandanten (R-0007, INC-0042 …).
   * Zählt in derselben Transaktion hoch — lückenlos und ohne Race zwischen parallelen Anlagen.
   */
  async nextRefNo(tx: TenantTx, tenantId: string, kind: RefKind, prefix: string): Promise<string> {
    const r = await tx.execute(sql`SELECT next_ref_no(${tenantId}::uuid, ${kind}, ${prefix}) AS ref`);
    const ref = (r.rows[0] as { ref?: string } | undefined)?.ref;
    if (!ref) throw new Error(`Referenznummer für ${kind} konnte nicht vergeben werden`);
    return ref;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
