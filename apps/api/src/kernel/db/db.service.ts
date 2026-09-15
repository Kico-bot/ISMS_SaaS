import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createDb, createPool, withTenant, type Db, type Tx } from '@isms/db';
import type { Pool } from 'pg';
import { loadEnv } from '../../config/env';

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

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
