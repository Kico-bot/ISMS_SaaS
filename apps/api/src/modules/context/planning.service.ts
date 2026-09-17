import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import {
  type AuthContext,
  type ChangePlanEntryDto,
  type ChangePlanEntryPatchDto,
  type CommunicationPlanEntryDto,
  type CommunicationPlanEntryPatchDto,
  type OrgUnitDto,
  type OrgUnitPatchDto,
  P,
} from '@isms/shared';
import { and, eq, sql } from 'drizzle-orm';
import { assertCan } from '../../kernel/auth/policy';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/**
 * Drei Register, die die ISO 27001 verlangt und die sonst in Word-Dateien versanden:
 *
 *  - **Kommunikationsplan (Kap. 7.4)** — worüber, mit wem, wann und wie kommuniziert wird.
 *    Vier Fragen, die die Norm wörtlich stellt und die ein Auditor in fünf Minuten prüft.
 *  - **Änderungsplanung (Kap. 6.3)** — Änderungen am ISMS erfolgen geplant. Wer den
 *    Geltungsbereich erweitert oder die Risikomatrix umstellt, bewertet vorher die Auswirkung
 *    und lässt die Änderung freigeben.
 *  - **Organigramm (Kap. 5.3)** — Rollen, Verantwortlichkeiten und Befugnisse. Der eigentliche
 *    Nutzen sind die unbesetzten Stellen: eine Vakanz neben den Assets, die sie verantwortet,
 *    ist eine Aussage, die kein Textdokument so klar trifft.
 */
@Injectable()
export class PlanningService {
  constructor(private readonly dbs: DbService) {}

