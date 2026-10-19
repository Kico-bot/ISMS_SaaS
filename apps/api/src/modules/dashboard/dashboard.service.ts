import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../../kernel/db/db.service';

@Injectable()
export class DashboardService {
  constructor(private readonly dbs: DbService) {}

  /**
   * Abdeckungsgrad je aktiviertem Framework: Anteil der anwendbaren Anforderungen, für die
   * mindestens eine umgesetzte oder verifizierte Maßnahme existiert. Eine Query für alle Frameworks.
   */
  async coverage(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      // Der Umfang steht in den FILTER-Klauseln, nicht im WHERE: ein aktiviertes, aber noch nicht
      // modelliertes IT-Grundschutz soll als Kachel mit 0 Anforderungen erscheinen, nicht fehlen.
      const res = await tx.execute(sql`
        SELECT
          f.key, f.name, f.version, tf.is_primary AS "isPrimary",
          EXISTS (SELECT 1 FROM requirement b WHERE b.framework_id = f.id AND b.kind = 'baustein') AS modular,
          count(*) FILTER (WHERE sc.ok AND COALESCE(tr.applicability::text,'applicable') = 'applicable')::int AS applicable,
          count(*) FILTER (WHERE sc.ok AND COALESCE(tr.applicability::text,'applicable') = 'not_applicable')::int AS "notApplicable",
          count(*) FILTER (WHERE sc.ok AND COALESCE(tr.applicability::text,'applicable') = 'applicable' AND cov.ok)::int AS covered,
          COALESCE(round(
            100.0 * count(*) FILTER (WHERE sc.ok AND COALESCE(tr.applicability::text,'applicable') = 'applicable' AND cov.ok)
            / NULLIF(count(*) FILTER (WHERE sc.ok AND COALESCE(tr.applicability::text,'applicable') = 'applicable'), 0)
          ), 0)::int AS pct,
          round(avg(tr.maturity) FILTER (WHERE sc.ok AND tr.maturity IS NOT NULL), 1) AS "avgMaturity"
        FROM tenant_framework tf
        JOIN framework f ON f.id = tf.framework_id
        JOIN v_assessable_requirement r ON r.framework_id = f.id
        CROSS JOIN LATERAL (SELECT requirement_in_scope(${tenantId}, r.id) AS ok) sc
        LEFT JOIN tenant_requirement tr ON tr.requirement_id = r.id AND tr.tenant_id = ${tenantId}
        LEFT JOIN LATERAL (
          SELECT EXISTS (
            SELECT 1 FROM measure_requirement mr
            JOIN measure m ON m.id = mr.measure_id
            WHERE mr.tenant_id = ${tenantId} AND mr.requirement_id = r.id AND m.status IN ('implemented','verified')
          ) AS ok
        ) cov ON true
        WHERE tf.tenant_id = ${tenantId}
        GROUP BY f.id, f.key, f.name, f.version, tf.is_primary
        ORDER BY tf.is_primary DESC, f.key`);
      return res.rows;
    });
  }

  /**
   * Zertifizierungsreife nach ISO 27001, der Hauptnorm der Suite.
   *
   * Gezählt werden die 123 prüfbaren Punkte (Kap. 4 bis 10 und Anhang A). Ein Punkt ist erfüllt,
   * wenn eine umgesetzte Maßnahme ihn voll abdeckt, oder wenn er begründet als nicht anwendbar
   * erklärt ist; deckt eine umgesetzte Maßnahme ihn nur teilweise ab, zählt er halb. Das ist
   * dieselbe Regel wie im Grundschutz-Check (`requirement_check_status`), damit Startseite und
   * Anforderungsliste nie zwei verschiedene Zahlen zeigen.
   *
   * Die Kernnachweise daneben sind das, wonach ein Auditor im Zertifizierungsaudit zuerst fragt.
   * Sie fließen bewusst nicht in die Prozentzahl ein: ein fehlendes internes Audit lässt sich
   * nicht mit vielen umgesetzten Controls aufwiegen, deshalb steht es sichtbar daneben.
   */
  async certificationReadiness(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const counts = (
        await tx.execute(sql`
          SELECT
            count(*)::int AS total,
            count(*) FILTER (WHERE st = 'yes')::int AS fulfilled,
            count(*) FILTER (WHERE st = 'partial')::int AS partial,
            count(*) FILTER (WHERE st = 'dispensable')::int AS "notApplicable",
            count(*) FILTER (WHERE st = 'no')::int AS open
          FROM v_assessable_requirement r
          JOIN framework f ON f.id = r.framework_id AND f.key = 'ISO27001'
          CROSS JOIN LATERAL (SELECT requirement_check_status(${tenantId}, r.id) AS st) s
          WHERE requirement_in_scope(${tenantId}, r.id)`)
      ).rows[0] as { total: number; fulfilled: number; partial: number; notApplicable: number; open: number };

      const ev = (
        await tx.execute(sql`
          SELECT
            EXISTS (SELECT 1 FROM isms_scope WHERE tenant_id = ${tenantId} AND length(trim(statement)) > 0) AS scope,
            EXISTS (SELECT 1 FROM interested_party WHERE tenant_id = ${tenantId}) AS "interestedParties",
            EXISTS (SELECT 1 FROM document WHERE tenant_id = ${tenantId} AND kind = 'policy'
                      AND status = 'published' AND current_version_id IS NOT NULL) AS policy,
            EXISTS (SELECT 1 FROM security_objective WHERE tenant_id = ${tenantId}) AS objectives,
            (EXISTS (SELECT 1 FROM risk WHERE tenant_id = ${tenantId} AND likelihood IS NOT NULL)
             AND NOT EXISTS (
               SELECT 1 FROM risk rk WHERE rk.tenant_id = ${tenantId} AND rk.status <> 'closed'
                 AND rk.score > 14 AND rk.accepted_at IS NULL
                 AND NOT EXISTS (SELECT 1 FROM risk_measure rm WHERE rm.risk_id = rk.id))) AS "riskTreatment",
            NOT EXISTS (
              SELECT 1 FROM v_assessable_requirement r
              JOIN framework f ON f.id = r.framework_id AND f.key = 'ISO27001'
              WHERE r.kind = 'control' AND requirement_in_scope(${tenantId}, r.id)
                AND NOT EXISTS (SELECT 1 FROM tenant_requirement tr WHERE tr.tenant_id = ${tenantId}
                                  AND tr.requirement_id = r.id AND tr.applicability = 'not_applicable')
                AND NOT EXISTS (SELECT 1 FROM measure_requirement mr WHERE mr.tenant_id = ${tenantId}
                                  AND mr.requirement_id = r.id)) AS soa,
            EXISTS (SELECT 1 FROM training_assignment WHERE tenant_id = ${tenantId}
                      AND completed_at >= now() - interval '12 months') AS awareness,
            EXISTS (SELECT 1 FROM audit WHERE tenant_id = ${tenantId} AND status IN ('reported','closed')
                      AND planned_to >= current_date - interval '12 months') AS "internalAudit",
            EXISTS (SELECT 1 FROM management_review WHERE tenant_id = ${tenantId} AND status = 'closed'
                      AND held_at >= current_date - interval '12 months') AS "managementReview",
            NOT EXISTS (SELECT 1 FROM finding WHERE tenant_id = ${tenantId} AND severity = 'major'
                          AND status IN ('open','in_progress')) AS "noOpenMajorFindings"`)
      ).rows[0] as Record<string, boolean>;

      const evidence = READINESS_EVIDENCE.map((e) => ({ ...e, ok: Boolean(ev[e.key]) }));
      const pct = counts.total
        ? Math.round((100 * (counts.fulfilled + counts.notApplicable + counts.partial / 2)) / counts.total)
        : 0;
      return {
        framework: 'ISO27001',
        ...counts,
        pct,
        evidence,
        evidenceMet: evidence.filter((e) => e.ok).length,
      };
    });
  }

  /** Kennzahlen für die Kacheln auf der Startseite. */
  async summary(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT
          (SELECT count(*)::int FROM asset WHERE tenant_id = ${tenantId} AND status = 'active')                 AS assets,
          (SELECT count(*)::int FROM risk WHERE tenant_id = ${tenantId} AND status <> 'closed')                 AS "openRisks",
          (SELECT count(*)::int FROM risk WHERE tenant_id = ${tenantId} AND score > 14)                AS "criticalRisks",
          (SELECT count(*)::int FROM measure WHERE tenant_id = ${tenantId})                                     AS measures,
          (SELECT count(*)::int FROM measure WHERE tenant_id = ${tenantId} AND status IN ('implemented','verified')) AS "measuresImplemented",
          (SELECT count(*)::int FROM measure WHERE tenant_id = ${tenantId} AND due_date < current_date AND status NOT IN ('implemented','verified','not_applicable')) AS "measuresOverdue",
          (SELECT count(*)::int FROM document WHERE tenant_id = ${tenantId} AND next_review_at < current_date)  AS "documentsOverdue",
          (SELECT count(*)::int FROM acknowledgement WHERE tenant_id = ${tenantId} AND acknowledged_at IS NULL)  AS "openAcknowledgements",
          (SELECT count(*)::int FROM incident WHERE tenant_id = ${tenantId} AND status NOT IN ('resolved','closed')) AS "openIncidents",
          (SELECT count(*)::int FROM reporting_obligation WHERE tenant_id = ${tenantId} AND fulfilled_at IS NULL AND due_at IS NOT NULL) AS "openReportingObligations",
          (SELECT count(*)::int FROM finding WHERE tenant_id = ${tenantId} AND status IN ('open','in_progress') AND severity = 'major') AS "openMajorFindings",
          (SELECT count(*)::int FROM action WHERE tenant_id = ${tenantId} AND status IN ('open','in_progress')) AS "openActions"`);
      return res.rows[0];
    });
  }

  /**
   * Traceability: Asset → Risiko → Maßnahme → Anforderung → Framework.
   * Beantwortet „welche Normanforderungen hängen an diesem Asset?“ und umgekehrt.
   */
  async assetTraceability(tenantId: string, assetId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT a.ref_no AS "assetRefNo", a.name AS "assetName",
               rk.id AS "riskId", rk.ref_no AS "riskRefNo", rk.title AS "riskTitle",
               rk.score,
               m.id AS "measureId", m.ref_no AS "measureRefNo", m.title AS "measureTitle", m.status::text AS "measureStatus",
               f.key AS framework, r.ref_code AS "refCode", r.title AS "requirementTitle"
        FROM asset a
        LEFT JOIN risk_asset ra ON ra.asset_id = a.id AND ra.tenant_id = ${tenantId}
        LEFT JOIN risk rk ON rk.id = ra.risk_id
        LEFT JOIN risk_measure rm ON rm.risk_id = rk.id AND rm.tenant_id = ${tenantId}
        LEFT JOIN measure m ON m.id = rm.measure_id
        LEFT JOIN measure_requirement mr ON mr.measure_id = m.id AND mr.tenant_id = ${tenantId}
        LEFT JOIN requirement r ON r.id = mr.requirement_id
        LEFT JOIN framework f ON f.id = r.framework_id
        WHERE a.tenant_id = ${tenantId} AND a.id = ${assetId}
        ORDER BY rk.ref_no, m.ref_no, f.key, r.sort_order`);
      return res.rows;
    });
  }
}

