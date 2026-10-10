import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import { BSI_BASELINE_MODULES, type ModuleDto, type ProtectionVariantDto } from '@isms/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../../kernel/db/db.service';

type Tx = Parameters<Parameters<DbService['tenant']>[1]>[0];

/**
 * Modellierung nach BSI-Standard 200-2: welche Bausteine gelten, in welcher Absicherungsvariante.
 * Daraus folgt, welche Anforderungen der IT-Grundschutz-Check überhaupt zeigt — die eigentliche
 * Filterregel steht in der SQL-Funktion `requirement_in_scope` (Migration 0010), damit Check,
 * Abdeckung, Exporte und Auditprogramm nicht vier eigene Varianten davon pflegen.
 */
@Injectable()
export class ModelingService {
  constructor(private readonly dbs: DbService) {}

  async get(tenantId: string, frameworkKey: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const fw = await this.activeFramework(tx, tenantId, frameworkKey);
      const res = await tx.execute(sql`
        SELECT
          b.id,
          b.ref_code                                       AS "refCode",
          b.title,
          layer.ref_code                                   AS "layerRefCode",
          layer.title                                      AS "layerTitle",
          (tm.requirement_id IS NOT NULL)                  AS modeled,
          COALESCE(tm.elevated, false)                     AS elevated,
          tm.note,
          count(a.id) FILTER (WHERE a.level = 'basis')::int    AS "basisCount",
          count(a.id) FILTER (WHERE a.level = 'standard')::int AS "standardCount",
          count(a.id) FILTER (WHERE a.level = 'erhoeht')::int  AS "elevatedCount"
        FROM requirement b
        LEFT JOIN requirement layer ON layer.id = b.parent_id
        LEFT JOIN requirement a ON a.parent_id = b.id
        LEFT JOIN tenant_module tm ON tm.requirement_id = b.id AND tm.tenant_id = ${tenantId}
        WHERE b.framework_id = ${fw.id} AND b.kind = 'baustein'
        GROUP BY b.id, b.ref_code, b.title, b.sort_order, layer.ref_code, layer.title, layer.sort_order,
                 tm.requirement_id, tm.elevated, tm.note
        ORDER BY layer.sort_order, b.sort_order`);
      const [scope] = (
        await tx.execute(sql`
          SELECT count(*)::int AS "inScope"
          FROM v_assessable_requirement r
          WHERE r.framework_id = ${fw.id} AND requirement_in_scope(${tenantId}, r.id)`)
      ).rows as { inScope: number }[];
      return {
        protectionVariant: fw.protectionVariant ?? 'standard',
        inScopeCount: scope?.inScope ?? 0,
        baselineRefCodes: BSI_BASELINE_MODULES,
        modules: res.rows,
      };
    });
  }

  async setVariant(tenantId: string, dto: ProtectionVariantDto) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const fw = await this.activeFramework(tx, tenantId, dto.framework);
      await tx
        .update(schema.tenantFramework)
        .set({ protectionVariant: dto.protectionVariant })
        .where(
          and(eq(schema.tenantFramework.tenantId, tenantId), eq(schema.tenantFramework.frameworkId, fw.id)),
        );
      return { protectionVariant: dto.protectionVariant };
    });
  }

  async model(tenantId: string, requirementId: string, dto: ModuleDto) {
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.assertModule(tx, tenantId, requirementId);
      const [row] = await tx
        .insert(schema.tenantModule)
        .values({ tenantId, requirementId, elevated: dto.elevated, note: dto.note ?? null })
        .onConflictDoUpdate({
          target: [schema.tenantModule.tenantId, schema.tenantModule.requirementId],
          set: {
            elevated: dto.elevated,
            note: dto.note !== undefined ? dto.note : sql`${schema.tenantModule.note}`,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row;
    });
  }

  /**
   * Abwählen löscht nur die Modellierung. Maßnahmenzuordnungen und Bewertungen der Anforderungen
   * bleiben stehen — wer den Baustein wieder wählt, findet sie unverändert vor.
   */
  async unmodel(tenantId: string, requirementId: string) {
    await this.dbs.tenant(tenantId, (tx) =>
      tx
        .delete(schema.tenantModule)
        .where(
          and(
            eq(schema.tenantModule.tenantId, tenantId),
            eq(schema.tenantModule.requirementId, requirementId),
          ),
        ),
    );
  }

  /** Übernimmt die Prozess-Bausteine des Vorschlags; bereits modellierte bleiben unverändert. */
  async adoptBaseline(tenantId: string, frameworkKey: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const fw = await this.activeFramework(tx, tenantId, frameworkKey);
      const modules = await tx
        .select({ id: schema.requirement.id })
        .from(schema.requirement)
        .where(
          and(
            eq(schema.requirement.frameworkId, fw.id),
            eq(schema.requirement.kind, 'baustein'),
            inArray(schema.requirement.refCode, [...BSI_BASELINE_MODULES]),
          ),
        );
      if (!modules.length) throw new BadRequestException({ title: 'Dieser Katalog kennt keine Bausteine' });
      const added = await tx
        .insert(schema.tenantModule)
        .values(modules.map((m) => ({ tenantId, requirementId: m.id })))
        .onConflictDoNothing()
        .returning({ id: schema.tenantModule.requirementId });
      return { added: added.length };
    });
  }

  private async activeFramework(tx: Tx, tenantId: string, key: string) {
    const [fw] = await tx
      .select({ id: schema.framework.id, protectionVariant: schema.tenantFramework.protectionVariant })
      .from(schema.framework)
      .innerJoin(
        schema.tenantFramework,
        and(
          eq(schema.tenantFramework.frameworkId, schema.framework.id),
          eq(schema.tenantFramework.tenantId, tenantId),
        ),
      )
      .where(eq(schema.framework.key, key));
    if (!fw) throw new NotFoundException({ title: `Regelwerk ${key} ist nicht aktiviert` });
    return fw;
  }

  private async assertModule(tx: Tx, tenantId: string, requirementId: string) {
    const [r] = await tx
      .select({ kind: schema.requirement.kind, frameworkId: schema.requirement.frameworkId })
      .from(schema.requirement)
      .where(eq(schema.requirement.id, requirementId));
    if (!r) throw new NotFoundException({ title: 'Baustein nicht gefunden' });
    if (r.kind !== 'baustein')
      throw new BadRequestException({ title: 'Nur Bausteine lassen sich modellieren' });
    const [active] = await tx
      .select({ id: schema.tenantFramework.frameworkId })
      .from(schema.tenantFramework)
      .where(
        and(
          eq(schema.tenantFramework.tenantId, tenantId),
          eq(schema.tenantFramework.frameworkId, r.frameworkId),
        ),
      );
    if (!active)
      throw new BadRequestException({ title: 'Das Regelwerk dieses Bausteins ist nicht aktiviert' });
  }
}
