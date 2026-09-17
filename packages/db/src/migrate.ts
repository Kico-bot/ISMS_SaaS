import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';
import { createDb, createPool } from './client';

/** Führt alle ausstehenden Migrationen aus `migrations/` aus (Drizzle-Journal). */
export async function runMigrations(connectionString: string): Promise<void> {
  const pool = createPool(connectionString, { max: 1 });
  try {
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: join(__dirname, '..', 'migrations') });
  } finally {
    await pool.end();
  }
}
