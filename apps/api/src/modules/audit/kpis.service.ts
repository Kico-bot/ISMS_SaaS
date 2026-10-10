import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import { type AuthContext, type KpiComputationKey, type KpiDto, type KpiValueDto } from '@isms/shared';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/**
 * Kennzahlen nach ISO 27001 Kap. 9.1. Berechnete Kennzahlen lesen ihren Wert aus dem ISMS
 * selbst — eine Kennzahl, die jemand von Hand abtippt, ist im nächsten Quartal veraltet.
 */
@Injectable()
export class KpisService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT k.id, k.name, k.unit, k.target, k.direction::text AS direction, k.source::text AS source,
               k.computation_key AS "computationKey", k.frequency, p.name AS "ownerName",
               v.value, v.measured_at AS "measuredAt",
               prev.value AS "previousValue",
               CASE
                 WHEN k.target IS NULL OR v.value IS NULL THEN NULL
                 WHEN k.direction = 'higher_is_better' THEN v.value >= k.target
                 ELSE v.value <= k.target
               END AS "targetMet"
        FROM kpi k
        LEFT JOIN person p ON p.id = k.owner_person_id
        LEFT JOIN LATERAL (
          SELECT value, measured_at FROM kpi_value kv WHERE kv.kpi_id = k.id ORDER BY kv.measured_at DESC LIMIT 1
        ) v ON true
        LEFT JOIN LATERAL (
          SELECT value FROM kpi_value kv WHERE kv.kpi_id = k.id ORDER BY kv.measured_at DESC OFFSET 1 LIMIT 1
        ) prev ON true
        WHERE k.tenant_id = ${tenantId}
        ORDER BY k.name`);
      return res.rows;
    });
  }

  async history(tenantId: string, kpiId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT measured_at AS "measuredAt", value, note
        FROM kpi_value WHERE kpi_id = ${kpiId} AND tenant_id = ${tenantId}
        ORDER BY measured_at`);
      return res.rows;
    });
  }

  async create(ctx: AuthContext, dto: KpiDto) {
    const tenantId = ctx.tenantId!;
    if (dto.source === 'computed' && !dto.computationKey) {
      throw new BadRequestException({
        title: 'Berechnungsschlüssel fehlt',
        detail: 'Eine berechnete Kennzahl braucht die Angabe, woraus sie sich berechnet.',
      });
    }
    return this.dbs.tenant(tenantId, async (tx) => {
      const [k] = await tx
        .insert(schema.kpi)
        .values({
          tenantId,
          name: dto.name,
          unit: dto.unit ?? null,
          target: dto.target != null ? String(dto.target) : null,
          direction: dto.direction,
          source: dto.source,
          computationKey: dto.source === 'computed' ? (dto.computationKey ?? null) : null,
          frequency: dto.frequency ?? null,
          ownerPersonId: dto.ownerPersonId ?? null,
        })
        .returning();
      return k;
    });
  }

  /** Wert von Hand erfassen — nur für Kennzahlen, die das ISMS nicht selbst kennt. */
  async record(ctx: AuthContext, kpiId: string, dto: KpiValueDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const k = await this.require(tx, tenantId, kpiId);
      if (k.source === 'computed') {
        throw new BadRequestException({
          title: 'Kennzahl wird berechnet',
          detail:
            'Diese Kennzahl liest ihren Wert aus dem ISMS. Ein manueller Wert würde den Nachweis entwerten.',
        });
      }
      return this.upsertValue(tx, tenantId, kpiId, dto.measuredAt, dto.value, dto.note ?? null);
    });
  }

  /**
   * Alle berechneten Kennzahlen auf den Stichtag fortschreiben. Wird vor einer
   * Managementbewertung aufgerufen und eignet sich als geplanter Job.
   */
  async refresh(tenantId: string, measuredAt = new Date().toISOString().slice(0, 10)) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const computed = await tx
        .select()
        .from(schema.kpi)
        .where(and(eq(schema.kpi.tenantId, tenantId), eq(schema.kpi.source, 'computed')));
      const updated: { name: string; value: number }[] = [];
      for (const k of computed) {
        const key = k.computationKey as KpiComputationKey | null;
        if (!key || !(key in COMPUTATIONS)) continue;
        const res = await tx.execute(COMPUTATIONS[key](tenantId));
        const value = Number((res.rows[0] as { value: number | string | null } | undefined)?.value ?? 0);
        await this.upsertValue(tx, tenantId, k.id, measuredAt, value, 'automatisch berechnet');
        updated.push({ name: k.name, value });
      }
      return { measuredAt, updated };
    });
  }

  private async upsertValue(
    tx: TenantTx,
    tenantId: string,
    kpiId: string,
    measuredAt: string,
    value: number,
    note: string | null,
  ) {
    const [v] = await tx
      .insert(schema.kpiValue)
      .values({ kpiId, tenantId, measuredAt, value: String(value), note })
      .onConflictDoUpdate({
        target: [schema.kpiValue.kpiId, schema.kpiValue.measuredAt],
        set: { value: String(value), note },
      })
      .returning();
    return v;
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [k] = await tx
      .select()
      .from(schema.kpi)
      .where(and(eq(schema.kpi.id, id), eq(schema.kpi.tenantId, tenantId)));
    if (!k) throw new NotFoundException({ title: 'Kennzahl nicht gefunden' });
    return k;
  }
}

