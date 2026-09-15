import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import {
  type AuthContext,
  type ListQuery,
  type MapRequirementDto,
  type MeasureDto,
  type MeasurePatchDto,
  P,
  REF_PREFIX,
} from '@isms/shared';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { assertCan } from '../../kernel/auth/policy';
import { DbService } from '../../kernel/db/db.service';

export interface CrosswalkSuggestion {
  requirementId: string;
  framework: string;
  refCode: string;
  title: string;
  relation: string;
}

@Injectable()
export class MeasuresService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string, q: ListQuery & { status?: string; requirementId?: string }) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const where = and(
        eq(schema.measure.tenantId, tenantId),
        q.status ? eq(schema.measure.status, q.status as never) : undefined,
        q.q ? or(ilike(schema.measure.title, `%${q.q}%`), ilike(schema.measure.refNo, `%${q.q}%`)) : undefined,
      );
      const [total] = await tx.select({ n: count() }).from(schema.measure).where(where);
      const items = await tx.execute(sql`
        SELECT m.id, m.ref_no AS "refNo", m.title, m.status::text AS status, m.domain::text AS domain,
               m.maturity, m.due_date AS "dueDate", m.owner_person_id AS "ownerPersonId",
               p.name AS "ownerName",
               COALESCE(mapped.cnt, 0) AS "mappingCount",
               COALESCE(mapped.frameworks, '[]'::json) AS frameworks
        FROM measure m
        LEFT JOIN person p ON p.id = m.owner_person_id
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS cnt, json_agg(DISTINCT f.key) AS frameworks
          FROM measure_requirement mr
          JOIN requirement r ON r.id = mr.requirement_id
          JOIN framework f ON f.id = r.framework_id
          WHERE mr.measure_id = m.id AND mr.tenant_id = ${tenantId}
        ) mapped ON true
        WHERE m.tenant_id = ${tenantId}
          ${q.status ? sql`AND m.status = ${q.status}::measure_status` : sql``}
          ${q.q ? sql`AND (m.title ILIKE ${'%' + q.q + '%'} OR m.ref_no ILIKE ${'%' + q.q + '%'})` : sql``}
        ORDER BY m.ref_no
        LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}`);
      return { items: items.rows, total: total?.n ?? 0, page: q.page, size: q.size };
    });
  }

  async get(tenantId: string, id: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const [m] = await tx.select().from(schema.measure).where(and(eq(schema.measure.id, id), eq(schema.measure.tenantId, tenantId)));
      if (!m) throw new NotFoundException();
      const mappings = await tx.execute(sql`
        SELECT r.id AS "requirementId", f.key AS framework, f.name AS "frameworkName",
               r.ref_code AS "refCode", r.title, mr.coverage::text AS coverage, mr.created_via::text AS "createdVia"
        FROM measure_requirement mr
        JOIN requirement r ON r.id = mr.requirement_id
        JOIN framework f ON f.id = r.framework_id
        WHERE mr.measure_id = ${id} AND mr.tenant_id = ${tenantId}
        ORDER BY f.key, r.sort_order`);
      const risks = await tx.execute(sql`
        SELECT rk.id, rk.ref_no AS "refNo", rk.title, rm.effect::text AS effect
        FROM risk_measure rm JOIN risk rk ON rk.id = rm.risk_id
        WHERE rm.measure_id = ${id} AND rm.tenant_id = ${tenantId}
        ORDER BY rk.ref_no`);
      return { ...m, mappings: mappings.rows, risks: risks.rows };
    });
  }

  async create(ctx: AuthContext, dto: MeasureDto) {
    const tenantId = ctx.tenantId!;
    // write_own greift nur, wenn man sich selbst als Owner einträgt
    assertCan(ctx, P.MEASURE_WRITE, { ownerPersonId: dto.ownerPersonId ?? ctx.personId });
    return this.dbs.tenant(tenantId, async (tx) => {
      const refNo = await this.nextRefNo(tx, tenantId);
      const [m] = await tx
        .insert(schema.measure)
        .values({
          tenantId,
          refNo,
          title: dto.title,
          description: dto.description ?? null,
          domain: dto.domain ?? null,
          ownerPersonId: dto.ownerPersonId ?? null,
          status: dto.status,
          maturity: dto.maturity ?? null,
          dueDate: dto.dueDate ?? null,
          effortDays: dto.effortDays != null ? String(dto.effortDays) : null,
          costEur: dto.costEur != null ? String(dto.costEur) : null,
        })
        .returning();
      return m;
    });
  }

  async update(ctx: AuthContext, id: string, dto: MeasurePatchDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const [existing] = await tx.select().from(schema.measure).where(and(eq(schema.measure.id, id), eq(schema.measure.tenantId, tenantId)));
      if (!existing) throw new NotFoundException();
      assertCan(ctx, P.MEASURE_WRITE, { ownerPersonId: existing.ownerPersonId });
      const [m] = await tx
        .update(schema.measure)
        .set({
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.domain !== undefined ? { domain: dto.domain } : {}),
          ...(dto.ownerPersonId !== undefined ? { ownerPersonId: dto.ownerPersonId } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.maturity !== undefined ? { maturity: dto.maturity } : {}),
          ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate } : {}),
          ...(dto.effortDays !== undefined ? { effortDays: dto.effortDays != null ? String(dto.effortDays) : null } : {}),
          ...(dto.costEur !== undefined ? { costEur: dto.costEur != null ? String(dto.costEur) : null } : {}),
        })
        .where(eq(schema.measure.id, id))
        .returning();
      return m;
    });
  }

  /** Wirksamkeit bestätigen — Vier-Augen-Prinzip, zusätzlich per DB-Trigger abgesichert. */
  async verify(ctx: AuthContext, id: string) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const [m] = await tx
        .update(schema.measure)
        .set({ verifiedByUserId: ctx.userId, verifiedAt: new Date(), status: 'verified' })
        .where(and(eq(schema.measure.id, id), eq(schema.measure.tenantId, tenantId)))
        .returning();
      if (!m) throw new NotFoundException();
      return m;
    });
  }

  async remove(ctx: AuthContext, id: string) {
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      const [existing] = await tx.select().from(schema.measure).where(and(eq(schema.measure.id, id), eq(schema.measure.tenantId, tenantId)));
      if (!existing) throw new NotFoundException();
      assertCan(ctx, P.MEASURE_WRITE, { ownerPersonId: existing.ownerPersonId });
      await tx.delete(schema.measure).where(eq(schema.measure.id, id));
    });
  }

  // --- Multi-Framework-Mapping ---------------------------------------------------------------

  /**
   * Verknüpft die Maßnahme mit einer Anforderung und liefert Vorschläge, welche Anforderungen
   * anderer aktivierter Frameworks damit üblicherweise mit abgedeckt sind (BSI-Zuordnungstabelle
   * und kuratierter ISO↔NIS2↔DSGVO-Crosswalk).
   */
  async mapRequirement(ctx: AuthContext, measureId: string, dto: MapRequirementDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const [m] = await tx.select().from(schema.measure).where(and(eq(schema.measure.id, measureId), eq(schema.measure.tenantId, tenantId)));
      if (!m) throw new NotFoundException({ title: 'Maßnahme nicht gefunden' });
      assertCan(ctx, P.MEASURE_WRITE, { ownerPersonId: m.ownerPersonId });

      const [req] = await tx.select({ id: schema.requirement.id }).from(schema.requirement).where(eq(schema.requirement.id, dto.requirementId));
      if (!req) throw new NotFoundException({ title: 'Anforderung nicht gefunden' });

      await tx
        .insert(schema.measureRequirement)
        .values({
          tenantId,
          measureId,
          requirementId: dto.requirementId,
          coverage: dto.coverage,
          createdVia: dto.fromCrosswalk ? 'crosswalk' : 'manual',
          createdByUserId: ctx.userId,
        })
        .onConflictDoUpdate({
          target: [schema.measureRequirement.measureId, schema.measureRequirement.requirementId],
          set: { coverage: dto.coverage },
        });

      return { mapped: dto.requirementId, suggestions: await this.suggestions(tx, tenantId, measureId, dto.requirementId) };
    });
  }

  async unmapRequirement(ctx: AuthContext, measureId: string, requirementId: string) {
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      const [m] = await tx.select().from(schema.measure).where(and(eq(schema.measure.id, measureId), eq(schema.measure.tenantId, tenantId)));
      if (!m) throw new NotFoundException();
      assertCan(ctx, P.MEASURE_WRITE, { ownerPersonId: m.ownerPersonId });
      await tx
        .delete(schema.measureRequirement)
        .where(and(eq(schema.measureRequirement.measureId, measureId), eq(schema.measureRequirement.requirementId, requirementId)));
    });
  }

  /** Vorschläge für eine Anforderung, ohne sie zu mappen (für die Voransicht im Dialog). */
  async suggestionsFor(tenantId: string, measureId: string, requirementId: string): Promise<CrosswalkSuggestion[]> {
    return this.dbs.tenant(tenantId, (tx) => this.suggestions(tx, tenantId, measureId, requirementId));
  }

  private async suggestions(
    tx: Parameters<Parameters<DbService['tenant']>[1]>[0],
    tenantId: string,
    measureId: string,
    requirementId: string,
  ): Promise<CrosswalkSuggestion[]> {
    const res = await tx.execute(sql`
      SELECT DISTINCT ON (t.id)
             t.id AS "requirementId", f.key AS framework, t.ref_code AS "refCode", t.title,
             t.kind::text AS kind, x.relation::text AS relation,
             -- Container (Baustein/Kapitel) zählen nicht direkt in die Abdeckung; die UI kennzeichnet das.
             EXISTS (SELECT 1 FROM requirement c WHERE c.parent_id = t.id) AS "isGroup" 
      FROM v_crosswalk x
      JOIN requirement t ON t.id = x.to_id
      JOIN framework f ON f.id = t.framework_id
      JOIN tenant_framework tf ON tf.framework_id = f.id AND tf.tenant_id = ${tenantId}
      WHERE x.from_id = ${requirementId}
        AND NOT EXISTS (
          SELECT 1 FROM measure_requirement mr
          WHERE mr.measure_id = ${measureId} AND mr.requirement_id = t.id
        )
      -- pro Ziel die stärkste Relation behalten (equivalent > partial > supports)
      ORDER BY t.id, CASE x.relation::text WHEN 'equivalent' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END
      LIMIT 50`);
    return res.rows as unknown as CrosswalkSuggestion[];
  }

  private async nextRefNo(tx: Parameters<Parameters<DbService['tenant']>[1]>[0], tenantId: string): Promise<string> {
    const r = await tx.execute(sql`SELECT next_ref_no(${tenantId}::uuid, 'measure', ${REF_PREFIX.measure}) AS ref`);
    const ref = (r.rows[0] as { ref?: string } | undefined)?.ref;
    if (!ref) throw new BadRequestException({ title: 'Referenznummer konnte nicht vergeben werden' });
    return ref;
  }
}
