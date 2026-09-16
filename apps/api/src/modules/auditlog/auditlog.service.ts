import { Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
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
@Injectable()
export class AuditLogService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string, q: AuditLogQuery) {
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
      return { total: count?.total ?? 0, limit, offset, rows: rows.rows as unknown as AuditLogRow[] };
    });
  }

  /** Die Spur eines einzelnen Datensatzes — für den Verlauf neben dem Vorgang selbst. */
  async forEntity(tenantId: string, entityType: string, entityId: string, limit = 50) {
    return this.list(tenantId, { entityType, entityId, limit });
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
