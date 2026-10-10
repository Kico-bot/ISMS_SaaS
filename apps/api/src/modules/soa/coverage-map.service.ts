import { Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/**
 * Stand einer Pflicht im Cockpit:
 *   covered        eine umgesetzte Maßnahme ist direkt zugeordnet
 *   in_progress    zugeordnete Maßnahmen gibt es, umgesetzt ist noch keine
 *   indirect       direkt nichts Umgesetztes, aber eine umgesetzte Maßnahme hängt an einer
 *                  verknüpften Anforderung (ISO-Control, Baustein, DSGVO-Artikel) — keine echte
 *                  Lücke, sondern eine fehlende Zuordnung, die sich mit einem Klick übernehmen lässt
 *   open           nichts davon
 *   not_applicable als nicht anwendbar begründet
 */
export type CoverageStatus = 'covered' | 'in_progress' | 'indirect' | 'open' | 'not_applicable';

export interface MeasureRef {
  id: string;
  refNo: string;
  title: string;
  status: string;
}

export interface CoverageLink {
  requirementId: string;
  framework: string;
  refCode: string;
  title: string;
  isGroup: boolean;
  source: string;
  /** Umgesetzte Maßnahmen an der verknüpften Anforderung — beim Baustein an seinen Anforderungen im Umfang. */
  implemented: number;
  /** Beim Baustein: Anforderungen im Umfang; sonst die Zahl zugeordneter Maßnahmen. */
  total: number;
}

const IMPLEMENTED = ['implemented', 'verified'];

/**
 * Abdeckungskarte eines Regelwerks über die anderen: NIS2 → ISO 27001 → IT-Grundschutz, ebenso
 * für den AI Act. Gelesen wird nur, was ohnehin gepflegt ist — Zuordnungen, Crosswalk,
 * Modellierung, Maßnahmenstatus; das Cockpit hat keine eigenen Daten.
 */
@Injectable()
export class CoverageMapService {
  constructor(private readonly dbs: DbService) {}

  async map(tenantId: string, frameworkKey: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const fw = await this.framework(tx, frameworkKey);
      const rows = (
        await tx.execute(sql`
          SELECT r.id, r.ref_code AS "refCode", req.alt_ref AS "altRef", r.title,
                 req.applies_from AS "appliesFrom", r.group_ref_code AS "groupRefCode",
                 COALESCE(tr.applicability::text, 'applicable') AS applicability,
                 COALESCE((
                   SELECT json_agg(json_build_object('id', m.id, 'refNo', m.ref_no, 'title', m.title,
                                                     'status', m.status) ORDER BY m.ref_no)
                   FROM measure_requirement mr JOIN measure m ON m.id = mr.measure_id
                   WHERE mr.requirement_id = r.id AND mr.tenant_id = ${tenantId}), '[]'::json) AS measures
          FROM v_assessable_requirement r
          JOIN requirement req ON req.id = r.id
          LEFT JOIN tenant_requirement tr ON tr.requirement_id = r.id AND tr.tenant_id = ${tenantId}
          WHERE r.framework_id = ${fw.id} AND requirement_in_scope(${tenantId}, r.id)
          ORDER BY r.sort_order`)
      ).rows as {
        id: string;
        refCode: string;
        altRef: string | null;
        title: string;
        appliesFrom: string | null;
        groupRefCode: string;
        applicability: string;
        measures: MeasureRef[];
      }[];
      if (!rows.length) return { framework: fw, rows: [] };

      const ids = rows.map((r) => r.id);
      const links = (
        await tx.execute(sql`
          SELECT DISTINCT ON (x.from_id, t.id)
                 x.from_id AS "fromId", t.id AS "requirementId", f.key AS framework, t.ref_code AS "refCode",
                 t.title, x.source, (t.kind = 'baustein') AS "isGroup",
                 CASE WHEN t.kind = 'baustein' THEN (
                   SELECT count(*)::int FROM requirement a
                   WHERE a.parent_id = t.id AND requirement_in_scope(${tenantId}, a.id)
                     AND EXISTS (SELECT 1 FROM measure_requirement mr JOIN measure m ON m.id = mr.measure_id
                                 WHERE mr.requirement_id = a.id AND mr.tenant_id = ${tenantId}
                                   AND m.status IN ('implemented', 'verified')))
                 ELSE (
                   SELECT count(*)::int FROM measure_requirement mr JOIN measure m ON m.id = mr.measure_id
                   WHERE mr.requirement_id = t.id AND mr.tenant_id = ${tenantId}
                     AND m.status IN ('implemented', 'verified'))
                 END AS implemented,
                 CASE WHEN t.kind = 'baustein' THEN (
                   SELECT count(*)::int FROM requirement a
                   WHERE a.parent_id = t.id AND requirement_in_scope(${tenantId}, a.id))
                 ELSE (
                   SELECT count(*)::int FROM measure_requirement mr
                   WHERE mr.requirement_id = t.id AND mr.tenant_id = ${tenantId})
                 END AS total
          FROM v_crosswalk x
          JOIN requirement t ON t.id = x.to_id
          JOIN framework f ON f.id = t.framework_id
          JOIN tenant_framework tf ON tf.framework_id = f.id AND tf.tenant_id = ${tenantId}
          WHERE x.from_id IN ${sql`(${sql.join(
            ids.map((i) => sql`${i}::uuid`),
            sql`, `,
          )})`}
            AND f.id <> ${fw.id}
            -- nicht modellierte Bausteine und Anforderungen ohne Adressaten sind keine Verbindung
            AND requirement_in_scope(${tenantId}, t.id)
          ORDER BY x.from_id, t.id, f.key`)
      ).rows as unknown as (CoverageLink & { fromId: string })[];

      // Umgesetzte Maßnahmen an den verknüpften Anforderungen (beim Baustein: an seinen Anforderungen)
      const indirect = (
        await tx.execute(sql`
          SELECT DISTINCT ON (x.from_id, m.id)
                 x.from_id AS "fromId", m.id, m.ref_no AS "refNo", m.title, m.status::text AS status,
                 f.key AS "viaFramework", t.ref_code AS "viaRefCode"
          FROM v_crosswalk x
          JOIN requirement t ON t.id = x.to_id
          JOIN framework f ON f.id = t.framework_id
          JOIN tenant_framework tf ON tf.framework_id = f.id AND tf.tenant_id = ${tenantId}
          JOIN requirement target ON target.id = t.id
             OR (t.kind = 'baustein' AND target.parent_id = t.id AND requirement_in_scope(${tenantId}, target.id))
          JOIN measure_requirement mr ON mr.requirement_id = target.id AND mr.tenant_id = ${tenantId}
          JOIN measure m ON m.id = mr.measure_id AND m.status IN ('implemented', 'verified')
          WHERE x.from_id IN ${sql`(${sql.join(
            ids.map((i) => sql`${i}::uuid`),
            sql`, `,
          )})`}
            AND f.id <> ${fw.id}
            AND requirement_in_scope(${tenantId}, t.id)
          ORDER BY x.from_id, m.id, f.key`)
      ).rows as unknown as (MeasureRef & { fromId: string; viaFramework: string; viaRefCode: string })[];

      return {
        framework: fw,
        rows: rows.map((r) => {
          const direct = r.measures;
          const directIds = new Set(direct.map((m) => m.id));
          const viaOthers = indirect.filter((m) => m.fromId === r.id && !directIds.has(m.id));
          let status: CoverageStatus;
          if (r.applicability === 'not_applicable') status = 'not_applicable';
          else if (direct.some((m) => IMPLEMENTED.includes(m.status))) status = 'covered';
          else if (viaOthers.length) status = 'indirect';
          else if (direct.length) status = 'in_progress';
          else status = 'open';
          return {
            ...r,
            status,
            links: links.filter((l) => l.fromId === r.id).map(({ fromId: _f, ...l }) => l),
            indirectMeasures: viaOthers.map(({ fromId: _f, ...m }) => m),
          };
        }),
      };
    });
  }

  /**
   * Flussdiagramm: Pflichten des Regelwerks → verknüpfte Anforderungen anderer Regelwerke →
   * IT-Grundschutz-Bausteine. Bausteine kommen direkt (gepflegte Zuordnung) oder über ISO-Controls
   * (BSI-Zuordnungstabelle) hinzu — Letzteres nur für modellierte Bausteine, sonst wäre das Bild
   * ein Knäuel aus hundert Linien, die niemanden betreffen.
   */
  async flow(tenantId: string, frameworkKey: string) {
    const { framework, rows } = await this.map(tenantId, frameworkKey);
    type Node = { id: string; name: string; layer: number; framework: string; status: string };
    const nodes = new Map<string, Node>();
    const links = new Map<string, { source: string; target: string }>();
    const addLink = (source: string, target: string) => links.set(`${source}|${target}`, { source, target });
    const linkStatus = (l: CoverageLink) =>
      l.implemented === 0 ? 'open' : l.isGroup && l.implemented < l.total ? 'in_progress' : 'covered';

    for (const r of rows) {
      nodes.set(r.id, { id: r.id, name: r.refCode, layer: 0, framework: framework.key, status: r.status });
      for (const l of r.links) {
        const layer = l.framework === 'BSI_GS' ? 2 : 1;
        if (!nodes.has(l.requirementId))
          nodes.set(l.requirementId, {
            id: l.requirementId,
            name: l.refCode,
            layer,
            framework: l.framework,
            status: linkStatus(l),
          });
        addLink(r.id, l.requirementId);
      }
    }

    // ISO-Control → modellierter Baustein (Anforderungen der Zuordnungstabelle auf ihren Baustein verdichtet)
    const isoIds = [...nodes.values()]
      .filter((n) => n.layer === 1 && n.framework === 'ISO27001')
      .map((n) => n.id);
    if (isoIds.length) {
      const bsi = await this.dbs.tenant(
        tenantId,
        async (tx) =>
          (
            await tx.execute(sql`
            SELECT DISTINCT x.from_id AS "isoId", b.id, b.ref_code AS "refCode"
            FROM v_crosswalk x
            JOIN requirement t ON t.id = x.to_id
            JOIN requirement b ON b.id = CASE WHEN t.kind = 'baustein' THEN t.id ELSE t.parent_id END
                               AND b.kind = 'baustein'
            JOIN tenant_module tm ON tm.requirement_id = b.id AND tm.tenant_id = ${tenantId}
            WHERE x.from_id IN ${sql`(${sql.join(
              isoIds.map((i) => sql`${i}::uuid`),
              sql`, `,
            )})`}`)
          ).rows as { isoId: string; id: string; refCode: string }[],
      );
      for (const b of bsi) {
        if (!nodes.has(b.id))
          nodes.set(b.id, { id: b.id, name: b.refCode, layer: 2, framework: 'BSI_GS', status: 'linked' });
        addLink(b.isoId, b.id);
      }
    }
    return { framework, nodes: [...nodes.values()], links: [...links.values()] };
  }

  private async framework(tx: TenantTx, key: string) {
    const [fw] = (await tx.execute(sql`SELECT id, key, name FROM framework WHERE key = ${key} AND is_active`))
      .rows as { id: string; key: string; name: string }[];
    if (!fw) throw new NotFoundException({ title: `Regelwerk ${key} nicht gefunden` });
    return fw;
  }
}
