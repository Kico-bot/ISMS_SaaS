import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import {
  type AssetDto,
  type AssetPatchDto,
  type AuthContext,
  type ListQuery,
  P,
  REF_PREFIX,
} from '@isms/shared';
import { and, count, eq, ilike, or, sql } from 'drizzle-orm';
import { assertCan, assertSelectableOwner, creationOwner } from '../../kernel/auth/policy';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

@Injectable()
export class AssetsService {
  constructor(private readonly dbs: DbService) {}

  async list(
    tenantId: string,
    q: ListQuery & { category?: string; classification?: string; status?: string },
  ) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const where = and(
        eq(schema.asset.tenantId, tenantId),
        q.status ? eq(schema.asset.status, q.status as never) : undefined,
        q.category ? eq(schema.asset.category, q.category as never) : undefined,
        q.classification ? eq(schema.asset.classification, q.classification as never) : undefined,
        q.q ? or(ilike(schema.asset.name, `%${q.q}%`), ilike(schema.asset.refNo, `%${q.q}%`)) : undefined,
      );
      const [total] = await tx.select({ n: count() }).from(schema.asset).where(where);
      const items = await tx
        .select({
          id: schema.asset.id,
          refNo: schema.asset.refNo,
          name: schema.asset.name,
          type: schema.asset.type,
          category: schema.asset.category,
          classification: schema.asset.classification,
          confidentiality: schema.asset.confidentiality,
          integrity: schema.asset.integrity,
          availability: schema.asset.availability,
          safety: schema.asset.safety,
          hasPii: schema.asset.hasPii,
          status: schema.asset.status,
          tags: schema.asset.tags,
          ownerPersonId: schema.asset.ownerPersonId,
          ownerName: schema.person.name,
          locationId: schema.asset.locationId,
          locationName: schema.location.name,
          riskCount: sql<number>`(SELECT count(*)::int FROM risk_asset ra WHERE ra.asset_id = ${schema.asset.id})`,
        })
        .from(schema.asset)
        .leftJoin(schema.person, eq(schema.person.id, schema.asset.ownerPersonId))
        .leftJoin(schema.location, eq(schema.location.id, schema.asset.locationId))
        .where(where)
        .orderBy(schema.asset.refNo)
        .limit(q.size)
        .offset((q.page - 1) * q.size);
      return { items, total: total?.n ?? 0, page: q.page, size: q.size };
    });
  }

  async get(tenantId: string, id: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const [a] = await tx
        .select()
        .from(schema.asset)
        .where(and(eq(schema.asset.id, id), eq(schema.asset.tenantId, tenantId)));
      if (!a) throw new NotFoundException();
      const risks = await tx.execute(sql`
        SELECT r.id, r.ref_no AS "refNo", r.title, r.status::text AS status,
               r.score
        FROM risk_asset ra JOIN risk r ON r.id = ra.risk_id
        WHERE ra.asset_id = ${id} AND ra.tenant_id = ${tenantId}
        ORDER BY r.ref_no`);
      const relations = await tx.execute(sql`
        SELECT ar.relation::text AS relation, 'outgoing' AS direction, t.id, t.ref_no AS "refNo", t.name
        FROM asset_relation ar JOIN asset t ON t.id = ar.to_asset_id
        WHERE ar.from_asset_id = ${id} AND ar.tenant_id = ${tenantId}
        UNION ALL
        SELECT ar.relation::text, 'incoming', s.id, s.ref_no, s.name
        FROM asset_relation ar JOIN asset s ON s.id = ar.from_asset_id
        WHERE ar.to_asset_id = ${id} AND ar.tenant_id = ${tenantId}`);
      return { ...a, risks: risks.rows, relations: relations.rows };
    });
  }

  async create(ctx: AuthContext, dto: AssetDto) {
    const tenantId = ctx.tenantId!;
    const ownerPersonId = creationOwner(ctx, P.ASSET_WRITE, dto.ownerPersonId);
    return this.dbs.tenant(tenantId, async (tx) => {
      await assertSelectableOwner(tx, tenantId, ownerPersonId);
      const refNo = await this.dbs.nextRefNo(tx, tenantId, 'asset', REF_PREFIX.asset);
      const [a] = await tx
        .insert(schema.asset)
        .values({
          tenantId,
          refNo,
          name: dto.name,
          type: dto.type,
          category: dto.category,
          classification: dto.classification,
          confidentiality: dto.confidentiality,
          integrity: dto.integrity,
          availability: dto.availability,
          safety: dto.safety,
          hasPii: dto.hasPii,
          ownerPersonId,
          custodianPersonId: dto.custodianPersonId ?? null,
          locationId: dto.locationId ?? null,
          description: dto.description ?? null,
          vendor: dto.vendor ?? null,
          product: dto.product ?? null,
          version: dto.version ?? null,
          cpe: dto.cpe ?? null,
          tags: dto.tags,
          status: dto.status,
        })
        .returning();
      return a;
    });
  }

  async update(ctx: AuthContext, id: string, dto: AssetPatchDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      assertCan(ctx, P.ASSET_WRITE, { ownerPersonId: existing.ownerPersonId });
      // Unter `_own` gilt die Prüfung auch für den neuen Eigentümer: weitergeben braucht das volle Recht.
      if (dto.ownerPersonId !== undefined && dto.ownerPersonId !== existing.ownerPersonId) {
        assertCan(ctx, P.ASSET_WRITE, { ownerPersonId: dto.ownerPersonId });
        await assertSelectableOwner(tx, tenantId, dto.ownerPersonId);
      }
      const set = this.toColumns(dto);
      if (Object.keys(set).length === 0) return existing;
      const [a] = await tx.update(schema.asset).set(set).where(eq(schema.asset.id, id)).returning();
      return a;
    });
  }

  async remove(ctx: AuthContext, id: string) {
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      assertCan(ctx, P.ASSET_WRITE, { ownerPersonId: existing.ownerPersonId });
      await this.assertNoForeignDependents(tx, id, ctx.personId ?? null);
      await tx.delete(schema.asset).where(eq(schema.asset.id, id));
    });
  }

  async link(ctx: AuthContext, fromId: string, toId: string, relation: string) {
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      const from = await this.require(tx, tenantId, fromId);
      const to = await this.require(tx, tenantId, toId);
      // Eine Verknüpfung ändert beide Seiten: unter `_own` müssen beide Assets eigene sein.
      assertCan(ctx, P.ASSET_WRITE, { ownerPersonId: from.ownerPersonId });
      assertCan(ctx, P.ASSET_WRITE, { ownerPersonId: to.ownerPersonId });
      await tx
        .insert(schema.assetRelation)
        .values({ tenantId, fromAssetId: fromId, toAssetId: toId, relation: relation as never })
        .onConflictDoNothing();
    });
  }

  /** Löst alle Verknüpfungen von `fromId` nach `toId`; dieselbe Prüfung wie beim Verknüpfen. */
  async unlink(ctx: AuthContext, fromId: string, toId: string) {
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      const from = await this.require(tx, tenantId, fromId);
      const to = await this.require(tx, tenantId, toId);
      assertCan(ctx, P.ASSET_WRITE, { ownerPersonId: from.ownerPersonId });
      assertCan(ctx, P.ASSET_WRITE, { ownerPersonId: to.ownerPersonId });
      const removed = await tx
        .delete(schema.assetRelation)
        .where(
          and(
            eq(schema.assetRelation.tenantId, tenantId),
            eq(schema.assetRelation.fromAssetId, fromId),
            eq(schema.assetRelation.toAssetId, toId),
          ),
        )
        .returning({ from: schema.assetRelation.fromAssetId });
      if (removed.length === 0) throw new NotFoundException({ title: 'Verknüpfung nicht gefunden' });
    });
  }

  /**
   * Risiken, BIA, Verarbeitungen und Vorfälle verlieren das Asset beim Löschen per Kaskade. Hängt
   * daran etwas, das freigegeben ist oder jemand anderem gehört, wird das Asset stillgelegt statt
   * gelöscht. Eigene Entwürfe dürfen mitgehen.
   */
  private async assertNoForeignDependents(tx: TenantTx, id: string, me: string | null) {
    const foreign = (col: string) => sql`NOT coalesce(${sql.raw(col)} = ${me}::uuid, false)`;
    const [row] = (
      await tx.execute(sql`
        SELECT
          (SELECT count(*)::int FROM risk_asset ra JOIN risk r ON r.id = ra.risk_id
            WHERE ra.asset_id = ${id}
              AND (${foreign('r.owner_person_id')} OR r.accepted_at IS NOT NULL)) AS "risks",
          (SELECT count(*)::int FROM bia_resource br JOIN bia b ON b.id = br.bia_id
            JOIN business_process p ON p.id = b.process_id
            WHERE br.asset_id = ${id}
              AND (${foreign('p.owner_person_id')} OR b.status = 'approved')) AS "bias",
          (SELECT count(*)::int FROM processing_asset pa JOIN processing_activity x ON x.id = pa.processing_activity_id
            WHERE pa.asset_id = ${id}
              AND (${foreign('x.owner_person_id')} OR x.status <> 'draft')) AS "processing",
          (SELECT count(*)::int FROM incident_asset ia JOIN incident i ON i.id = ia.incident_id
            WHERE ia.asset_id = ${id}
              AND (${foreign('i.handler_person_id')} OR i.status = 'closed')) AS "incidents"`)
    ).rows as { risks: number; bias: number; processing: number; incidents: number }[];
    const parts = [
      row!.risks ? `${row!.risks} Risiken` : null,
      row!.bias ? `${row!.bias} Business-Impact-Analysen` : null,
      row!.processing ? `${row!.processing} Verarbeitungstätigkeiten` : null,
      row!.incidents ? `${row!.incidents} Vorfälle` : null,
    ].filter(Boolean);
    if (parts.length) {
      throw new ConflictException({
        title: 'Das Asset lässt sich nicht löschen',
        detail: `Daran hängen ${parts.join(', ')}, die freigegeben sind oder anderen gehören. Löschen würde das Asset dort entfernen. Bitte das Asset stattdessen stilllegen (Status „außer Betrieb“).`,
      });
    }
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [a] = await tx
      .select()
      .from(schema.asset)
      .where(and(eq(schema.asset.id, id), eq(schema.asset.tenantId, tenantId)));
    if (!a) throw new NotFoundException({ title: 'Asset nicht gefunden' });
    return a;
  }

  /** DTO-Felder auf Spalten abbilden; nicht übergebene Felder bleiben unangetastet (PATCH-Semantik). */
  private toColumns(dto: AssetPatchDto): Partial<typeof schema.asset.$inferInsert> {
    const set: Partial<typeof schema.asset.$inferInsert> = {};
    const copy = [
      'name',
      'type',
      'category',
      'classification',
      'confidentiality',
      'integrity',
      'availability',
      'safety',
      'hasPii',
      'ownerPersonId',
      'custodianPersonId',
      'locationId',
      'description',
      'vendor',
      'product',
      'version',
      'cpe',
      'tags',
      'status',
    ] as const;
    for (const k of copy) {
      if (dto[k] !== undefined) Object.assign(set, { [k]: dto[k] });
    }
    return set;
  }
}
