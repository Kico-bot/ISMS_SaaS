import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { schema, type Tx } from '@isms/db';
import { type InviteMemberDto, type SetMemberRolesDto, TENANT_ROLE_KEYS } from '@isms/shared';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { INVITE_PLACEHOLDER } from '../auth/auth.types';
import { PermissionCacheService } from '../auth/permission-cache.service';
import { SodService } from '../auth/sod.service';
import { DbService } from '../db/db.service';

export interface MemberView {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  status: string;
  roles: string[];
  personId: string | null;
}

@Injectable()
export class MembersService {
  constructor(
    private readonly dbs: DbService,
    private readonly sod: SodService,
    private readonly perms: PermissionCacheService,
  ) {}

  async list(tenantId: string): Promise<MemberView[]> {
    return this.dbs.tenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          membershipId: schema.tenantMembership.id,
          userId: schema.user.id,
          email: schema.user.email,
          displayName: schema.user.displayName,
          status: schema.tenantMembership.status,
          roleKey: schema.role.key,
          personId: schema.person.id,
        })
        .from(schema.tenantMembership)
        .innerJoin(schema.user, eq(schema.user.id, schema.tenantMembership.userId))
        .leftJoin(schema.membershipRole, eq(schema.membershipRole.membershipId, schema.tenantMembership.id))
        .leftJoin(schema.role, eq(schema.role.id, schema.membershipRole.roleId))
        .leftJoin(schema.person, and(eq(schema.person.userId, schema.user.id), eq(schema.person.tenantId, tenantId)))
        .where(eq(schema.tenantMembership.tenantId, tenantId));
      const map = new Map<string, MemberView>();
      for (const r of rows) {
        const m = map.get(r.membershipId) ?? { membershipId: r.membershipId, userId: r.userId, email: r.email, displayName: r.displayName, status: r.status, roles: [], personId: r.personId };
        if (r.roleKey) m.roles.push(r.roleKey);
        map.set(r.membershipId, m);
      }
      return [...map.values()];
    });
  }

  /** Einladung: User anlegen (falls neu, ohne Passwort → setzt es über den Einladungslink), Membership + Rollen. */
  async invite(tenantId: string, actorUserId: string, dto: InviteMemberDto): Promise<{ membershipId: string; inviteToken: string }> {
    return this.dbs.tenant(tenantId, async (tx) => {
      let [u] = await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, dto.email));
      if (!u) {
        // Platzhalter statt Passwort: das Konto ist erst nach Annahme der Einladung anmeldbar.
        [u] = await tx
          .insert(schema.user)
          .values({ email: dto.email, displayName: dto.displayName, passwordHash: INVITE_PLACEHOLDER, authProvider: 'local' })
          .returning({ id: schema.user.id });
      }
      const userId = u!.id;
      const existing = await tx
        .select({ id: schema.tenantMembership.id })
        .from(schema.tenantMembership)
        .where(and(eq(schema.tenantMembership.tenantId, tenantId), eq(schema.tenantMembership.userId, userId)));
      if (existing.length) throw new ConflictException({ title: 'Bereits Mitglied dieses Mandanten' });

      const roleIds = await this.resolveRoles(tx, tenantId, dto.roleKeys);
      await this.assertSod(tx, tenantId, roleIds, false);

      const raw = randomBytes(32).toString('base64url');
      const [m] = await tx
        .insert(schema.tenantMembership)
        .values({
          tenantId,
          userId,
          status: 'invited',
          invitedByUserId: actorUserId,
          inviteTokenHash: createHash('sha256').update(raw).digest('hex'),
          inviteExpiresAt: new Date(Date.now() + 7 * 86_400_000),
        })
        .returning({ id: schema.tenantMembership.id });
      await tx.insert(schema.membershipRole).values(roleIds.map((roleId) => ({ membershipId: m!.id, roleId })));

      if (dto.personId) {
        await tx.update(schema.person).set({ userId }).where(and(eq(schema.person.id, dto.personId), eq(schema.person.tenantId, tenantId)));
      } else {
        await tx.insert(schema.person).values({ tenantId, userId, name: dto.displayName, email: dto.email });
      }
      await this.bumpPermissionsVersion(tx, tenantId);
      return { membershipId: m!.id, inviteToken: raw };
    });
  }

  async setRoles(tenantId: string, membershipId: string, dto: SetMemberRolesDto): Promise<{ warnings: string[] }> {
    return this.dbs.tenant(tenantId, async (tx) => {
      const [m] = await tx
        .select({ id: schema.tenantMembership.id })
        .from(schema.tenantMembership)
        .where(and(eq(schema.tenantMembership.id, membershipId), eq(schema.tenantMembership.tenantId, tenantId)));
      if (!m) throw new NotFoundException();
      const roleIds = await this.resolveRoles(tx, tenantId, dto.roleKeys);
      const warnings = await this.assertSod(tx, tenantId, roleIds, dto.acknowledgeSodWarnings);
      await tx.delete(schema.membershipRole).where(eq(schema.membershipRole.membershipId, membershipId));
      await tx.insert(schema.membershipRole).values(roleIds.map((roleId) => ({ membershipId, roleId })));
      await this.bumpPermissionsVersion(tx, tenantId);
      this.perms.invalidate(membershipId);
      return { warnings };
    });
  }

  async remove(tenantId: string, membershipId: string, actorMembershipId: string): Promise<void> {
    if (membershipId === actorMembershipId) throw new BadRequestException({ title: 'Eigene Mitgliedschaft kann nicht entfernt werden' });
    await this.dbs.tenant(tenantId, async (tx) => {
      await tx.delete(schema.tenantMembership).where(and(eq(schema.tenantMembership.id, membershipId), eq(schema.tenantMembership.tenantId, tenantId)));
      await this.bumpPermissionsVersion(tx, tenantId);
      this.perms.invalidate(membershipId);
    });
  }

  private async resolveRoles(tx: Tx, tenantId: string, keys: readonly string[]): Promise<string[]> {
    const invalid = keys.filter((k) => !(TENANT_ROLE_KEYS as readonly string[]).includes(k));
    if (invalid.length) throw new BadRequestException({ title: `Unbekannte Rolle(n): ${invalid.join(', ')}` });
    const rows = await tx
      .select({ id: schema.role.id, key: schema.role.key, tenantId: schema.role.tenantId })
      .from(schema.role)
      .where(and(inArray(schema.role.key, [...keys]), or(isNull(schema.role.tenantId), eq(schema.role.tenantId, tenantId))));
    // mandantenspezifische Kopie gewinnt gegenüber der Systemrolle
    return keys.map((k) => (rows.find((r) => r.key === k && r.tenantId === tenantId) ?? rows.find((r) => r.key === k))!.id);
  }

  private async assertSod(tx: Tx, tenantId: string, roleIds: string[], acknowledged: boolean): Promise<string[]> {
    const result = await this.sod.check(tx, tenantId, roleIds);
    if (result.blocking.length) {
      throw new ConflictException({
        type: 'https://isms.example/problems/sod-violation',
        title: 'Funktionstrennung verletzt',
        detail: result.blocking.map((b) => `${b.roleA} + ${b.roleB}: ${b.reason ?? ''}`).join(' | '),
      });
    }
    const warnings = result.warnings.map((w) => `${w.roleA} + ${w.roleB}: ${w.reason ?? ''}`);
    if (warnings.length && !acknowledged) {
      throw new ConflictException({ type: 'https://isms.example/problems/sod-warning', title: 'Funktionstrennung: Warnung bestätigen', detail: warnings.join(' | '), warnings });
    }
    return warnings;
  }

  private async bumpPermissionsVersion(tx: Tx, tenantId: string): Promise<void> {
    await tx.update(schema.tenant).set({ permissionsVersion: sql`${schema.tenant.permissionsVersion} + 1` }).where(eq(schema.tenant.id, tenantId));
  }
}
