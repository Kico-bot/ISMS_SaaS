import { createDb, createPool } from '../client';
import { seedAll } from '../seed';

const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) {
  console.error('DATABASE_URL_MIGRATOR ist nicht gesetzt');
  process.exit(1);
}
const pool = createPool(url, { max: 1 });
seedAll(createDb(pool))
  .then(() => console.log('seed complete'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
