import { Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import { type AuthContext, type BusinessProcessDto, type BusinessProcessPatchDto, P } from '@isms/shared';
import { and, eq, sql } from 'drizzle-orm';
import { assertCan } from '../../kernel/auth/policy';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/**
 * Geschäftsprozesse — der Anker der Business-Impact-Analyse. Ein ISMS schützt keine Server,
 * sondern die Prozesse, die auf ihnen laufen; erst über den Prozess bekommt ein Asset seine
 * Kritikalität.
 */
@Injectable()
export class ProcessesService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT p.id, p.name, p.department, p.description, p.tier,
               p.owner_person_id AS "ownerPersonId", o.name AS "ownerName",
               b.id AS "biaId", b.status::text AS "biaStatus",
               b.mtpd_hours AS "mtpdHours", b.rto_hours AS "rtoHours", b.rpo_hours AS "rpoHours",
               (SELECT count(*)::int FROM continuity_plan cp WHERE cp.bia_id = b.id) AS "planCount"
        FROM business_process p
        LEFT JOIN person o ON o.id = p.owner_person_id
        LEFT JOIN bia b ON b.process_id = p.id AND b.tenant_id = ${tenantId}
        WHERE p.tenant_id = ${tenantId}
        ORDER BY p.tier NULLS LAST, p.name`);
      return res.rows;
    });
  }

  async create(ctx: AuthContext, dto: BusinessProcessDto) {
    const tenantId = ctx.tenantId!;
    assertCan(ctx, P.CONTINUITY_WRITE, { ownerPersonId: dto.ownerPersonId ?? ctx.personId });
    return this.dbs.tenant(tenantId, async (tx) => {
      const [p] = await tx
        .insert(schema.businessProcess)
        .values({
          tenantId,
          name: dto.name,
          department: dto.department ?? null,
          description: dto.description ?? null,
          ownerPersonId: dto.ownerPersonId ?? null,
          tier: dto.tier ?? null,
        })
        .returning();
      return p;
    });
  }

  async update(ctx: AuthContext, id: string, dto: BusinessProcessPatchDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      assertCan(ctx, P.CONTINUITY_WRITE, existing);
      const set: Record<string, unknown> = {};
      for (const k of ['name', 'department', 'description', 'ownerPersonId', 'tier'] as const) {
        if (dto[k] !== undefined) set[k] = dto[k];
      }
      if (!Object.keys(set).length) return existing;
      const [p] = await tx
        .update(schema.businessProcess)
        .set(set)
        .where(eq(schema.businessProcess.id, id))
        .returning();
      return p;
    });
  }

  async remove(ctx: AuthContext, id: string) {
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      assertCan(ctx, P.CONTINUITY_WRITE, existing);
      await tx.delete(schema.businessProcess).where(eq(schema.businessProcess.id, id));
    });
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [p] = await tx
      .select()
      .from(schema.businessProcess)
      .where(and(eq(schema.businessProcess.id, id), eq(schema.businessProcess.tenantId, tenantId)));
    if (!p) throw new NotFoundException({ title: 'Geschäftsprozess nicht gefunden' });
    return p;
  }
}
