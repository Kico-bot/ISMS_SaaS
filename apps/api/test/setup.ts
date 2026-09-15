/**
 * Testumgebung: eigene Datenbank (DATABASE_URL_TEST als Migrator), Schema frisch migriert + geseedet,
 * API-Verbindung als eingeschränkte App-Rolle — so laufen die Tests durch echte RLS-Policies.
 */
import { createDb, createPool, runMigrations, seedAll } from '@isms/db';
import { Pool } from 'pg';

export const MIGRATOR_URL = process.env.DATABASE_URL_TEST ?? 'postgres://isms_migrator:isms_migrator@localhost:5432/isms_test';
export const APP_URL = MIGRATOR_URL.replace('isms_migrator:isms_migrator', 'isms_app:isms_app');

export async function prepareTestDatabase(): Promise<void> {
  const p = new Pool({ connectionString: MIGRATOR_URL, max: 1 });
  await p.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;');
  await p.query('CREATE EXTENSION IF NOT EXISTS ltree; CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext;');
  await p.query('GRANT USAGE ON SCHEMA public TO isms_app;');
  await p.end();
  await runMigrations(MIGRATOR_URL);
  const pool = createPool(MIGRATOR_URL, { max: 1 });
  try {
    await seedAll(createDb(pool), () => {});
  } finally {
    await pool.end();
  }
}

export function setTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = APP_URL;
  process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-test-secret';
  process.env.APP_MASTER_KEY ??= 'test-master-key-test-master-key';
}
