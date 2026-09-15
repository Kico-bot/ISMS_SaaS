/**
 * Entwicklungs-Helfer: Schema komplett verwerfen, Migrationen + Seeds neu einspielen.
 * Verweigert die Ausführung, wenn NODE_ENV=production.
 */
import { Pool } from 'pg';
import { runMigrations } from '../migrate';
import { createDb, createPool } from '../client';
import { seedAll } from '../seed';

const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) {
  console.error('DATABASE_URL_MIGRATOR ist nicht gesetzt');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  console.error('reset ist in Produktion gesperrt');
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE;');
    await pool.query('CREATE EXTENSION IF NOT EXISTS ltree; CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext;');
    await pool.query('GRANT USAGE ON SCHEMA public TO isms_app;');
  } finally {
    await pool.end();
  }
  await runMigrations(url!);
  const p2 = createPool(url!, { max: 1 });
  try {
    await seedAll(createDb(p2));
  } finally {
    await p2.end();
  }
  console.log('reset complete');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
