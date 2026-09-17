import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { schema } from '@isms/db';
import { SYSTEM_ROLES, type Permission } from '@isms/shared';
import { DbService } from '../db/db.service';

interface Entry {
  pv: number;
  permissions: ReadonlySet<Permission>;
  cachedAt: number;
}

const TTL_MS = 5 * 60 * 1000;

/**
 * Effektive Permissions je Mitgliedschaft. Der Cache ist pro Prozess; Konsistenz über Instanzen
 * garantiert `tenant.permissions_version` (pv) im Token: weicht es ab, wird neu geladen.
 */
@Injectable()
export class PermissionCacheService {
  private readonly cache = new Map<string, Entry>();
  private readonly platformPermissions: ReadonlySet<Permission> = new Set(
    SYSTEM_ROLES.find((r) => r.key === 'platform_admin')!.permissions,
  );

  constructor(private readonly dbs: DbService) {}

  forPlatformAdmin(): ReadonlySet<Permission> {
    return this.platformPermissions;
  }

  async forMembership(membershipId: string, tokenPv: number): Promise<ReadonlySet<Permission>> {
    const hit = this.cache.get(membershipId);
    if (hit && hit.pv === tokenPv && Date.now() - hit.cachedAt < TTL_MS) return hit.permissions;
    const loaded = await this.load(membershipId);
    this.cache.set(membershipId, { ...loaded, cachedAt: Date.now() });
    return loaded.permissions;
  }

  /** Aktuelle permissions_version des Mandanten (für pv-Abgleich nach Rollenänderungen). */
  async currentVersion(tenantId: string): Promise<number> {
    const [row] = await this.dbs.db
      .select({ pv: schema.tenant.permissionsVersion })
      .from(schema.tenant)
      .where(eq(schema.tenant.id, tenantId));
    return row?.pv ?? 0;
  }

  invalidate(membershipId: string): void {
    this.cache.delete(membershipId);
  }

  private async load(membershipId: string): Promise<{ pv: number; permissions: ReadonlySet<Permission> }> {
    const rows = await this.dbs.db
      .select({ key: schema.rolePermission.permissionKey, pv: schema.tenant.permissionsVersion })
      .from(schema.membershipRole)
      .innerJoin(schema.rolePermission, eq(schema.rolePermission.roleId, schema.membershipRole.roleId))
      .innerJoin(schema.tenantMembership, eq(schema.tenantMembership.id, schema.membershipRole.membershipId))
      .innerJoin(schema.tenant, eq(schema.tenant.id, schema.tenantMembership.tenantId))
      .where(eq(schema.membershipRole.membershipId, membershipId));
    return { pv: rows[0]?.pv ?? 0, permissions: new Set(rows.map((r) => r.key as Permission)) };
  }
}
