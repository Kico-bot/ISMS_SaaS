import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import { type AuthContext, type BusinessProcessDto, type BusinessProcessPatchDto, P } from '@isms/shared';
import { and, eq, sql } from 'drizzle-orm';
import { assertCan } from '../../kernel/auth/policy';
import { DbService, type TenantTx } from '../../kernel/db/db.service';
import { resetBiaApproval } from './bia.service';

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
      const ownerChanged = dto.ownerPersonId !== undefined && dto.ownerPersonId !== existing.ownerPersonId;
      // Unter `_own` gilt die Prüfung auch für den neuen Eigentümer: weitergeben braucht das volle Recht.
      if (ownerChanged) assertCan(ctx, P.CONTINUITY_WRITE, { ownerPersonId: dto.ownerPersonId ?? null });
      const set: Record<string, unknown> = {};
      for (const k of ['name', 'department', 'description', 'ownerPersonId', 'tier'] as const) {
        if (dto[k] !== undefined) set[k] = dto[k];
      }
      if (!Object.keys(set).length) return existing;
      if (ownerChanged) {
        const [bia] = await tx
          .select({ id: schema.bia.id })
          .from(schema.bia)
          .where(and(eq(schema.bia.processId, id), eq(schema.bia.tenantId, tenantId)));
        if (bia) await resetBiaApproval(tx, bia.id);
      }
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
      await this.assertNoDependents(tx, id);
      await tx.delete(schema.businessProcess).where(eq(schema.businessProcess.id, id));
    });
  }

  /**
   * BIA, Pläne und Übungen hängen per Kaskade am Prozess. Eine freigegebene BIA, ein aktiver Plan
   * oder eine erfasste Übung sind Nachweise; sie verschwinden nicht mit einem Löschen.
   */
  private async assertNoDependents(tx: TenantTx, id: string) {
    const [row] = (
      await tx.execute(sql`
        SELECT
          (SELECT count(*)::int FROM bia b WHERE b.process_id = ${id} AND b.status = 'approved') AS "approvedBia",
          (SELECT count(*)::int FROM continuity_plan cp JOIN bia b ON b.id = cp.bia_id
            WHERE b.process_id = ${id} AND cp.status <> 'draft') AS "plans",
          (SELECT count(*)::int FROM bc_exercise e JOIN continuity_plan cp ON cp.id = e.plan_id
            JOIN bia b ON b.id = cp.bia_id WHERE b.process_id = ${id}) AS "exercises"`)
    ).rows as { approvedBia: number; plans: number; exercises: number }[];
    const parts = [
      row!.approvedBia ? 'eine freigegebene BIA' : null,
      row!.plans ? `${row!.plans} aktive oder archivierte Notfallpläne` : null,
      row!.exercises ? `${row!.exercises} erfasste Übungen` : null,
    ].filter(Boolean);
    if (parts.length) {
      throw new ConflictException({
        title: 'Der Prozess lässt sich nicht löschen',
        detail: `An diesem Prozess hängen ${parts.join(', ')}. Löschen würde sie mitnehmen; der Prozess bleibt deshalb bestehen.`,
      });
    }
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
