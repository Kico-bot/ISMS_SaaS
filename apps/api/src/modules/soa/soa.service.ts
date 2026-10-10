import { Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import type { UpsertTenantRequirementDto } from '@isms/shared';
import { eq, sql } from 'drizzle-orm';
import { DbService } from '../../kernel/db/db.service';

export interface SoaRow {
  requirementId: string;
  refCode: string;
  title: string;
  kind: string;
  level: string | null;
  domain: string | null;
  groupRefCode: string;
  groupTitle: string;
  applicability: string;
  justification: string | null;
  maturity: number | null;
  targetMaturity: number | null;
  measureCount: number;
  implementedCount: number;
  /** IT-Grundschutz-Check: yes | partial | no | dispensable (abgeleitet, siehe Migration 0010). */
  checkStatus: string;
  measures: { id: string; refNo: string; title: string; status: string; coverage: string }[];
}

@Injectable()
export class SoaService {
  constructor(private readonly dbs: DbService) {}

  /**
   * Statement of Applicability: eine Zeile je bewertbarer Anforderung, mit Anwendbarkeit,
   * Selbstbewertung und den Maßnahmen, die sie erfüllen. Die SoA ist eine Abfrage, keine Tabelle.
   * `kind = 'control'` liefert die klassische SoA über Annex A.
   */
  async list(tenantId: string, frameworkKey: string, opts: { kind?: string } = {}): Promise<SoaRow[]> {
    return this.dbs.tenant(tenantId, async (tx) => {
      const frameworkId = await this.frameworkId(tx, frameworkKey);
      const res = await tx.execute(sql`
        SELECT
          r.id                                           AS "requirementId",
          r.ref_code                                     AS "refCode",
          r.title,
          r.kind::text                                   AS kind,
          r.level::text                                  AS level,
          r.domain::text                                 AS domain,
          r.group_ref_code                               AS "groupRefCode",
          r.group_title                                  AS "groupTitle",
          COALESCE(tr.applicability::text, 'applicable') AS applicability,
          tr.justification,
          tr.maturity,
          tr.target_maturity                             AS "targetMaturity",
          tr.notes,
          COALESCE(m.cnt, 0)                             AS "measureCount",
          COALESCE(m.implemented, 0)                     AS "implementedCount",
          COALESCE(m.measures, '[]'::json)               AS measures,
          requirement_check_status(${tenantId}, r.id)    AS "checkStatus"
        FROM v_assessable_requirement r
        LEFT JOIN tenant_requirement tr ON tr.requirement_id = r.id AND tr.tenant_id = ${tenantId}
        LEFT JOIN LATERAL (
          SELECT
            count(*)::int                                                        AS cnt,
            count(*) FILTER (WHERE ms.status IN ('implemented','verified'))::int AS implemented,
            json_agg(json_build_object(
              'id', ms.id, 'refNo', ms.ref_no, 'title', ms.title,
              'status', ms.status, 'coverage', mr.coverage
            ) ORDER BY ms.ref_no)                                                AS measures
          FROM measure_requirement mr
          JOIN measure ms ON ms.id = mr.measure_id
          WHERE mr.requirement_id = r.id AND mr.tenant_id = ${tenantId}
        ) m ON true
        WHERE r.framework_id = ${frameworkId}
          AND requirement_in_scope(${tenantId}, r.id)
          ${opts.kind ? sql`AND r.kind = ${opts.kind}::requirement_kind` : sql``}
        ORDER BY r.sort_order`);
      return res.rows as unknown as SoaRow[];
    });
  }

  /** Anwendbarkeit und Selbstbewertung einer Anforderung setzen (SoA-Zeile). */
  async upsert(tenantId: string, userId: string, requirementId: string, dto: UpsertTenantRequirementDto) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const [req] = await tx
        .select({ id: schema.requirement.id })
        .from(schema.requirement)
        .where(eq(schema.requirement.id, requirementId));
      if (!req) throw new NotFoundException({ title: 'Anforderung nicht gefunden' });

      const [row] = await tx
        .insert(schema.tenantRequirement)
        .values({
          tenantId,
          requirementId,
          applicability: dto.applicability ?? 'applicable',
          justification: dto.justification ?? null,
          maturity: dto.maturity ?? null,
          targetMaturity: dto.targetMaturity ?? null,
          notes: dto.notes ?? null,
          assessedByUserId: userId,
          assessedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.tenantRequirement.tenantId, schema.tenantRequirement.requirementId],
          // Nur übergebene Felder ändern; nicht gesetzte behalten ihren bisherigen Wert.
          set: {
            applicability: dto.applicability ?? sql`${schema.tenantRequirement.applicability}`,
            justification:
              dto.justification !== undefined
                ? dto.justification
                : sql`${schema.tenantRequirement.justification}`,
            maturity: dto.maturity !== undefined ? dto.maturity : sql`${schema.tenantRequirement.maturity}`,
            targetMaturity:
              dto.targetMaturity !== undefined
                ? dto.targetMaturity
                : sql`${schema.tenantRequirement.targetMaturity}`,
            notes: dto.notes !== undefined ? dto.notes : sql`${schema.tenantRequirement.notes}`,
            assessedByUserId: userId,
            assessedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning();
      return row;
    });
  }

  /**
   * Fortschritt je Gruppe (ISO-Kapitel bzw. Annex-Bereich, BSI-Baustein, EU-Artikel) —
   * Datengrundlage für Spider-Charts und Reifegrad-Balken.
   */
  async byChapter(tenantId: string, frameworkKey: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const frameworkId = await this.frameworkId(tx, frameworkKey);
      const res = await tx.execute(sql`
        SELECT
          r.group_ref_code AS "refCode",
          r.group_title    AS title,
          count(*) FILTER (WHERE COALESCE(tr.applicability::text,'applicable') = 'applicable')::int AS applicable,
          count(*) FILTER (WHERE COALESCE(tr.applicability::text,'applicable') = 'applicable' AND cov.ok)::int AS covered,
          round(avg(tr.maturity) FILTER (WHERE tr.maturity IS NOT NULL), 1) AS "avgMaturity",
          round(avg(tr.target_maturity) FILTER (WHERE tr.target_maturity IS NOT NULL), 1) AS "avgTargetMaturity"
        FROM v_assessable_requirement r
        LEFT JOIN tenant_requirement tr ON tr.requirement_id = r.id AND tr.tenant_id = ${tenantId}
        LEFT JOIN LATERAL (
          SELECT EXISTS (
            SELECT 1 FROM measure_requirement mr JOIN measure ms ON ms.id = mr.measure_id
            WHERE mr.tenant_id = ${tenantId} AND mr.requirement_id = r.id AND ms.status IN ('implemented','verified')
          ) AS ok
        ) cov ON true
        WHERE r.framework_id = ${frameworkId}
          AND requirement_in_scope(${tenantId}, r.id)
        GROUP BY r.group_ref_code, r.group_title, r.group_sort_order
        ORDER BY r.group_sort_order`);
      return res.rows;
    });
  }

  private async frameworkId(
    tx: Parameters<Parameters<DbService['tenant']>[1]>[0],
    key: string,
  ): Promise<string> {
    const [fw] = await tx
      .select({ id: schema.framework.id })
      .from(schema.framework)
      .where(eq(schema.framework.key, key));
    if (!fw) throw new NotFoundException({ title: `Framework ${key} nicht gefunden` });
    return fw.id;
  }
}
