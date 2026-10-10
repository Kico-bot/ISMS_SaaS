import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import {
  type AcceptRiskDto,
  type AssessRiskDto,
  type AuthContext,
  DEFAULT_RISK_THRESHOLDS,
  type LinkRiskMeasureDto,
  type ListQuery,
  P,
  type QuantifyRiskDto,
  REF_PREFIX,
  RISK_MATRIX_SIZE,
  type RiskDto,
  type RiskCriteriaDto,
  type RiskPatchDto,
  type RiskThresholds,
  riskLevel,
} from '@isms/shared';
import { and, count, eq, ilike, or, sql } from 'drizzle-orm';
import { assertCan } from '../../kernel/auth/policy';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

@Injectable()
export class RisksService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string, q: ListQuery & { status?: string; kind?: string; ownerPersonId?: string }) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const thresholds = await this.thresholds(tx, tenantId);
      const where = and(
        eq(schema.risk.tenantId, tenantId),
        q.status ? eq(schema.risk.status, q.status as never) : undefined,
        q.kind ? eq(schema.risk.kind, q.kind as never) : undefined,
        q.ownerPersonId ? eq(schema.risk.ownerPersonId, q.ownerPersonId) : undefined,
        q.q ? or(ilike(schema.risk.title, `%${q.q}%`), ilike(schema.risk.refNo, `%${q.q}%`)) : undefined,
      );
      const [total] = await tx.select({ n: count() }).from(schema.risk).where(where);
      const rows = await tx
        .select({
          id: schema.risk.id,
          refNo: schema.risk.refNo,
          title: schema.risk.title,
          kind: schema.risk.kind,
          status: schema.risk.status,
          treatment: schema.risk.treatment,
          likelihood: schema.risk.likelihood,
          impact: schema.risk.impact,
          score: schema.risk.score,
          acceptedAt: schema.risk.acceptedAt,
          acceptedUntil: schema.risk.acceptedUntil,
          nextReviewAt: schema.risk.nextReviewAt,
          ownerPersonId: schema.risk.ownerPersonId,
          ownerName: schema.person.name,
          measureCount: sql<number>`(SELECT count(*)::int FROM risk_measure rm WHERE rm.risk_id = ${schema.risk.id})`,
        })
        .from(schema.risk)
        .leftJoin(schema.person, eq(schema.person.id, schema.risk.ownerPersonId))
        .where(where)
        .orderBy(sql`${schema.risk.score} DESC NULLS LAST`, schema.risk.refNo)
        .limit(q.size)
        .offset((q.page - 1) * q.size);

      const items = rows.map((r) => ({
        ...r,
        level: riskLevel(r.score, thresholds),
      }));
      return { items, total: total?.n ?? 0, page: q.page, size: q.size };
    });
  }

  async get(tenantId: string, id: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const r = await this.require(tx, tenantId, id);
      const thresholds = await this.thresholds(tx, tenantId);
      const assets = await tx.execute(sql`
        SELECT a.id, a.ref_no AS "refNo", a.name, a.category::text AS category
        FROM risk_asset ra JOIN asset a ON a.id = ra.asset_id
        WHERE ra.risk_id = ${id} AND ra.tenant_id = ${tenantId} ORDER BY a.ref_no`);
      const measures = await tx.execute(sql`
        SELECT m.id, m.ref_no AS "refNo", m.title, m.status::text AS status, rm.effect::text AS effect
        FROM risk_measure rm JOIN measure m ON m.id = rm.measure_id
        WHERE rm.risk_id = ${id} AND rm.tenant_id = ${tenantId} ORDER BY m.ref_no`);
      const history = await tx
        .select()
        .from(schema.riskAssessment)
        .where(eq(schema.riskAssessment.riskId, id))
        .orderBy(sql`${schema.riskAssessment.assessedAt} DESC`);
      return {
        ...r,
        level: riskLevel(r.score, thresholds),
        assets: assets.rows,
        measures: measures.rows,
        history,
      };
    });
  }

  async create(ctx: AuthContext, dto: RiskDto) {
    const tenantId = ctx.tenantId!;
    assertCan(ctx, P.RISK_WRITE, { ownerPersonId: dto.ownerPersonId ?? ctx.personId });
    return this.dbs.tenant(tenantId, async (tx) => {
      const refNo = await this.dbs.nextRefNo(tx, tenantId, 'risk', REF_PREFIX.risk);
      const [r] = await tx
        .insert(schema.risk)
        .values({
          tenantId,
          refNo,
          title: dto.title,
          description: dto.description ?? null,
          kind: dto.kind,
          source: dto.source,
          category: dto.category ?? null,
          ownerPersonId: dto.ownerPersonId ?? null,
          status: dto.status,
          treatment: dto.treatment ?? null,
          nextReviewAt: dto.nextReviewAt ?? null,
        })
        .returning();
      if (dto.assetIds.length) {
        await tx
          .insert(schema.riskAsset)
          .values(dto.assetIds.map((assetId) => ({ tenantId, riskId: r!.id, assetId })));
      }
      return r;
    });
  }

  async update(ctx: AuthContext, id: string, dto: RiskPatchDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      assertCan(ctx, P.RISK_WRITE, { ownerPersonId: existing.ownerPersonId });
      const set: Record<string, unknown> = {};
      for (const k of [
        'title',
        'description',
        'kind',
        'source',
        'category',
        'ownerPersonId',
        'status',
        'treatment',
        'nextReviewAt',
      ] as const) {
        if (dto[k] !== undefined) set[k] = dto[k];
      }
      const [r] = Object.keys(set).length
        ? await tx.update(schema.risk).set(set).where(eq(schema.risk.id, id)).returning()
        : [existing];
      if (dto.assetIds) {
        await tx.delete(schema.riskAsset).where(eq(schema.riskAsset.riskId, id));
        if (dto.assetIds.length) {
          await tx
            .insert(schema.riskAsset)
            .values(dto.assetIds.map((assetId) => ({ tenantId, riskId: id, assetId })));
        }
      }
      return r;
    });
  }

  /**
   * Bewertung auf der 5×5-Matrix. Schreibt den aktuellen Stand auf das Risiko (für Register und
   * Heatmap) und zusätzlich eine unveränderliche Zeile in die Historie (für Audits und Trends).
   */
  async assess(ctx: AuthContext, id: string, dto: AssessRiskDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      assertCan(ctx, P.RISK_WRITE, { ownerPersonId: existing.ownerPersonId });

      await tx.insert(schema.riskAssessment).values({
        tenantId,
        riskId: id,
        likelihood: dto.likelihood,
        impact: dto.impact,
        assessedByUserId: ctx.userId,
        note: dto.note ?? null,
      });

      // Eine neue Bewertung hebt eine frühere Übernahme auf: sie bezog sich auf andere Zahlen.
      const changed = existing.likelihood !== dto.likelihood || existing.impact !== dto.impact;
      const clearAcceptance =
        changed && existing.acceptedAt
          ? {
              acceptedByUserId: null,
              acceptedAt: null,
              acceptedUntil: null,
              acceptanceSnapshot: null,
              status: 'assessed' as const,
            }
          : {};
      const [r] = await tx
        .update(schema.risk)
        .set({
          likelihood: dto.likelihood,
          impact: dto.impact,
          status: existing.status === 'identified' ? 'assessed' : existing.status,
          ...clearAcceptance,
        })
        .where(eq(schema.risk.id, id))
        .returning();
      const thresholds = await this.thresholds(tx, tenantId);
      return {
        ...r!,
        level: riskLevel(r!.score, thresholds),
      };
    });
  }

  /**
   * Risikoübernahme: das Risiko wird in seiner heutigen Höhe bewusst getragen. Friert die Bewertungsgrundlage ein, damit eine spätere Änderung der
   * Matrix-Schwellen die erteilte Freigabe nicht stillschweigend umdeutet.
   * Vier-Augen-Prinzip: nicht durch den Risk-Owner selbst (zusätzlich per DB-Trigger abgesichert).
   */
  async accept(ctx: AuthContext, id: string, dto: AcceptRiskDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const r = await this.require(tx, tenantId, id);
      if (r.score == null) {
        throw new ConflictException({
          title: 'Das Risiko ist noch nicht bewertet',
          detail: 'Ohne Bewertung ist unklar, was übernommen würde.',
        });
      }
      const thresholds = await this.thresholds(tx, tenantId);
      const [updated] = await tx
        .update(schema.risk)
        .set({
          acceptedByUserId: ctx.userId,
          acceptedAt: new Date(),
          acceptedUntil: dto.validUntil,
          acceptanceRationale: dto.rationale,
          acceptanceSnapshot: {
            likelihood: r.likelihood,
            impact: r.impact,
            score: r.score,
            level: riskLevel(r.score, thresholds),
            thresholds,
            matrixSize: RISK_MATRIX_SIZE,
            acceptedAt: new Date().toISOString(),
          },
          status: 'accepted',
          treatment: r.treatment ?? 'accept',
        })
        .where(eq(schema.risk.id, id))
        .returning();
      return updated;
    });
  }

  async quantify(ctx: AuthContext, id: string, dto: QuantifyRiskDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      assertCan(ctx, P.RISK_WRITE, { ownerPersonId: existing.ownerPersonId });
      const [r] = await tx
        .update(schema.risk)
        .set({
          aleFrequency: dto.aleFrequency != null ? String(dto.aleFrequency) : null,
          lossMin: dto.lossMin != null ? String(dto.lossMin) : null,
          lossLikely: dto.lossLikely != null ? String(dto.lossLikely) : null,
          lossMax: dto.lossMax != null ? String(dto.lossMax) : null,
        })
        .where(eq(schema.risk.id, id))
        .returning();
      // Jahresschadenserwartung (FAIR-light): Häufigkeit × wahrscheinlicher Einzelschaden
      const ale =
        dto.aleFrequency != null && dto.lossLikely != null ? dto.aleFrequency * dto.lossLikely : null;
      return { ...r!, ale };
    });
  }

  async linkMeasure(ctx: AuthContext, id: string, dto: LinkRiskMeasureDto) {
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      assertCan(ctx, P.RISK_WRITE, { ownerPersonId: existing.ownerPersonId });
      const [m] = await tx
        .select({ id: schema.measure.id })
        .from(schema.measure)
        .where(and(eq(schema.measure.id, dto.measureId), eq(schema.measure.tenantId, tenantId)));
      if (!m) throw new NotFoundException({ title: 'Maßnahme nicht gefunden' });
      await tx
        .insert(schema.riskMeasure)
        .values({ tenantId, riskId: id, measureId: dto.measureId, effect: dto.effect })
        .onConflictDoUpdate({
          target: [schema.riskMeasure.riskId, schema.riskMeasure.measureId],
          set: { effect: dto.effect },
        });
      if (existing.treatment == null)
        await tx
          .update(schema.risk)
          .set({ treatment: 'mitigate', status: 'treated' })
          .where(eq(schema.risk.id, id));
    });
  }

  async unlinkMeasure(ctx: AuthContext, id: string, measureId: string) {
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      assertCan(ctx, P.RISK_WRITE, { ownerPersonId: existing.ownerPersonId });
      await tx
        .delete(schema.riskMeasure)
        .where(and(eq(schema.riskMeasure.riskId, id), eq(schema.riskMeasure.measureId, measureId)));
    });
  }

  /** Belegung der 5×5-Matrix für die Heatmap. */
  async matrix(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const thresholds = await this.thresholds(tx, tenantId);
      const [config] = await tx
        .select()
        .from(schema.riskMatrixConfig)
        .where(eq(schema.riskMatrixConfig.tenantId, tenantId));
      const res = await tx.execute(sql`
        SELECT likelihood, impact, count(*)::int AS n,
               json_agg(json_build_object('id', id, 'refNo', ref_no, 'title', title) ORDER BY ref_no) AS risks
        FROM risk WHERE tenant_id = ${tenantId} AND likelihood IS NOT NULL AND status <> 'closed'
        GROUP BY likelihood, impact`);
      const levels = await tx.execute(sql`
        SELECT score, count(*)::int AS n
        FROM risk WHERE tenant_id = ${tenantId} AND status <> 'closed' AND score IS NOT NULL
        GROUP BY 1`);
      const byLevel = { low: 0, medium: 0, high: 0, critical: 0 };
      for (const row of levels.rows as { score: number; n: number }[]) {
        const lvl = riskLevel(row.score, thresholds);
        if (lvl) byLevel[lvl] += row.n;
      }
      return {
        size: RISK_MATRIX_SIZE,
        thresholds,
        likelihoodLabels: config?.likelihoodLabels ?? null,
        impactLabels: config?.impactLabels ?? null,
        appetite: config?.appetite ?? null,
        criteriaUpdatedAt: config?.updatedAt ?? null,
        cells: res.rows,
        byLevel,
      };
    });
  }

  /**
   * Kriterien der Risikobeurteilung festlegen (Kap. 6.1.2 a). Bestehende Bewertungen bleiben, wie
   * sie sind: Punktzahl ist Wahrscheinlichkeit mal Auswirkung, nur die Einstufung liest die neuen
   * Grenzen, und das ist gewollt, denn sie soll die heutige Haltung der Leitung zeigen.
   */
  async saveCriteria(tenantId: string, dto: RiskCriteriaDto) {
    await this.dbs.tenant(tenantId, async (tx) => {
      const values = {
        likelihoodLabels: dto.likelihoodLabels,
        impactLabels: dto.impactLabels,
        thresholds: dto.thresholds,
        appetite: dto.appetite,
        updatedAt: new Date(),
      };
      await tx
        .insert(schema.riskMatrixConfig)
        .values({ tenantId, ...values })
        .onConflictDoUpdate({ target: schema.riskMatrixConfig.tenantId, set: values });
    });
    return this.matrix(tenantId);
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [r] = await tx
      .select()
      .from(schema.risk)
      .where(and(eq(schema.risk.id, id), eq(schema.risk.tenantId, tenantId)));
    if (!r) throw new NotFoundException({ title: 'Risiko nicht gefunden' });
    return r;
  }

  private async thresholds(tx: TenantTx, tenantId: string): Promise<RiskThresholds> {
    const [c] = await tx
      .select({ t: schema.riskMatrixConfig.thresholds })
      .from(schema.riskMatrixConfig)
      .where(eq(schema.riskMatrixConfig.tenantId, tenantId));
    return (c?.t as RiskThresholds | undefined) ?? DEFAULT_RISK_THRESHOLDS;
  }
}
