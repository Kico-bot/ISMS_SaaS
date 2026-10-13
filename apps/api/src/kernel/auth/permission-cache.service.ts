import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { schema } from '@isms/db';
import { SYSTEM_ROLES, type MembershipStatus, type Permission } from '@isms/shared';
import { DbService } from '../db/db.service';

/** Mitgliedschaft, wie der Guard sie gegen die Claims des Tokens prüft. */
export interface MembershipGrant {
  tenantId: string;
  userId: string;
  status: MembershipStatus;
  pv: number;
  permissions: ReadonlySet<Permission>;
}

interface Entry extends MembershipGrant {
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
    return (await this.membership(membershipId, tokenPv))?.permissions ?? new Set<Permission>();
  }

  /**
   * Mitgliedschaft mit Mandant, Konto und Status. `null`, wenn es sie nicht gibt. Der Guard
   * vergleicht Mandant und Konto mit den Claims: ein Token gilt nur für den Mandanten der
   * Mitgliedschaft, über die es seine Rechte bezieht.
   */
  async membership(membershipId: string, tokenPv: number): Promise<MembershipGrant | null> {
    const hit = this.cache.get(membershipId);
    if (hit && hit.pv === tokenPv && Date.now() - hit.cachedAt < TTL_MS) return hit;
    const loaded = await this.load(membershipId);
    if (!loaded) {
      this.cache.delete(membershipId);
      return null;
    }
    const entry = { ...loaded, cachedAt: Date.now() };
    this.cache.set(membershipId, entry);
    return entry;
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

  private async load(membershipId: string): Promise<MembershipGrant | null> {
    const [m] = await this.dbs.db
      .select({
        tenantId: schema.tenantMembership.tenantId,
        userId: schema.tenantMembership.userId,
        status: schema.tenantMembership.status,
        pv: schema.tenant.permissionsVersion,
      })
      .from(schema.tenantMembership)
      .innerJoin(schema.tenant, eq(schema.tenant.id, schema.tenantMembership.tenantId))
      .where(eq(schema.tenantMembership.id, membershipId));
    if (!m) return null;
    const rows = await this.dbs.db
      .select({ key: schema.rolePermission.permissionKey })
      .from(schema.membershipRole)
      .innerJoin(schema.rolePermission, eq(schema.rolePermission.roleId, schema.membershipRole.roleId))
      .where(eq(schema.membershipRole.membershipId, membershipId));
    return { ...m, permissions: new Set(rows.map((r) => r.key as Permission)) };
  }
}