  // --- Kommunikationsplan (Kap. 7.4) ---------------------------------------------------------
  async listCommunication(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT c.id, c.topic, c.audience, c.channel, c.frequency,
               c.responsible_person_id AS "responsiblePersonId", p.name AS "responsibleName",
               c.clause_ref AS "clauseRef", c.updated_at AS "updatedAt"
        FROM communication_plan_entry c
        LEFT JOIN person p ON p.id = c.responsible_person_id
        WHERE c.tenant_id = ${tenantId}
        ORDER BY c.topic`);
      return res.rows;
    });
  }

  async createCommunication(ctx: AuthContext, dto: CommunicationPlanEntryDto) {
    assertCan(ctx, P.CONTEXT_WRITE);
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(schema.communicationPlanEntry)
        .values({
          tenantId,
          topic: dto.topic,
          audience: dto.audience,
          channel: dto.channel,
          frequency: dto.frequency,
          responsiblePersonId: dto.responsiblePersonId ?? null,
          clauseRef: dto.clauseRef ?? null,
        })
        .returning();
      return row;
    });
  }

  async updateCommunication(ctx: AuthContext, id: string, dto: CommunicationPlanEntryPatchDto) {
    assertCan(ctx, P.CONTEXT_WRITE);
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.requireCommunication(tx, tenantId, id);
      const set: Record<string, unknown> = { updatedAt: new Date() };
      for (const k of [
        'topic',
        'audience',
        'channel',
        'frequency',
        'responsiblePersonId',
        'clauseRef',
      ] as const) {
        if (dto[k] !== undefined) set[k] = dto[k];
      }
      const [row] = await tx
        .update(schema.communicationPlanEntry)
        .set(set)
        .where(eq(schema.communicationPlanEntry.id, id))
        .returning();
      return row;
    });
  }

  async removeCommunication(ctx: AuthContext, id: string) {
    assertCan(ctx, P.CONTEXT_WRITE);
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      await this.requireCommunication(tx, tenantId, id);
      await tx.delete(schema.communicationPlanEntry).where(eq(schema.communicationPlanEntry.id, id));
    });
  }

  // --- Änderungsplanung (Kap. 6.3) -----------------------------------------------------------
  async listChanges(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT c.id, c.title, c.purpose, c.impact_assessment AS "impactAssessment",
               c.status::text AS status, c.planned_for AS "plannedFor",
               c.created_by_user_id AS "createdByUserId", cu.display_name AS "createdByName",
               c.approved_by_user_id AS "approvedByUserId", au.display_name AS "approvedByName",
               c.approved_at AS "approvedAt", c.created_at AS "createdAt"
        FROM change_plan_entry c
        LEFT JOIN "user" cu ON cu.id = c.created_by_user_id
        LEFT JOIN "user" au ON au.id = c.approved_by_user_id
        WHERE c.tenant_id = ${tenantId}
        ORDER BY c.planned_for NULLS LAST, c.created_at DESC`);
      return res.rows;
    });
  }

  async createChange(ctx: AuthContext, dto: ChangePlanEntryDto) {
    assertCan(ctx, P.CONTEXT_WRITE);
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(schema.changePlanEntry)
        .values({
          tenantId,
          title: dto.title,
          purpose: dto.purpose ?? null,
          impactAssessment: dto.impactAssessment ?? null,
          plannedFor: dto.plannedFor ?? null,
          createdByUserId: ctx.userId,
        })
        .returning();
      return row;
    });
  }

  async updateChange(ctx: AuthContext, id: string, dto: ChangePlanEntryPatchDto) {
    assertCan(ctx, P.CONTEXT_WRITE);
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.requireChange(tx, tenantId, id);
      if (existing.status === 'done' && dto.status && dto.status !== 'done') {
        throw new BadRequestException({
          title: 'Die Änderung ist bereits umgesetzt',
          detail: 'Eine umgesetzte Änderung wird nicht zurückgedreht; planen Sie stattdessen eine neue.',
        });
      }
      const set: Record<string, unknown> = { updatedAt: new Date() };
      for (const k of ['title', 'purpose', 'impactAssessment', 'plannedFor', 'status'] as const) {
        if (dto[k] !== undefined) set[k] = dto[k];
      }
      // Eine inhaltliche Änderung nach der Freigabe entwertet sie — dieselbe Regel wie bei BIA
      // und Folgenabschätzung.
      const contentChanged = (['title', 'purpose', 'impactAssessment', 'plannedFor'] as const).some(
        (k) => dto[k] !== undefined,
      );
      if (contentChanged && existing.approvedAt) {
        set.approvedByUserId = null;
        set.approvedAt = null;
        set.status = dto.status ?? 'planned';
      }
      const [row] = await tx
        .update(schema.changePlanEntry)
        .set(set)
        .where(eq(schema.changePlanEntry.id, id))
        .returning();
      return row;
    });
  }

  /**
   * Freigabe im Vier-Augen-Prinzip: wer die Änderung geplant hat, gibt sie nicht selbst frei.
   * Ohne bewertete Auswirkung gibt es nichts freizugeben — das ist der Kern von Kap. 6.3.
   */
  async approveChange(ctx: AuthContext, id: string) {
    assertCan(ctx, P.CONTEXT_WRITE);
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.requireChange(tx, tenantId, id);
      if (existing.approvedAt) {
        throw new BadRequestException({ title: 'Die Änderung ist bereits freigegeben' });
      }
      if (!existing.impactAssessment?.trim()) {
        throw new BadRequestException({
          title: 'Die Auswirkung ist nicht bewertet',
          detail:
            'Kap. 6.3 verlangt geplante Änderungen. Beschreiben Sie, was die Änderung im ISMS bewirkt, bevor Sie sie freigeben.',
        });
      }
      if (existing.createdByUserId === ctx.userId) {
        throw new BadRequestException({
          title: 'Freigabe im Vier-Augen-Prinzip',
          detail: 'Wer die Änderung geplant hat, kann sie nicht selbst freigeben.',
        });
      }
      const [row] = await tx
        .update(schema.changePlanEntry)
        .set({
          status: 'approved',
          approvedByUserId: ctx.userId,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.changePlanEntry.id, id))
        .returning();
      return row;
    });
  }

  async removeChange(ctx: AuthContext, id: string) {
    assertCan(ctx, P.CONTEXT_WRITE);
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      await this.requireChange(tx, tenantId, id);
      await tx.delete(schema.changePlanEntry).where(eq(schema.changePlanEntry.id, id));
    });
  }

  // --- Organigramm (Kap. 5.3) ----------------------------------------------------------------
  /** Flache Liste mit Elternbezug; den Baum baut die Oberfläche daraus. */
  async listOrgUnits(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT o.id, o.parent_id AS "parentId", o.kind::text AS kind, o.label,
               o.person_id AS "personId", p.name AS "personName", p.department AS "personDepartment",
               o.location_id AS "locationId", o.sort_order AS "sortOrder",
               (SELECT count(*)::int FROM asset a WHERE a.owner_person_id = o.person_id) AS "assetCount",
               (SELECT count(*)::int FROM risk r WHERE r.owner_person_id = o.person_id) AS "riskCount"
        FROM org_unit o
        LEFT JOIN person p ON p.id = o.person_id
        WHERE o.tenant_id = ${tenantId}
        ORDER BY o.sort_order, o.label`);
      return res.rows;
    });
  }

  async createOrgUnit(ctx: AuthContext, dto: OrgUnitDto) {
    assertCan(ctx, P.CONTEXT_WRITE);
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      if (dto.parentId) await this.requireOrgUnit(tx, tenantId, dto.parentId);
      const [row] = await tx
        .insert(schema.orgUnit)
        .values({
          tenantId,
          parentId: dto.parentId ?? null,
          kind: dto.kind,
          label: dto.label,
          // Eine unbesetzte Stelle trägt keine Person — genau das macht sie aus.
          personId: dto.kind === 'vacancy' ? null : (dto.personId ?? null),
          locationId: dto.locationId ?? null,
          sortOrder: dto.sortOrder,
        })
        .returning();
      return row;
    });
  }

  async updateOrgUnit(ctx: AuthContext, id: string, dto: OrgUnitPatchDto) {
    assertCan(ctx, P.CONTEXT_WRITE);
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.requireOrgUnit(tx, tenantId, id);
      if (dto.parentId !== undefined && dto.parentId !== null) {
        if (dto.parentId === id) {
          throw new BadRequestException({ title: 'Ein Knoten kann nicht sein eigener Elternknoten sein' });
        }
        await this.requireOrgUnit(tx, tenantId, dto.parentId);
        await this.assertNotDescendant(tx, id, dto.parentId);
      }
      const set: Record<string, unknown> = { updatedAt: new Date() };
      for (const k of ['label', 'kind', 'parentId', 'personId', 'locationId', 'sortOrder'] as const) {
        if (dto[k] !== undefined) set[k] = dto[k];
      }
      if (dto.kind === 'vacancy') set.personId = null;
      const [row] = await tx.update(schema.orgUnit).set(set).where(eq(schema.orgUnit.id, id)).returning();
      return row;
    });
  }

  /** Löscht den Knoten samt Unterbau — der Fremdschlüssel kaskadiert. */
  async removeOrgUnit(ctx: AuthContext, id: string) {
    assertCan(ctx, P.CONTEXT_WRITE);
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      await this.requireOrgUnit(tx, tenantId, id);
      await tx.delete(schema.orgUnit).where(eq(schema.orgUnit.id, id));
    });
  }

  /**
   * Ein Knoten darf nicht unter einen seiner eigenen Nachfahren wandern — das erzeugte einen
   * Kreis, den die Oberfläche nie wieder darstellen könnte.
   */
  private async assertNotDescendant(tx: TenantTx, id: string, newParentId: string): Promise<void> {
    const res = await tx.execute(sql`
      WITH RECURSIVE nachfahren AS (
        SELECT id FROM org_unit WHERE parent_id = ${id}
        UNION ALL
        SELECT o.id FROM org_unit o JOIN nachfahren n ON o.parent_id = n.id
      )
      SELECT 1 FROM nachfahren WHERE id = ${newParentId}`);
    if (res.rows.length > 0) {
      throw new BadRequestException({
        title: 'Verschieben nicht möglich',
        detail: 'Der gewählte Elternknoten liegt unterhalb des Knotens, den Sie verschieben.',
      });
    }
  }

  private async requireCommunication(tx: TenantTx, tenantId: string, id: string) {
    const [row] = await tx
      .select()
      .from(schema.communicationPlanEntry)
      .where(
        and(eq(schema.communicationPlanEntry.id, id), eq(schema.communicationPlanEntry.tenantId, tenantId)),
      );
    if (!row) throw new NotFoundException({ title: 'Eintrag im Kommunikationsplan nicht gefunden' });
    return row;
  }

  private async requireChange(tx: TenantTx, tenantId: string, id: string) {
    const [row] = await tx
      .select()
      .from(schema.changePlanEntry)
      .where(and(eq(schema.changePlanEntry.id, id), eq(schema.changePlanEntry.tenantId, tenantId)));
    if (!row) throw new NotFoundException({ title: 'Geplante Änderung nicht gefunden' });
    return row;
  }

  private async requireOrgUnit(tx: TenantTx, tenantId: string, id: string) {
    const [row] = await tx
      .select()
      .from(schema.orgUnit)
      .where(and(eq(schema.orgUnit.id, id), eq(schema.orgUnit.tenantId, tenantId)));
    if (!row) throw new NotFoundException({ title: 'Knoten im Organigramm nicht gefunden' });
    return row;
  }
}
