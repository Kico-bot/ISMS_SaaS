import type { Permission } from './permissions';

/** Sicherheitskontext eines Aufrufs — aus dem JWT + Permission-Cache aufgebaut. */
export interface AuthContext {
  userId: string;
  tenantId: string | null;
  membershipId: string | null;
  /** person.id des Aufrufers im Mandanten (für Ownership-Scoping); null wenn keine Person verknüpft */
  personId: string | null;
  permissions: ReadonlySet<Permission>;
  isPlatformAdmin: boolean;
}

/** Ein Datensatz mit optionalem Owner (person.id). */
export interface Owned {
  ownerPersonId?: string | null;
}

/**
 * Prüft eine Permission gegen den Kontext. Für `X.write` wird automatisch auch `X.write_own`
 * akzeptiert, wenn der Aufrufer Owner des übergebenen Datensatzes ist.
 */
export function can(ctx: AuthContext, permission: Permission, resource?: Owned | null): boolean {
  if (ctx.permissions.has(permission)) return true;
  if (permission.endsWith('.write')) {
    const own = `${permission}_own` as Permission;
    if (ctx.permissions.has(own) && resource?.ownerPersonId && ctx.personId === resource.ownerPersonId)
      return true;
  }
  return false;
}

/** Sammelt alle Permissions, die ein Kontext auf einem Datensatz effektiv hat — für `_actions` in API-Antworten. */
export function actionsFor(
  ctx: AuthContext,
  candidates: readonly Permission[],
  resource?: Owned | null,
): Permission[] {
  return candidates.filter((p) => can(ctx, p, resource));
}
