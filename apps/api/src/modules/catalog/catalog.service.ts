import { Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import type { ActivateFrameworkDto } from '@isms/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { DbService } from '../../kernel/db/db.service';

@Injectable()
export class CatalogService {
  constructor(private readonly dbs: DbService) {}

  /** Alle Frameworks mit Aktivierungsstatus des Mandanten und Anzahl bewertbarer Anforderungen. */
  async listFrameworks(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: schema.framework.id,
          key: schema.framework.key,
          version: schema.framework.version,
          name: schema.framework.name,
          publisher: schema.framework.publisher,
          jurisdiction: schema.framework.jurisdiction,
          licenseNote: schema.framework.licenseNote,
          isActive: sql<boolean>`${schema.tenantFramework.tenantId} IS NOT NULL`,
          isPrimary: sql<boolean>`COALESCE(${schema.tenantFramework.isPrimary}, false)`,
          activatedAt: schema.tenantFramework.activatedAt,
          requirementCount: sql<number>`(SELECT count(*)::int FROM requirement r WHERE r.framework_id = ${schema.framework.id} AND r.kind IN ('control','anforderung','article','paragraph'))`,
        })
        .from(schema.framework)
        .leftJoin(
          schema.tenantFramework,
          and(
            eq(schema.tenantFramework.frameworkId, schema.framework.id),
            eq(schema.tenantFramework.tenantId, tenantId),
          ),
        )
        .where(eq(schema.framework.isActive, true))
        .orderBy(asc(schema.framework.key));
      return rows;
    });
  }

  async activate(tenantId: string, dto: ActivateFrameworkDto) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const [fw] = await tx
        .select({ id: schema.framework.id })
        .from(schema.framework)
        .where(and(eq(schema.framework.key, dto.frameworkKey), eq(schema.framework.isActive, true)));
      if (!fw) throw new NotFoundException({ title: `Framework ${dto.frameworkKey} nicht gefunden` });
      if (dto.isPrimary)
        await tx
          .update(schema.tenantFramework)
          .set({ isPrimary: false })
          .where(eq(schema.tenantFramework.tenantId, tenantId));
      await tx
        .insert(schema.tenantFramework)
        .values({ tenantId, frameworkId: fw.id, isPrimary: dto.isPrimary })
        .onConflictDoUpdate({
          target: [schema.tenantFramework.tenantId, schema.tenantFramework.frameworkId],
          set: { isPrimary: dto.isPrimary },
        });
      return { frameworkId: fw.id, isPrimary: dto.isPrimary };
    });
  }

  async deactivate(tenantId: string, frameworkKey: string) {
    await this.dbs.tenant(tenantId, async (tx) => {
      const [fw] = await tx
        .select({ id: schema.framework.id })
        .from(schema.framework)
        .where(eq(schema.framework.key, frameworkKey));
      if (!fw) throw new NotFoundException();
      await tx
        .delete(schema.tenantFramework)
        .where(
          and(eq(schema.tenantFramework.tenantId, tenantId), eq(schema.tenantFramework.frameworkId, fw.id)),
        );
    });
  }

  /** Anforderungsbaum eines Frameworks (global, ohne Mandantendaten). */
  async requirements(frameworkKey: string) {
    const [fw] = await this.dbs.db
      .select({ id: schema.framework.id })
      .from(schema.framework)
      .where(eq(schema.framework.key, frameworkKey));
    if (!fw) throw new NotFoundException();
    return this.dbs.db
      .select({
        id: schema.requirement.id,
        parentId: schema.requirement.parentId,
        refCode: schema.requirement.refCode,
        title: schema.requirement.title,
        kind: schema.requirement.kind,
        level: schema.requirement.level,
        domain: schema.requirement.domain,
        path: schema.requirement.path,
        sortOrder: schema.requirement.sortOrder,
      })
      .from(schema.requirement)
      .where(eq(schema.requirement.frameworkId, fw.id))
      .orderBy(asc(schema.requirement.sortOrder));
  }

  async requirement(id: string) {
    const [r] = await this.dbs.db.select().from(schema.requirement).where(eq(schema.requirement.id, id));
    if (!r) throw new NotFoundException();
    const related = await this.dbs.db.execute(sql`
      SELECT t.id, f.key AS framework, t.ref_code AS "refCode", t.title, x.relation
      FROM v_crosswalk x
      JOIN requirement t ON t.id = x.to_id
      JOIN framework f ON f.id = t.framework_id
      WHERE x.from_id = ${id}
      ORDER BY f.key, t.sort_order`);
    return { ...r, related: related.rows };
  }

  /** Hilfsfunktion für andere Module: Systemrollen-Check etc. */
  async isSystemRole(roleId: string): Promise<boolean> {
    const [r] = await this.dbs.db
      .select({ id: schema.role.id })
      .from(schema.role)
      .where(and(eq(schema.role.id, roleId), isNull(schema.role.tenantId)));
    return !!r;
  }
}
