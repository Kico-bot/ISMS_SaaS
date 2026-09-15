import type { Db } from '../client';
import { seedCatalog } from './catalog';
import { seedRbac } from './rbac';

export { seedCatalog, seedRbac };

export async function seedAll(db: Db, log: (m: string) => void = console.log): Promise<void> {
  await db.transaction(async (tx) => {
    await seedRbac(tx, log);
    await seedCatalog(tx, log);
  });
}
