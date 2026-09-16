import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import { type AuthContext, type EvidenceDto, type EvidencePatchDto, P } from '@isms/shared';
import { and, eq, sql } from 'drizzle-orm';
import { assertCan } from '../../kernel/auth/policy';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/**
 * Nachweisregister. Ein Nachweis ist entweder eine hochgeladene Datei oder ein Verweis auf
 * ein System — beides ohne Inhalt wäre eine leere Behauptung.
 *
 * Nachweise altern: ein Penetrationstest von vorgestern belegt nicht den heutigen Stand.
 * Deshalb trägt jeder Nachweis eine Gültigkeit, und abgelaufene werden ausgewiesen.
 */
@Injectable()
export class EvidenceService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string, onlyExpired = false) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT e.id, e.title, e.description, e.url, e.collected_at AS "collectedAt",
               e.valid_until AS "validUntil", (e.valid_until < current_date) AS expired,
               e.file_id AS "fileId", f.filename, f.mime, f.size_bytes AS "sizeBytes",
               u.display_name AS "collectedByName",
               (SELECT count(*)::int FROM measure_evidence me WHERE me.evidence_id = e.id) AS "measureCount"
        FROM evidence e
        LEFT JOIN file f ON f.id = e.file_id
        LEFT JOIN "user" u ON u.id = e.collected_by_user_id
        WHERE e.tenant_id = ${tenantId}
          ${onlyExpired ? sql`AND e.valid_until < current_date` : sql``}
        ORDER BY (e.valid_until < current_date) DESC NULLS LAST, e.collected_at DESC`);
      return res.rows;
    });
  }

  async create(ctx: AuthContext, dto: EvidenceDto) {
    const tenantId = ctx.tenantId!;
    assertCan(ctx, P.MEASURE_WRITE);
    if (!dto.fileId && !dto.url?.trim()) {
      throw new BadRequestException({
        title: 'Der Nachweis ist leer',
        detail: 'Hinterlegen Sie eine Datei oder einen Verweis — sonst belegt der Eintrag nichts.',
      });
    }
    return this.dbs.tenant(tenantId, async (tx) => {
      if (dto.fileId) await this.requireFile(tx, tenantId, dto.fileId);
      const [e] = await tx
        .insert(schema.evidence)
        .values({
          tenantId,
          title: dto.title,
          description: dto.description ?? null,
          fileId: dto.fileId ?? null,
          url: dto.url ?? null,
          collectedAt: dto.collectedAt ?? new Date().toISOString().slice(0, 10),
          validUntil: dto.validUntil ?? null,
          collectedByUserId: ctx.userId,
        })
        .returning();
      return e;
    });
  }

  async update(ctx: AuthContext, id: string, dto: EvidencePatchDto) {
    const tenantId = ctx.tenantId!;
    assertCan(ctx, P.MEASURE_WRITE);
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      if (dto.fileId) await this.requireFile(tx, tenantId, dto.fileId);
      const set: Record<string, unknown> = {};
      for (const k of ['title', 'description', 'fileId', 'url', 'collectedAt', 'validUntil'] as const) {
        if (dto[k] !== undefined) set[k] = dto[k];
      }
      if (!Object.keys(set).length) return existing;
      const [e] = await tx.update(schema.evidence).set(set).where(eq(schema.evidence.id, id)).returning();
      return e;
    });
  }

  async remove(ctx: AuthContext, id: string) {
    const tenantId = ctx.tenantId!;
    assertCan(ctx, P.MEASURE_WRITE);
    await this.dbs.tenant(tenantId, async (tx) => {
      await this.require(tx, tenantId, id);
      await tx.delete(schema.evidence).where(eq(schema.evidence.id, id));
    });
  }

  /** Nachweise einer Maßnahme — das, was im Audit zu einer Maßnahme vorgelegt wird. */
  async forMeasure(tenantId: string, measureId: string) {
    return this.dbs.tenant(tenantId, (tx) => this.loadForMeasure(tx, tenantId, measureId));
  }

  /**
   * Dieselbe Abfrage innerhalb einer laufenden Transaktion. Eine eigene Transaktion sähe die
   * noch nicht festgeschriebene Verknüpfung nicht und lieferte einen veralteten Stand zurück.
   */
  private async loadForMeasure(tx: TenantTx, tenantId: string, measureId: string) {
    {
      const res = await tx.execute(sql`
        SELECT e.id, e.title, e.description, e.url, e.collected_at AS "collectedAt",
               e.valid_until AS "validUntil", (e.valid_until < current_date) AS expired,
               e.file_id AS "fileId", f.filename, f.mime, f.size_bytes AS "sizeBytes"
        FROM measure_evidence me
        JOIN evidence e ON e.id = me.evidence_id
        LEFT JOIN file f ON f.id = e.file_id
        WHERE me.measure_id = ${measureId} AND e.tenant_id = ${tenantId}
        ORDER BY e.collected_at DESC`);
      return res.rows;
    }
  }

  async linkMeasure(ctx: AuthContext, measureId: string, evidenceId: string) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const measure = await this.requireMeasure(tx, tenantId, measureId);
      assertCan(ctx, P.MEASURE_WRITE, measure);
      await this.require(tx, tenantId, evidenceId);
      await tx.insert(schema.measureEvidence).values({ measureId, evidenceId }).onConflictDoNothing();
      return this.loadForMeasure(tx, tenantId, measureId);
    });
  }

  async unlinkMeasure(ctx: AuthContext, measureId: string, evidenceId: string) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const measure = await this.requireMeasure(tx, tenantId, measureId);
      assertCan(ctx, P.MEASURE_WRITE, measure);
      await tx
        .delete(schema.measureEvidence)
        .where(
          and(
            eq(schema.measureEvidence.measureId, measureId),
            eq(schema.measureEvidence.evidenceId, evidenceId),
          ),
        );
      return this.loadForMeasure(tx, tenantId, measureId);
    });
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [e] = await tx
      .select()
      .from(schema.evidence)
      .where(and(eq(schema.evidence.id, id), eq(schema.evidence.tenantId, tenantId)));
    if (!e) throw new NotFoundException({ title: 'Nachweis nicht gefunden' });
    return e;
  }

  private async requireFile(tx: TenantTx, tenantId: string, id: string) {
    const [f] = await tx
      .select({ id: schema.file.id })
      .from(schema.file)
      .where(and(eq(schema.file.id, id), eq(schema.file.tenantId, tenantId)));
    if (!f) throw new BadRequestException({ title: 'Die Datei gehört nicht zu diesem Mandanten' });
    return f;
  }

  private async requireMeasure(tx: TenantTx, tenantId: string, id: string) {
    const [m] = await tx
      .select()
      .from(schema.measure)
      .where(and(eq(schema.measure.id, id), eq(schema.measure.tenantId, tenantId)));
    if (!m) throw new NotFoundException({ title: 'Maßnahme nicht gefunden' });
    return m;
  }
}
