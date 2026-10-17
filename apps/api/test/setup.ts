/**
 * Testumgebung: eigene Datenbank (DATABASE_URL_TEST als Migrator), Schema frisch migriert + geseedet,
 * API-Verbindung als eingeschränkte App-Rolle — so laufen die Tests durch echte RLS-Policies.
 */
import { createDb, createPool, runMigrations, seedAll } from '@isms/db';
import { Pool } from 'pg';

export const MIGRATOR_URL =
  process.env.DATABASE_URL_TEST ?? 'postgres://isms_migrator:isms_migrator@localhost:5432/isms_test';
export const APP_URL = MIGRATOR_URL.replace('isms_migrator:isms_migrator', 'isms_app:isms_app');

/**
 * Bricht ab, wenn `url` nicht als `isms_app` ohne BYPASSRLS verbindet. `APP_URL` entsteht per
 * Textersetzung; mit anderen Zugangsdaten in `DATABASE_URL_TEST` liefen sonst alle Tests still als
 * Tabelleneigentümer, an der Zeilensicherheit vorbei.
 */
export async function assertAppRole(url: string): Promise<void> {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    const { rows } = await p.query<{ who: string; bypass: boolean }>(
      'SELECT current_user AS who, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user',
    );
    const r = rows[0];
    if (r?.who !== 'isms_app' || r.bypass) {
      throw new Error(
        `Die App-Verbindung der Tests muss als isms_app ohne BYPASSRLS laufen, läuft aber als ${r?.who ?? 'unbekannt'}. DATABASE_URL_TEST prüfen.`,
      );
    }
  } finally {
    await p.end();
  }
}

export async function prepareTestDatabase(): Promise<void> {
  await assertAppRole(APP_URL);
  const p = new Pool({ connectionString: MIGRATOR_URL, max: 1 });
  await p.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;');
  await p.query(
    'CREATE EXTENSION IF NOT EXISTS ltree; CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext;',
  );
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

/**
 * Datum `n` Tage ab heute als `YYYY-MM-DD`. Für Fristen und Gültigkeiten, die im Test „noch
 * offen“ sein sollen: ein fest eingetragenes Datum ist irgendwann Vergangenheit, und der Test
 * wird dann an einem beliebigen Tag rot, ohne dass sich am Code etwas geändert hat.
 */
export function inDays(n: number): string {
  // „Heute“ wie die API: in deutscher Zeit. In UTC wäre zwischen 0 und 2 Uhr noch gestern.
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
  const d = new Date(`${today}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
