import { runMigrations } from '../migrate';

const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) {
  console.error('DATABASE_URL_MIGRATOR ist nicht gesetzt');
  process.exit(1);
}
runMigrations(url)
  .then(() => console.log('migrations applied'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