/**
 * Jede berechnete Kennzahl ist genau eine Abfrage. Sie liefert eine Spalte `value`.
 * Prozentwerte sind auf eine Nachkommastelle gerundet, Zählwerte sind ganzzahlig.
 */
const COMPUTATIONS: Record<KpiComputationKey, (tenantId: string) => SQL> = {
  soa_coverage_pct: (t) => sql`
    SELECT COALESCE(round(100.0 * count(*) FILTER (WHERE cov.ok) / NULLIF(count(*), 0), 1), 0) AS value
    FROM tenant_framework tf
    JOIN v_assessable_requirement r ON r.framework_id = tf.framework_id
    LEFT JOIN tenant_requirement tr ON tr.requirement_id = r.id AND tr.tenant_id = ${t}
    LEFT JOIN LATERAL (
      SELECT EXISTS (
        SELECT 1 FROM measure_requirement mr JOIN measure m ON m.id = mr.measure_id
        WHERE mr.tenant_id = ${t} AND mr.requirement_id = r.id AND m.status IN ('implemented','verified')
      ) AS ok
    ) cov ON true
    WHERE tf.tenant_id = ${t} AND tf.is_primary
      AND requirement_in_scope(${t}, r.id)
      AND COALESCE(tr.applicability::text, 'applicable') = 'applicable'`,

  measure_implementation_pct: (t) => sql`
    SELECT COALESCE(round(100.0 * count(*) FILTER (WHERE status IN ('implemented','verified'))
                          / NULLIF(count(*) FILTER (WHERE status <> 'not_applicable'), 0), 1), 0) AS value
    FROM measure WHERE tenant_id = ${t}`,

  avg_maturity: (t) => sql`
    SELECT COALESCE(round(avg(maturity)::numeric, 1), 0) AS value
    FROM tenant_requirement WHERE tenant_id = ${t} AND maturity IS NOT NULL`,

  open_major_findings: (t) => sql`
    SELECT count(*)::int AS value FROM finding
    WHERE tenant_id = ${t} AND severity = 'major' AND status IN ('open','in_progress')`,

  overdue_actions: (t) => sql`
    SELECT count(*)::int AS value FROM "action"
    WHERE tenant_id = ${t} AND due_at < current_date AND status NOT IN ('done','verified','rejected')`,

  incidents_last_quarter: (t) => sql`
    SELECT count(*)::int AS value FROM incident
    WHERE tenant_id = ${t} AND detected_at >= now() - interval '3 months'`,

  reporting_deadline_hit_rate_pct: (t) => sql`
    SELECT COALESCE(round(100.0 * count(*) FILTER (WHERE fulfilled_at IS NOT NULL AND fulfilled_at <= due_at)
                          / NULLIF(count(*), 0), 1), 100) AS value
    FROM reporting_obligation WHERE tenant_id = ${t} AND due_at IS NOT NULL`,

  acknowledgement_rate_pct: (t) => sql`
    SELECT COALESCE(round(100.0 * count(*) FILTER (WHERE acknowledged_at IS NOT NULL) / NULLIF(count(*), 0), 1), 100) AS value
    FROM acknowledgement WHERE tenant_id = ${t}`,

  document_review_overdue: (t) => sql`
    SELECT count(*)::int AS value FROM document
    WHERE tenant_id = ${t} AND next_review_at < current_date`,

  risks_above_appetite: (t) => sql`
    SELECT count(*)::int AS value FROM risk r
    LEFT JOIN risk_matrix_config c ON c.tenant_id = r.tenant_id
    WHERE r.tenant_id = ${t} AND r.status <> 'closed'
      -- ohne festgelegten Appetit gilt die Grenze zu „kritisch“
      AND r.score > COALESCE(c.appetite, (c.thresholds->>'high')::int, 14)`,
};
