import { ForbiddenException } from '@nestjs/common';
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
