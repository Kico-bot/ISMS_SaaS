import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { schema } from '@isms/db';
import { and, eq } from 'drizzle-orm';
import type { TenantTx } from '../db/db.service';
import { type AuthContext, type Owned, type Permission, can } from '@isms/shared';

/**
 * Prüft eine Permission auf einem konkreten Datensatz und wirft 403, wenn sie fehlt.
 * Nötig für `*_own`-Rechte: der Guard kennt den Datensatz noch nicht, der Service schon.
 */
export function assertCan(ctx: AuthContext, permission: Permission, resource?: Owned | null): void {
  if (!can(ctx, permission, resource)) {
    throw new ForbiddenException({
      title: 'Keine Berechtigung',
      detail: resource ? `${permission}, nur für eigene Einträge` : permission,
    });
  }
}

/** Welche der übergebenen Aktionen auf diesem Datensatz erlaubt sind — für `_actions` in API-Antworten. */
export function allowedActions(
  ctx: AuthContext,
  candidates: readonly Permission[],
  resource?: Owned | null,
): Permission[] {
  return candidates.filter((p) => can(ctx, p, resource));
}

/**
 * Eigentümer eines neuen Datensatzes. Mit vollem Recht gilt die Angabe, auch leer. Mit nur
 * `_own` wird die anlegende Person Eigentümerin, wenn nichts angegeben ist, und eine andere
 * Person ist nicht zulässig: gespeichert wird genau der Wert, der geprüft wurde.
 */
export function creationOwner(
  ctx: AuthContext,
  permission: Permission,
  requested: string | null | undefined,
): string | null {
  if (ctx.permissions.has(permission)) return requested ?? null;
  const owner = requested ?? ctx.personId ?? null;
  assertCan(ctx, permission, { ownerPersonId: owner });
  return owner;
}

/**
 * Als Eigentümerin wählbar ist eine aktive Person des eigenen Mandanten. Eine deaktivierte
 * Person trägt keine Verantwortung mehr; Erinnerungen und `_own` liefen sonst ins Leere.
 */
export async function assertSelectableOwner(
  tx: TenantTx,
  tenantId: string,
  personId: string | null | undefined,
): Promise<void> {
  if (!personId) return;
  const [p] = await tx
    .select({ isActive: schema.person.isActive })
    .from(schema.person)
    .where(and(eq(schema.person.id, personId), eq(schema.person.tenantId, tenantId)));
  if (!p?.isActive) {
    throw new BadRequestException({
      title: 'Person nicht wählbar',
      detail: p
        ? 'Die Person ist deaktiviert und kann keine Verantwortung übernehmen.'
        : 'Die Person gehört nicht zu diesem Mandanten.',
    });
  }
}
