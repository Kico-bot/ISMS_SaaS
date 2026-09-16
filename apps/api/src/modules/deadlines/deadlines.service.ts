import { Injectable } from '@nestjs/common';
import { type AuthContext, P, type Permission } from '@isms/shared';
import { type SQL, sql } from 'drizzle-orm';
import { DbService } from '../../kernel/db/db.service';

/**
 * Wiedervorlage über das ganze ISMS.
 *
 * Ein ISMS scheitert selten an fehlenden Registern, sondern daran, dass niemand merkt, wann
 * etwas fällig wird: die Managementbewertung liegt vor, die Notfallübung ist seit acht Monaten
 * überfällig. Diese Abfrage sammelt jede datierte Verpflichtung an einer Stelle ein.
 *
 * Zwei Regeln bestimmen, was jemand sieht:
 *  - Fachliche Einträge folgen dem Leserecht des Moduls: wer keine Risiken lesen darf, sieht
 *    auch keine Risiko-Wiedervorlagen.
 *  - Eigene Verpflichtungen — Lesebestätigungen, zugewiesene Schulungen — sieht jede oder jeder,
 *    auch ohne Modulrecht. Sie sind an die Person gerichtet, nicht an eine Rolle.
 */
export type DeadlineKind =
  | 'measure'
  | 'action'
  | 'finding'
  | 'document_review'
  | 'acknowledgement'
  | 'evidence'
  | 'skill'
  | 'training'
  | 'risk_review'
  | 'risk_acceptance'
  | 'continuity_exercise'
  | 'reporting_obligation'
  | 'objective'
  | 'audit';

export interface DeadlineRow {
  kind: DeadlineKind;
  id: string;
  refNo: string | null;
  title: string;
  context: string | null;
  dueAt: string;
  ownerPersonId: string | null;
  ownerName: string | null;
  /** Negative Werte = überfällig. */
  daysLeft: number;
  /** Eine verpasste Meldefrist nach NIS2 oder Art. 33 DSGVO ist nicht dasselbe wie ein Nachweis, der altert. */
  severity: 'critical' | 'high' | 'normal';
}

interface Source {
  kind: DeadlineKind;
  /** Recht, um die Einträge aller zu sehen. */
  permission: Permission;
  /**
   * Personengebundene Quelle: die volle Liste sieht nur, wer die Kampagne bzw. die Schulung
   * führt. Alle anderen sehen ihre eigenen Einträge — eine Lesebestätigung richtet sich an die
   * Person, nicht an eine Rolle, und die offenen Bestätigungen der ganzen Belegschaft wären in
   * einer persönlichen Wiedervorlage nur Lärm.
   */
  personal?: boolean;
  select: (tenantId: string, ownPersonId: string | null) => SQL;
}

@Injectable()
export class DeadlinesService {
  constructor(private readonly dbs: DbService) {}

  async list(ctx: AuthContext, opts: { horizonDays?: number; mine?: boolean } = {}) {
    const tenantId = ctx.tenantId!;
    const horizon = Math.min(Math.max(opts.horizonDays ?? 30, 1), 365);
    const personId = ctx.personId;

    const parts: SQL[] = [];
    for (const s of SOURCES) {
      const maySeeAll =
        ctx.permissions.has(s.permission) || ctx.permissions.has(`${s.permission}_own` as Permission);
      if (maySeeAll) parts.push(s.select(tenantId, null));
      else if (s.personal && personId) parts.push(s.select(tenantId, personId));
    }
    if (parts.length === 0) return [];

    return this.dbs.tenant(tenantId, async (tx) => {
      const union = parts.reduce((acc, part) => sql`${acc} UNION ALL ${part}`);

      const res = await tx.execute(sql`
        WITH d AS (${union})
        SELECT kind, id, "refNo", title, context, "dueAt", "ownerPersonId", "ownerName", severity,
               ("dueAt" - current_date) AS "daysLeft"
        FROM d
        WHERE "dueAt" <= current_date + ${horizon}::int
          ${opts.mine && personId ? sql`AND "ownerPersonId" = ${personId}` : sql``}
          ${opts.mine && !personId ? sql`AND false` : sql``}
        ORDER BY "dueAt", severity DESC`);
      return res.rows as unknown as DeadlineRow[];
    });
  }

  /** Verdichtung für die Startseite: wie viel ist überfällig, wie viel läuft diese Woche ab. */
  async summary(ctx: AuthContext) {
    const rows = await this.list(ctx, { horizonDays: 30 });
    return {
      overdue: rows.filter((r) => r.daysLeft < 0).length,
      dueThisWeek: rows.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 7).length,
      dueThisMonth: rows.length,
      critical: rows.filter((r) => r.severity === 'critical').length,
      next: rows.slice(0, 5),
    };
  }
}

