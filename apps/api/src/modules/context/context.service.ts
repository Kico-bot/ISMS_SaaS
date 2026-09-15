import { Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import type {
  AuthContext,
  InterestedPartyDto,
  InterestedPartyPatchDto,
  PestleFactorDto,
  PestleFactorPatchDto,
  SecurityObjectiveDto,
  SecurityObjectivePatchDto,
} from '@isms/shared';
import { and, eq, sql } from 'drizzle-orm';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/**
 * Kontext der Organisation (ISO 27001 Kap. 4) und Informationssicherheitsziele (Kap. 6.2).
 *
 * Beides speist unmittelbar die Managementbewertung nach Kap. 9.3.2 b), c), d.4) und e) —
 * die Tagesordnung dort ist nur so vollständig wie diese Register.
 */
@Injectable()
export class ContextService {
  constructor(private readonly dbs: DbService) {}

  // --- Interessierte Parteien (Kap. 4.2) ------------------------------------------------
  async listParties(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT id, name, category::text AS category, expectations, addressed_via AS "addressedVia",
               is_binding AS "isBinding", influence, updated_at AS "updatedAt"
        FROM interested_party WHERE tenant_id = ${tenantId}
        ORDER BY is_binding DESC, influence DESC, name`);
      return res.rows;
    });
  }

  async createParty(ctx: AuthContext, dto: InterestedPartyDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const [p] = await tx
        .insert(schema.interestedParty)
        .values({
          tenantId,
          name: dto.name,
          category: dto.category,
          expectations: dto.expectations ?? null,
          addressedVia: dto.addressedVia ?? null,
          isBinding: dto.isBinding,
          influence: dto.influence,
        })
        .returning();
      return p;
    });
  }

  async updateParty(ctx: AuthContext, id: string, dto: InterestedPartyPatchDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.requireParty(tx, tenantId, id);
      const set = pick(dto, ['name', 'category', 'expectations', 'addressedVia', 'isBinding', 'influence']);
      if (!Object.keys(set).length) return existing;
      const [p] = await tx
        .update(schema.interestedParty)
        .set(set)
        .where(eq(schema.interestedParty.id, id))
        .returning();
      return p;
    });
  }

  async deleteParty(ctx: AuthContext, id: string) {
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      await this.requireParty(tx, tenantId, id);
      await tx.delete(schema.interestedParty).where(eq(schema.interestedParty.id, id));
    });
  }

  // --- PESTLE-Analyse (Kap. 4.1) -------------------------------------------------------
  async listFactors(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT f.id, f.dimension::text AS dimension, f.title, f.description, f.effect::text AS effect,
               f.relevance, f.linked_risk_id AS "linkedRiskId", r.ref_no AS "riskRefNo", r.title AS "riskTitle",
               f.updated_at AS "updatedAt"
        FROM pestle_factor f
        LEFT JOIN risk r ON r.id = f.linked_risk_id
        WHERE f.tenant_id = ${tenantId}
        ORDER BY f.dimension, f.relevance DESC, f.title`);
      return res.rows;
    });
  }

  async createFactor(ctx: AuthContext, dto: PestleFactorDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const [f] = await tx
        .insert(schema.pestleFactor)
        .values({
          tenantId,
          dimension: dto.dimension,
          title: dto.title,
          description: dto.description ?? null,
          effect: dto.effect,
          relevance: dto.relevance,
          linkedRiskId: dto.linkedRiskId ?? null,
        })
        .returning();
      return f;
    });
  }

  async updateFactor(ctx: AuthContext, id: string, dto: PestleFactorPatchDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.requireFactor(tx, tenantId, id);
      const set = pick(dto, ['dimension', 'title', 'description', 'effect', 'relevance', 'linkedRiskId']);
      if (!Object.keys(set).length) return existing;
      const [f] = await tx
        .update(schema.pestleFactor)
        .set(set)
        .where(eq(schema.pestleFactor.id, id))
        .returning();
      return f;
    });
  }

  async deleteFactor(ctx: AuthContext, id: string) {
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      await this.requireFactor(tx, tenantId, id);
      await tx.delete(schema.pestleFactor).where(eq(schema.pestleFactor.id, id));
    });
  }

  // --- Informationssicherheitsziele (Kap. 6.2) ------------------------------------------
  async listObjectives(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT o.id, o.title, o.description, o.kind::text AS kind, o.status::text AS status,
               o.target_value AS "targetValue", o.current_value AS "currentValue", o.unit, o.frequency,
               o.direction::text AS direction,
               o.due_date AS "dueDate", p.name AS "ownerName", o.owner_person_id AS "ownerPersonId",
               (o.due_date < current_date AND o.status IN ('draft','active','at_risk')) AS overdue,
               COALESCE(
                 (SELECT json_agg(json_build_object('id', r.id, 'refCode', r.ref_code, 'title', r.title, 'framework', fw.key)
                                  ORDER BY fw.key, r.sort_order)
                  FROM objective_requirement orq
                  JOIN requirement r ON r.id = orq.requirement_id
                  JOIN framework fw ON fw.id = r.framework_id
                  WHERE orq.objective_id = o.id),
                 '[]'::json) AS requirements
        FROM security_objective o
        LEFT JOIN person p ON p.id = o.owner_person_id
        WHERE o.tenant_id = ${tenantId}
        ORDER BY o.status, o.due_date NULLS LAST, o.title`);
      return res.rows;
    });
  }

  async createObjective(ctx: AuthContext, dto: SecurityObjectiveDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const [o] = await tx
        .insert(schema.securityObjective)
        .values({
          tenantId,
          title: dto.title,
          description: dto.description ?? null,
          kind: dto.kind,
          ownerPersonId: dto.ownerPersonId ?? null,
          targetValue: dto.targetValue ?? null,
          currentValue: dto.currentValue ?? null,
          unit: dto.unit ?? null,
          direction: dto.direction,
          frequency: dto.frequency ?? null,
          dueDate: dto.dueDate ?? null,
        })
        .returning();
      if (dto.requirementIds.length) await this.setObjectiveRequirements(tx, o!.id, dto.requirementIds);
      return o;
    });
  }

  async updateObjective(ctx: AuthContext, id: string, dto: SecurityObjectivePatchDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.requireObjective(tx, tenantId, id);
      const set = pick(dto, [
        'title',
        'description',
        'kind',
        'status',
        'ownerPersonId',
        'targetValue',
        'currentValue',
        'unit',
        'direction',
        'frequency',
        'dueDate',
      ]);
      if (Object.keys(set).length)
        await tx.update(schema.securityObjective).set(set).where(eq(schema.securityObjective.id, id));
      if (dto.requirementIds !== undefined) await this.setObjectiveRequirements(tx, id, dto.requirementIds);
      return Object.keys(set).length || dto.requirementIds !== undefined
        ? (await tx.select().from(schema.securityObjective).where(eq(schema.securityObjective.id, id)))[0]
        : existing;
    });
  }

  async deleteObjective(ctx: AuthContext, id: string) {
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      await this.requireObjective(tx, tenantId, id);
      await tx.delete(schema.securityObjective).where(eq(schema.securityObjective.id, id));
    });
  }

  private async setObjectiveRequirements(tx: TenantTx, objectiveId: string, requirementIds: string[]) {
    await tx
      .delete(schema.objectiveRequirement)
      .where(eq(schema.objectiveRequirement.objectiveId, objectiveId));
    if (requirementIds.length) {
      await tx
        .insert(schema.objectiveRequirement)
        .values(requirementIds.map((requirementId) => ({ objectiveId, requirementId })));
    }
  }

  private async requireParty(tx: TenantTx, tenantId: string, id: string) {
    const [row] = await tx
      .select()
      .from(schema.interestedParty)
      .where(and(eq(schema.interestedParty.id, id), eq(schema.interestedParty.tenantId, tenantId)));
    if (!row) throw new NotFoundException({ title: 'Interessierte Partei nicht gefunden' });
    return row;
  }

  private async requireFactor(tx: TenantTx, tenantId: string, id: string) {
    const [row] = await tx
      .select()
      .from(schema.pestleFactor)
      .where(and(eq(schema.pestleFactor.id, id), eq(schema.pestleFactor.tenantId, tenantId)));
    if (!row) throw new NotFoundException({ title: 'Kontextfaktor nicht gefunden' });
    return row;
  }

  private async requireObjective(tx: TenantTx, tenantId: string, id: string) {
    const [row] = await tx
      .select()
      .from(schema.securityObjective)
      .where(and(eq(schema.securityObjective.id, id), eq(schema.securityObjective.tenantId, tenantId)));
    if (!row) throw new NotFoundException({ title: 'Ziel nicht gefunden' });
    return row;
  }
}

/** Nur die gesetzten Felder eines Patch-DTO übernehmen — `undefined` heißt „nicht angefasst“. */
function pick<T extends object, K extends keyof T>(dto: T, keys: readonly K[]): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const k of keys) if (dto[k] !== undefined) set[k as string] = dto[k];
  return set;
}
