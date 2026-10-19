import { NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { TenantTx } from './db.service';

type TenantTable = PgTable & { id: PgColumn; tenantId: PgColumn };

/**
 * Jede verknüpfte ID muss im eigenen Mandanten liegen, bevor sie gespeichert wird. Der
 * Fremdschlüssel allein prüft das nicht: PostgreSQL wertet ihn ohne RLS aus, eine ID aus einem
 * anderen Mandanten ginge also durch. Antwort ist 404 wie bei jedem anderen unbekannten Datensatz,
 * damit der Statuscode nicht verrät, ob die ID woanders existiert.
 */
export async function requireOwn(
  tx: TenantTx,
  tenantId: string,
  table: TenantTable,
  ids: readonly (string | null | undefined)[],
  title = 'Verknüpfter Datensatz nicht gefunden',
): Promise<void> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (!wanted.length) return;
  const found = await tx
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.tenantId, tenantId), inArray(table.id, wanted)));
  if (found.length !== wanted.length) throw new NotFoundException({ title });
}
