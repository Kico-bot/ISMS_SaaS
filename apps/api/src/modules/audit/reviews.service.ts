import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import type { AuthContext, ManagementReviewDto } from '@isms/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/**
 * Management-Review nach ISO 27001 Kap. 9.3.
 *
 * Die Eingaben nach 9.3.2 a)–g) werden aus dem laufenden ISMS berechnet, nicht abgetippt.
 * Beim Abschluss wird der berechnete Stand als Momentaufnahme eingefroren — spätere
 * Datenänderungen dürfen das Protokoll einer vergangenen Sitzung nicht rückwirkend verändern.
 */
@Injectable()
export class ReviewsService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT mr.id, mr.held_at AS "heldAt", mr.status, mr.decisions, p.name AS "chairName",
               (SELECT count(*)::int FROM "action" a WHERE a.review_id = mr.id) AS "actionCount"
        FROM management_review mr
        LEFT JOIN person p ON p.id = mr.chair_person_id
        WHERE mr.tenant_id = ${tenantId}
        ORDER BY mr.held_at DESC`);
      return res.rows;
    });
  }

  async get(tenantId: string, id: string) {
    return this.dbs.tenant(tenantId, (tx) => this.loadDetail(tx, tenantId, id));
  }

  private async loadDetail(tx: TenantTx, tenantId: string, id: string) {
    const r = await this.require(tx, tenantId, id);
    const actions = await tx.execute(sql`
      SELECT a.id, a.ref_no AS "refNo", a.title, a.status::text AS status, a.due_at AS "dueAt", p.name AS "ownerName"
      FROM "action" a LEFT JOIN person p ON p.id = a.owner_person_id
      WHERE a.review_id = ${id} AND a.tenant_id = ${tenantId}
      ORDER BY a.ref_no`);
    // Eine laufende Sitzung zeigt den aktuellen Stand, eine abgeschlossene den eingefrorenen.
    const inputs = r.status === 'closed' ? r.inputs : await this.collectInputs(tx, tenantId, r.heldAt);
    return { ...r, inputs, actions: actions.rows };
  }

  async create(ctx: AuthContext, dto: ManagementReviewDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const [r] = await tx
        .insert(schema.managementReview)
        .values({ tenantId, heldAt: dto.heldAt, chairPersonId: dto.chairPersonId ?? null })
        .returning();
      return this.loadDetail(tx, tenantId, r!.id);
    });
  }

  /**
   * Sitzung abschließen: Beschlüsse festhalten und die Eingaben einfrieren.
   * Danach ist das Protokoll unveränderlich — genau das erwartet ein Auditor.
   */
  async close(ctx: AuthContext, id: string, decisions: string) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const r = await this.require(tx, tenantId, id);
      if (r.status === 'closed') {
        throw new BadRequestException({
          title: 'Sitzung ist bereits abgeschlossen',
          detail: 'Das Protokoll einer abgeschlossenen Managementbewertung bleibt unverändert.',
        });
      }
      const inputs = await this.collectInputs(tx, tenantId, r.heldAt);
      await tx
        .update(schema.managementReview)
        .set({
          status: 'closed',
          decisions,
          inputs: { ...inputs, frozenAt: new Date().toISOString(), frozenByUserId: ctx.userId },
        })
        .where(eq(schema.managementReview.id, id));
      return this.loadDetail(tx, tenantId, id);
    });
  }

  /** Vorschau der Eingaben ohne Sitzung — für die Vorbereitung der Tagesordnung. */
  async preview(tenantId: string) {
    return this.dbs.tenant(tenantId, (tx) =>
      this.collectInputs(tx, tenantId, new Date().toISOString().slice(0, 10)),
    );
  }

  /**
   * Die Eingaben nach ISO 27001 Kap. 9.3.2. Jeder Punkt stammt aus einer Abfrage auf den
   * gepflegten Daten — wer das ISMS betreibt, hat die Tagesordnung damit bereits erledigt.
   */
  private async collectInputs(tx: TenantTx, tenantId: string, heldAt: string) {
    const [previous] = await tx
      .select({ id: schema.managementReview.id, heldAt: schema.managementReview.heldAt })
      .from(schema.managementReview)
      .where(
        and(
          eq(schema.managementReview.tenantId, tenantId),
          eq(schema.managementReview.status, 'closed'),
          sql`held_at < ${heldAt}`,
        ),
      )
      .orderBy(desc(schema.managementReview.heldAt))
      .limit(1);
    const since = previous?.heldAt ?? '1900-01-01';

    // a) Status der Maßnahmen aus vorhergehenden Managementbewertungen
    const priorActions = await tx.execute(sql`
      SELECT a.ref_no AS "refNo", a.title, a.status::text AS status, a.due_at AS "dueAt"
      FROM "action" a
      WHERE a.tenant_id = ${tenantId} AND a.review_id IS NOT NULL
        ${previous ? sql`AND a.review_id = ${previous.id}::uuid` : sql`AND false`}
      ORDER BY a.ref_no`);

    // b/c) Veränderungen bei externen und internen Themen sowie bei interessierten Parteien
    const contextChanges = await tx.execute(sql`
      SELECT 'pestle' AS kind, pf.dimension::text AS category, pf.title, pf.updated_at AS "changedAt"
      FROM pestle_factor pf WHERE pf.tenant_id = ${tenantId} AND pf.updated_at >= ${since}::date
      UNION ALL
      SELECT 'interested_party', ip.category::text, ip.name, ip.updated_at
      FROM interested_party ip WHERE ip.tenant_id = ${tenantId} AND ip.updated_at >= ${since}::date
      ORDER BY "changedAt" DESC`);

    // d.1) Nichtkonformitäten und Korrekturmaßnahmen
    const [nonconformities] = (
      await tx.execute(sql`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE severity = 'major')::int AS major,
               count(*) FILTER (WHERE status IN ('open','in_progress'))::int AS open,
               count(*) FILTER (WHERE status = 'verified')::int AS verified,
               count(*) FILTER (WHERE due_at < current_date AND status IN ('open','in_progress'))::int AS overdue
        FROM finding WHERE tenant_id = ${tenantId} AND created_at >= ${since}::date`)
    ).rows as { total: number; major: number; open: number; verified: number; overdue: number }[];

    // d.2) Überwachungs- und Messergebnisse
    const kpis = await tx.execute(sql`
      SELECT k.name, k.unit, k.target, k.direction::text AS direction,
             v.value, v.measured_at AS "measuredAt",
             CASE
               WHEN k.target IS NULL OR v.value IS NULL THEN NULL
               WHEN k.direction = 'higher_is_better' THEN v.value >= k.target
               ELSE v.value <= k.target
             END AS "targetMet"
      FROM kpi k
      LEFT JOIN LATERAL (
        SELECT value, measured_at FROM kpi_value kv
        WHERE kv.kpi_id = k.id AND kv.measured_at <= ${heldAt}::date
        ORDER BY kv.measured_at DESC LIMIT 1
      ) v ON true
      WHERE k.tenant_id = ${tenantId}
      ORDER BY k.name`);

    // d.3) Auditergebnisse
    const audits = await tx.execute(sql`
      SELECT a.ref_no AS "refNo", a.title, a.kind::text AS kind, a.status::text AS status,
             a.planned_to AS "plannedTo",
             (SELECT count(*)::int FROM finding f WHERE f.audit_id = a.id) AS findings,
             (SELECT count(*)::int FROM finding f WHERE f.audit_id = a.id AND f.severity = 'major') AS "majorFindings"
      FROM "audit" a
      WHERE a.tenant_id = ${tenantId} AND a.status IN ('reported','closed')
        AND COALESCE(a.planned_to, a.planned_from, a.created_at::date) >= ${since}::date
      ORDER BY a.planned_to DESC NULLS LAST`);

    // d.4) Erfüllung der Informationssicherheitsziele
    const objectives = await tx.execute(sql`
      SELECT o.title, o.status::text AS status, o.target_value AS "targetValue", o.current_value AS "currentValue",
             o.unit, o.due_date AS "dueDate"
      FROM security_objective o WHERE o.tenant_id = ${tenantId} AND o.status <> 'draft'
      ORDER BY o.due_date NULLS LAST`);

    // e) Rückmeldungen interessierter Parteien
    const parties = await tx.execute(sql`
      SELECT ip.name, ip.category::text AS category, ip.expectations, ip.is_binding AS "isBinding"
      FROM interested_party ip WHERE ip.tenant_id = ${tenantId} AND ip.is_binding
      ORDER BY ip.influence DESC, ip.name`);

    // f) Ergebnisse der Risikobeurteilung und Stand der Risikobehandlung
    const [risks] = (
      await tx.execute(sql`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE status <> 'closed')::int AS open,
               count(*) FILTER (WHERE residual_score > 14)::int AS "aboveAppetite",
               count(*) FILTER (WHERE treatment = 'accept' AND accepted_at IS NOT NULL)::int AS accepted,
               count(*) FILTER (WHERE next_review_at < current_date AND status <> 'closed')::int AS "reviewOverdue",
               round(avg(residual_score) FILTER (WHERE residual_score IS NOT NULL), 1) AS "avgResidual"
        FROM risk WHERE tenant_id = ${tenantId}`)
    ).rows as Record<string, number>[];

    const [treatment] = (
      await tx.execute(sql`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE status IN ('implemented','verified'))::int AS implemented,
               count(*) FILTER (WHERE due_date < current_date AND status NOT IN ('implemented','verified','not_applicable'))::int AS overdue
        FROM measure WHERE tenant_id = ${tenantId}`)
    ).rows as Record<string, number>[];

    // g) Möglichkeiten zur fortlaufenden Verbesserung
    const improvements = await tx.execute(sql`
      SELECT a.ref_no AS "refNo", a.title, a.status::text AS status, a.due_at AS "dueAt", p.name AS "ownerName"
      FROM "action" a LEFT JOIN person p ON p.id = a.owner_person_id
      WHERE a.tenant_id = ${tenantId} AND a.kind = 'improvement' AND a.status IN ('open','in_progress')
      ORDER BY a.due_at NULLS LAST`);

    // Vorfälle des Zeitraums — in Kap. 9.3.2 d) Teil der Sicherheitsleistung
    const [incidents] = (
      await tx.execute(sql`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE severity IN ('high','critical'))::int AS severe,
               count(*) FILTER (WHERE is_personal_data_breach)::int AS "dataBreaches",
               count(*) FILTER (WHERE nis2_relevant)::int AS "nis2Relevant",
               (SELECT count(*)::int FROM reporting_obligation ro
                 WHERE ro.tenant_id = ${tenantId} AND ro.due_at IS NOT NULL
                   AND (ro.fulfilled_at IS NULL OR ro.fulfilled_at > ro.due_at)) AS "missedDeadlines"
        FROM incident WHERE tenant_id = ${tenantId} AND detected_at >= ${since}::date`)
    ).rows as Record<string, number>[];

    return {
      periodFrom: since,
      periodTo: heldAt,
      previousReviewId: previous?.id ?? null,
      priorActions: priorActions.rows,
      contextChanges: contextChanges.rows,
      nonconformities: nonconformities ?? {},
      kpis: kpis.rows,
      audits: audits.rows,
      objectives: objectives.rows,
      interestedParties: parties.rows,
      risks: risks ?? {},
      riskTreatment: treatment ?? {},
      incidents: incidents ?? {},
      improvements: improvements.rows,
    };
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [r] = await tx
      .select()
      .from(schema.managementReview)
      .where(and(eq(schema.managementReview.id, id), eq(schema.managementReview.tenantId, tenantId)));
    if (!r) throw new NotFoundException({ title: 'Managementbewertung nicht gefunden' });
    return r;
  }
}