/**
 * Die Quellen. Jede liefert dieselben Spalten, damit sie sich zu einem UNION fügen — und jede
 * nennt nur, was wirklich noch offen ist: eine umgesetzte Maßnahme ist keine Wiedervorlage.
 */
const SOURCES: Source[] = [
  {
    kind: 'reporting_obligation',
    permission: P.INCIDENT_READ,
    select: (t) => sql`
      SELECT 'reporting_obligation'::text AS kind, ro.id, i.ref_no AS "refNo",
             -- Die Behörde ist bei allen NIS2-Fristen dieselbe; unterscheidbar macht sie erst das Regime.
             CASE ro.regime::text
               WHEN 'gdpr_art33' THEN 'Meldung an die Aufsichtsbehörde (Art. 33 DSGVO)'
               WHEN 'gdpr_art34' THEN 'Benachrichtigung der Betroffenen (Art. 34 DSGVO)'
               WHEN 'nis2_early_warning_24h' THEN 'NIS2-Frühwarnung (24 Stunden)'
               WHEN 'nis2_notification_72h' THEN 'NIS2-Meldung (72 Stunden)'
               WHEN 'nis2_progress' THEN 'NIS2-Zwischenbericht'
               WHEN 'nis2_final_1m' THEN 'NIS2-Abschlussbericht'
               ELSE ro.authority
             END AS title,
             i.title || ' · ' || ro.authority AS context, ro.due_at::date AS "dueAt",
             NULL::uuid AS "ownerPersonId", NULL::text AS "ownerName", 'critical'::text AS severity
      FROM reporting_obligation ro
      JOIN incident i ON i.id = ro.incident_id
      WHERE ro.tenant_id = ${t} AND ro.fulfilled_at IS NULL AND ro.due_at IS NOT NULL`,
  },
  {
    kind: 'finding',
    permission: P.AUDIT_READ,
    select: (t) => sql`
      SELECT 'finding'::text, f.id, f.ref_no, f.title,
             CASE f.severity::text WHEN 'major' THEN 'Hauptabweichung' WHEN 'minor' THEN 'Nebenabweichung' ELSE 'Beobachtung' END,
             f.due_at::date, NULL::uuid, NULL::text,
             CASE WHEN f.severity::text = 'major' THEN 'high' ELSE 'normal' END
      FROM finding f
      WHERE f.tenant_id = ${t} AND f.due_at IS NOT NULL AND f.status IN ('open', 'in_progress')`,
  },
  {
    kind: 'action',
    permission: P.ACTION_READ,
    select: (t) => sql`
      SELECT 'action'::text, a.id, a.ref_no, a.title, NULL::text, a.due_at::date,
             a.owner_person_id, p.name, 'normal'::text
      FROM "action" a LEFT JOIN person p ON p.id = a.owner_person_id
      WHERE a.tenant_id = ${t} AND a.due_at IS NOT NULL AND a.status IN ('open', 'in_progress')`,
  },
  {
    kind: 'measure',
    permission: P.MEASURE_READ,
    select: (t) => sql`
      SELECT 'measure'::text, m.id, m.ref_no, m.title, NULL::text, m.due_date::date,
             m.owner_person_id, p.name, 'normal'::text
      FROM measure m LEFT JOIN person p ON p.id = m.owner_person_id
      WHERE m.tenant_id = ${t} AND m.due_date IS NOT NULL
        AND m.status NOT IN ('implemented', 'verified', 'not_applicable')`,
  },
  {
    kind: 'risk_review',
    permission: P.RISK_READ,
    select: (t) => sql`
      SELECT 'risk_review'::text, r.id, r.ref_no, r.title, NULL::text, r.next_review_at::date,
             r.owner_person_id, p.name,
             CASE WHEN r.residual_score > 14 THEN 'high' ELSE 'normal' END
      FROM risk r LEFT JOIN person p ON p.id = r.owner_person_id
      WHERE r.tenant_id = ${t} AND r.next_review_at IS NOT NULL AND r.status <> 'closed'`,
  },
  {
    // Eine abgelaufene Akzeptanz heißt: das Risiko ist wieder unbehandelt.
    kind: 'risk_acceptance',
    permission: P.RISK_READ,
    select: (t) => sql`
      SELECT 'risk_acceptance'::text, r.id, r.ref_no, r.title, 'Akzeptanz läuft ab'::text,
             r.accepted_until::date, r.owner_person_id, p.name, 'high'::text
      FROM risk r LEFT JOIN person p ON p.id = r.owner_person_id
      WHERE r.tenant_id = ${t} AND r.accepted_until IS NOT NULL AND r.treatment::text = 'accept'
        AND r.status <> 'closed'`,
  },
  {
    kind: 'document_review',
    permission: P.DOCUMENT_READ,
    select: (t) => sql`
      SELECT 'document_review'::text, d.id, d.key, d.title, 'Turnusmäßige Prüfung'::text,
             d.next_review_at::date, d.owner_person_id, p.name, 'normal'::text
      FROM document d LEFT JOIN person p ON p.id = d.owner_person_id
      WHERE d.tenant_id = ${t} AND d.next_review_at IS NOT NULL AND d.status <> 'retired'`,
  },
  {
    kind: 'evidence',
    permission: P.MEASURE_READ,
    select: (t) => sql`
      SELECT 'evidence'::text, e.id, NULL::text, e.title, 'Nachweis läuft ab'::text,
             e.valid_until::date, NULL::uuid, NULL::text, 'normal'::text
      FROM evidence e
      WHERE e.tenant_id = ${t} AND e.valid_until IS NOT NULL`,
  },
  {
    kind: 'continuity_exercise',
    permission: P.CONTINUITY_READ,
    select: (t) => sql`
      SELECT 'continuity_exercise'::text, c.id, NULL::text, c.title, 'Notfallübung fällig'::text,
             c.next_test_at::date, NULL::uuid, NULL::text,
             CASE WHEN c.status::text = 'active' THEN 'high' ELSE 'normal' END
      FROM continuity_plan c
      WHERE c.tenant_id = ${t} AND c.next_test_at IS NOT NULL AND c.status::text <> 'archived'`,
  },
  {
    kind: 'objective',
    permission: P.CONTEXT_READ,
    select: (t) => sql`
      SELECT 'objective'::text, o.id, NULL::text, o.title, 'Sicherheitsziel'::text, o.due_date::date,
             o.owner_person_id, p.name, 'normal'::text
      FROM security_objective o LEFT JOIN person p ON p.id = o.owner_person_id
      WHERE o.tenant_id = ${t} AND o.due_date IS NOT NULL AND o.status::text NOT IN ('achieved', 'missed')`,
  },
  {
    kind: 'audit',
    permission: P.AUDIT_READ,
    select: (t) => sql`
      SELECT 'audit'::text, a.id, a.ref_no, a.title, 'Geplantes Audit'::text, a.planned_to::date,
             NULL::uuid, NULL::text, 'normal'::text
      FROM "audit" a
      WHERE a.tenant_id = ${t} AND a.planned_to IS NOT NULL AND a.status IN ('planned', 'in_progress')`,
  },
  {
    // Persönliche Pflichten: sichtbar ohne Modulrecht, denn sie richten sich an die Person.
    kind: 'acknowledgement',
    permission: P.DOCUMENT_PUBLISH,
    personal: true,
    select: (t, own) => sql`
      SELECT 'acknowledgement'::text, ack.campaign_id, NULL::text, d.title, 'Lesebestätigung'::text,
             c.due_at::date, ack.person_id, p.name, 'normal'::text
      FROM acknowledgement ack
      JOIN acknowledgement_campaign c ON c.id = ack.campaign_id
      JOIN document_version v ON v.id = c.document_version_id
      JOIN document d ON d.id = v.document_id
      JOIN person p ON p.id = ack.person_id
      WHERE ack.tenant_id = ${t} AND ack.acknowledged_at IS NULL AND c.due_at IS NOT NULL
        ${own ? sql`AND ack.person_id = ${own}` : sql``}`,
  },
  {
    kind: 'training',
    permission: P.TRAINING_WRITE,
    personal: true,
    select: (t, own) => sql`
      SELECT 'training'::text, ta.id, NULL::text, tr.title, 'Schulung'::text, ta.due_at::date,
             ta.person_id, p.name, 'normal'::text
      FROM training_assignment ta
      JOIN training tr ON tr.id = ta.training_id
      JOIN person p ON p.id = ta.person_id
      WHERE ta.tenant_id = ${t} AND ta.completed_at IS NULL AND ta.due_at IS NOT NULL
        ${own ? sql`AND ta.person_id = ${own}` : sql``}`,
  },
  {
    kind: 'skill',
    permission: P.COMPETENCE_READ,
    select: (t) => sql`
      SELECT 'skill'::text, ps.person_id, NULL::text, s.name, 'Kompetenznachweis läuft ab'::text,
             ps.valid_until::date, ps.person_id, p.name, 'normal'::text
      FROM person_skill ps
      JOIN skill s ON s.id = ps.skill_id
      JOIN person p ON p.id = ps.person_id
      WHERE ps.tenant_id = ${t} AND ps.valid_until IS NOT NULL`,
  },
];
