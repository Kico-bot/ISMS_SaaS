import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import type { AuthContext, PersonDto, PersonPatchDto } from '@isms/shared';
import { and, eq, sql } from 'drizzle-orm';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/**
 * Beschäftigte des Mandanten. Nicht jede Person hat ein Benutzerkonto — Verantwortung für
 * Assets, Risiken und Maßnahmen muss sich auch Menschen zuordnen lassen, die nie einloggen.
 */
@Injectable()
export class PersonsService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string, includeInactive = false) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT p.id, p.name, p.email, p.department, p.position, p.is_active AS "isActive",
               p.user_id IS NOT NULL AS "hasLogin",
               (SELECT count(*)::int FROM asset a WHERE a.owner_person_id = p.id) AS "assetCount",
               (SELECT count(*)::int FROM risk r WHERE r.owner_person_id = p.id AND r.status <> 'closed') AS "riskCount",
               (SELECT count(*)::int FROM measure m WHERE m.owner_person_id = p.id) AS "measureCount",
               (SELECT count(*)::int FROM "action" ac WHERE ac.owner_person_id = p.id AND ac.status IN ('open','in_progress')) AS "actionCount",
               (SELECT count(*)::int FROM security_objective o WHERE o.owner_person_id = p.id AND o.status IN ('active','at_risk')) AS "objectiveCount"
        FROM person p
        WHERE p.tenant_id = ${tenantId} ${includeInactive ? sql`` : sql`AND p.is_active`}
        ORDER BY p.is_active DESC, p.name`);
      return res.rows;
    });
  }

  async create(ctx: AuthContext, dto: PersonDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.assertEmailFree(tx, tenantId, dto.email ?? null, null);
      const [p] = await tx
        .insert(schema.person)
        .values({
          tenantId,
          name: dto.name,
          email: dto.email ?? null,
          department: dto.department ?? null,
          position: dto.position ?? null,
          isActive: dto.isActive,
        })
        .returning();
      return p;
    });
  }

  async update(ctx: AuthContext, id: string, dto: PersonPatchDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      if (dto.email !== undefined) await this.assertEmailFree(tx, tenantId, dto.email ?? null, id);
      const set: Record<string, unknown> = {};
      for (const k of ['name', 'email', 'department', 'position', 'isActive'] as const) {
        if (dto[k] !== undefined) set[k] = dto[k];
      }
      if (!Object.keys(set).length) return existing;
      const [p] = await tx.update(schema.person).set(set).where(eq(schema.person.id, id)).returning();
      return p;
    });
  }

  /**
   * Personen werden nicht gelöscht, sondern deaktiviert: an ihnen hängen Zuweisungen,
   * Lesebestätigungen und Nachweise, die für ein Audit erhalten bleiben müssen.
   */
  async deactivate(ctx: AuthContext, id: string) {
    return this.update(ctx, id, { isActive: false });
  }

  private async assertEmailFree(
    tx: TenantTx,
    tenantId: string,
    email: string | null,
    exceptId: string | null,
  ) {
    if (!email) return;
    const rows = await tx
      .select({ id: schema.person.id })
      .from(schema.person)
      .where(and(eq(schema.person.tenantId, tenantId), eq(schema.person.email, email)));
    if (rows.some((r) => r.id !== exceptId)) {
      throw new ConflictException({ title: `Für ${email} ist bereits eine Person erfasst` });
    }
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [p] = await tx
      .select()
      .from(schema.person)
      .where(and(eq(schema.person.id, id), eq(schema.person.tenantId, tenantId)));
    if (!p) throw new NotFoundException({ title: 'Person nicht gefunden' });
    return p;
  }
}
