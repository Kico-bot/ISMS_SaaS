import { Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { P, type Permission } from '@isms/shared';
import { DbService } from '../../kernel/db/db.service';

export interface AuditLogQuery {
  entityType?: string;
  entityId?: string;
  action?: string;
  actorUserId?: string;
  /** ISO-Datum, einschließlich. */
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogRow {
  id: number;
  at: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  ip: string | null;
  diff: unknown;
}

/**
 * Lesezugriff auf das Änderungsprotokoll.
 *
 * Geschrieben wird es vom `AuditLogInterceptor` bei jedem erfolgreichen Request, der Daten
 * ändert, sowie bei Anmeldungen und Ausleitungen. Die Tabelle ist append-only: der
 * Anwendungsrolle sind UPDATE, DELETE und TRUNCATE per Migration entzogen, sodass auch die
 * ISMS-Leitung ihre eigenen Spuren nicht nachträglich glätten kann.
 *
 * Bewusste Grenze: protokolliert ist der abgesetzte Request, nicht der Zustand vorher und
 * nachher. Wer wissen will, welchen Wert ein Feld vorher hatte, findet das in der Historie
 * des jeweiligen Moduls — Dokumentenversionen, Risikobewertungen, eingefrorene
 * Managementbewertungen. Das Protokoll beantwortet „wer hat wann was angefasst“.
 */
/**
 * Welches Leserecht den Inhalt (`diff`) eines Eintrags zeigt, je Gegenstandsart. Es sind die
 * Leserechte der Routen dieser Art; mehrere heißen „eines davon“. Dass etwas geschah, wer und
 * wann, sieht jede Rolle mit `auditlog.read`. Was es war, nur wer den Vorgang selbst lesen darf:
 * sonst läse die Auditorin über das Protokoll die DSFA, die ihr `privacy.read` verwehrt.
 * Eine Art, die hier fehlt, zeigt keinen Inhalt.
 */
const DIFF_READ: Record<string, readonly Permission[]> = {
  actions: [P.ACTION_READ],
  'ai-systems': [P.AI_READ],
  assets: [P.ASSET_READ],
  audits: [P.AUDIT_READ],
  findings: [P.AUDIT_READ],
  'management-reviews': [P.AUDIT_READ],
  kpis: [P.AUDIT_READ],
  competence: [P.COMPETENCE_READ],
  trainings: [P.TRAINING_READ],
  context: [P.CONTEXT_READ],
  persons: [P.CONTEXT_READ],
  processes: [P.CONTINUITY_READ],
  'continuity-plans': [P.CONTINUITY_READ],
  playbooks: [P.CONTINUITY_READ, P.INCIDENT_READ],
  documents: [P.DOCUMENT_READ],
  evidence: [P.MEASURE_READ],
  files: [P.MEASURE_READ, P.AUDIT_READ],
  frameworks: [P.SOA_READ],
  soa: [P.SOA_READ],
  modeling: [P.SOA_READ],
  'coverage-map': [P.SOA_READ],
  incidents: [P.INCIDENT_READ],
  measures: [P.MEASURE_READ],
  members: [P.TENANT_MEMBERS, P.CONTEXT_READ],
  notifications: [P.TENANT_SETTINGS],
  'processing-activities': [P.PRIVACY_READ],
  risks: [P.RISK_READ],
  exports: [P.REPORT_EXPORT],
};

export function canReadDiff(permissions: ReadonlySet<Permission>, entityType: string): boolean {
  return (DIFF_READ[entityType] ?? []).some((p) => permissions.has(p));
}

@Injectable()
export class AuditLogService {
  constructor(private readonly dbs: DbService) {}

  async list(ctx: { tenantId: string; permissions: ReadonlySet<Permission> }, q: AuditLogQuery) {
    const { tenantId } = ctx;
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 500);
    const offset = Math.max(q.offset ?? 0, 0);
    const where = this.conditions(tenantId, q);

    return this.dbs.tenant(tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT l.id, l.at, l.action::text AS action, l.entity_type AS "entityType",
               l.entity_id AS "entityId", l.actor_user_id AS "actorUserId",
               u.display_name AS "actorName", l.ip, l.diff
        FROM audit_log l
        LEFT JOIN "user" u ON u.id = l.actor_user_id
        WHERE ${where}
        ORDER BY l.at DESC, l.id DESC
        LIMIT ${limit} OFFSET ${offset}`);
      const [count] = (await tx.execute(sql`SELECT count(*)::int AS total FROM audit_log l WHERE ${where}`))
        .rows as { total: number }[];
      const visible = (rows.rows as unknown as AuditLogRow[]).map((r) =>
        canReadDiff(ctx.permissions, r.entityType) ? r : { ...r, diff: null },
      );
      return { total: count?.total ?? 0, limit, offset, rows: visible };
    });
  }

  /** Die Spur eines einzelnen Datensatzes — für den Verlauf neben dem Vorgang selbst. */
  async forEntity(
    ctx: { tenantId: string; permissions: ReadonlySet<Permission> },
    entityType: string,
    entityId: string,
    limit = 50,
  ) {
    return this.list(ctx, { entityType, entityId, limit });
  }

  /**
   * Womit sich filtern lässt: welche Gegenstandsarten kommen im Protokoll dieses Mandanten
   * überhaupt vor, und wer hat gehandelt. Eine feste Liste im Frontend würde altern.
   */
  async facets(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const types = await tx.execute(sql`
        SELECT entity_type AS "entityType", count(*)::int AS count
        FROM audit_log WHERE tenant_id = ${tenantId}
        GROUP BY entity_type ORDER BY entity_type`);
      const actors = await tx.execute(sql`
        SELECT l.actor_user_id AS "actorUserId", u.display_name AS "actorName", count(*)::int AS count
        FROM audit_log l LEFT JOIN "user" u ON u.id = l.actor_user_id
        WHERE l.tenant_id = ${tenantId} AND l.actor_user_id IS NOT NULL
        GROUP BY l.actor_user_id, u.display_name ORDER BY u.display_name`);
      return { entityTypes: types.rows, actors: actors.rows };
    });
  }

  private conditions(tenantId: string, q: AuditLogQuery): SQL {
    const parts: SQL[] = [sql`l.tenant_id = ${tenantId}`];
    if (q.entityType) parts.push(sql`l.entity_type = ${q.entityType}`);
    if (q.entityId) parts.push(sql`l.entity_id = ${q.entityId}`);
    if (q.action) parts.push(sql`l.action::text = ${q.action}`);
    if (q.actorUserId) parts.push(sql`l.actor_user_id = ${q.actorUserId}::uuid`);
    if (q.from) parts.push(sql`l.at >= ${q.from}::date`);
    // Einschließlich des Endtags: ein Filter „bis 30.09.“ soll den 30. mitnehmen.
    if (q.to) parts.push(sql`l.at < (${q.to}::date + 1)`);
    return parts.reduce((acc, p) => sql`${acc} AND ${p}`);
  }
}
