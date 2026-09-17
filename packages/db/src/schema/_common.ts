import { sql } from 'drizzle-orm';
import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';

/** ltree (Extension) — hierarchische Pfade im Katalog. */
export const ltree = customType<{ data: string; driverData: string }>({
  dataType: () => 'ltree',
});

/** citext (Extension) — case-insensitive E-Mail-Adressen. */
export const citext = customType<{ data: string; driverData: string }>({
  dataType: () => 'citext',
});

export const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};