/** Was ein Auditor im Zertifizierungsaudit zuerst sehen will, mit dem Normbezug. */
const READINESS_EVIDENCE = [
  { key: 'scope', label: 'Geltungsbereich festgelegt', norm: 'iso:4.3' },
  { key: 'interestedParties', label: 'Interessierte Parteien erfasst', norm: 'iso:4.2' },
  { key: 'policy', label: 'Leitlinie zur Informationssicherheit freigegeben', norm: 'iso:5.2' },
  { key: 'objectives', label: 'Sicherheitsziele festgelegt', norm: 'iso:6.2' },
  { key: 'riskTreatment', label: 'Risiken bewertet, hohe Risiken behandelt', norm: 'iso:6.1.2' },
  { key: 'soa', label: 'Für jedes Control aus Anhang A entschieden', norm: 'iso:6.1.3' },
  { key: 'awareness', label: 'Schulung in den letzten 12 Monaten', norm: 'iso:7.3' },
  { key: 'internalAudit', label: 'Internes Audit in den letzten 12 Monaten', norm: 'iso:9.2' },
  { key: 'managementReview', label: 'Managementbewertung in den letzten 12 Monaten', norm: 'iso:9.3' },
  { key: 'noOpenMajorFindings', label: 'Keine offene Hauptabweichung', norm: 'iso:10.2' },
] as const;
