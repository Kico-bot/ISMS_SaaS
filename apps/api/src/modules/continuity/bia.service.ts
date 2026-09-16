import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import {
  BIA_DIMENSIONS,
  BIA_HORIZONS,
  type AuthContext,
  type BiaDto,
  type BiaImpactDto,
  type BiaResourceDto,
  P,
} from '@isms/shared';
import { and, eq, sql } from 'drizzle-orm';
import { assertCan } from '../../kernel/auth/policy';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/** Zeithorizonte der BIA in Stunden — für den Abgleich mit der zugesagten Wiederanlaufzeit. */
const HORIZON_HOURS: Record<string, number> = { '2h': 2, '8h': 8, '24h': 24, '72h': 72, '1w': 168 };
/** Deutsche Namen der Dimensionen — die Hinweise sollen ohne Übersetzung lesbar sein. */
const DIMENSION_LABEL: Record<string, string> = {
  financial: 'Finanziell',
  reputation: 'Reputation',
  legal: 'Rechtlich / vertraglich',
  operational: 'Betrieblich',
};

/** Ab dieser Auswirkung gilt ein Ausfall als nicht mehr tragbar. */
const CRITICAL_SCORE = 3;

@Injectable()
export class BiaService {
  constructor(private readonly dbs: DbService) {}

  async get(tenantId: string, processId: string) {
    return this.dbs.tenant(tenantId, (tx) => this.loadDetail(tx, tenantId, processId));
  }

  private async loadDetail(tx: TenantTx, tenantId: string, processId: string) {
    const [row] = (
      await tx.execute(sql`
        SELECT b.id, b.process_id AS "processId", p.name AS "processName", p.tier,
               o.name AS "ownerName", p.owner_person_id AS "ownerPersonId",
               b.mtpd_hours AS "mtpdHours", b.rto_hours AS "rtoHours", b.rpo_hours AS "rpoHours", b.mbco,
               b.status::text AS status, b.approved_at AS "approvedAt", u.display_name AS "approvedByName"
        FROM bia b
        JOIN business_process p ON p.id = b.process_id
        LEFT JOIN person o ON o.id = p.owner_person_id
        LEFT JOIN "user" u ON u.id = b.approved_by_user_id
        WHERE b.process_id = ${processId} AND b.tenant_id = ${tenantId}`)
    ).rows as Record<string, unknown>[];
    if (!row) throw new NotFoundException({ title: 'Für diesen Prozess liegt keine BIA vor' });

    const impacts = await tx.execute(sql`
      SELECT dimension::text AS dimension, horizon::text AS horizon, score
      FROM bia_impact WHERE bia_id = ${row.id as string}`);
    const resources = await tx.execute(sql`
      SELECT a.id AS "assetId", a.ref_no AS "refNo", a.name, a.category::text AS category,
             a.availability, r.criticality
      FROM bia_resource r JOIN asset a ON a.id = r.asset_id
      WHERE r.bia_id = ${row.id as string}
      ORDER BY r.criticality NULLS LAST, a.name`);
    const plans = await tx.execute(sql`
      SELECT id, title, status::text AS status, last_test_at AS "lastTestAt", next_test_at AS "nextTestAt",
             (next_test_at < current_date) AS "testOverdue"
      FROM continuity_plan WHERE bia_id = ${row.id as string} AND tenant_id = ${tenantId}
      ORDER BY title`);

    const detail: Record<string, unknown> = {
      ...row,
      impacts: impacts.rows,
      resources: resources.rows,
      plans: plans.rows,
    };
    return { ...detail, findings: this.consistency(detail) };
  }

  /** BIA anlegen oder fortschreiben. Eine freigegebene BIA wird durch eine Änderung wieder Entwurf. */
  async upsert(ctx: AuthContext, processId: string, dto: BiaDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const [process] = await tx
        .select()
        .from(schema.businessProcess)
        .where(and(eq(schema.businessProcess.id, processId), eq(schema.businessProcess.tenantId, tenantId)));
      if (!process) throw new NotFoundException({ title: 'Geschäftsprozess nicht gefunden' });
      assertCan(ctx, P.CONTINUITY_WRITE, process);

      const [existing] = await tx
        .select()
        .from(schema.bia)
        .where(and(eq(schema.bia.processId, processId), eq(schema.bia.tenantId, tenantId)));

      const values = {
        mtpdHours: dto.mtpdHours ?? null,
        rtoHours: dto.rtoHours ?? null,
        rpoHours: dto.rpoHours ?? null,
        mbco: dto.mbco ?? null,
      };
      if (existing) {
        await tx
          .update(schema.bia)
          .set({ ...values, status: 'draft', approvedByUserId: null, approvedAt: null })
          .where(eq(schema.bia.id, existing.id));
      } else {
        await tx.insert(schema.bia).values({ tenantId, processId, ...values });
      }
      return this.loadDetail(tx, tenantId, processId);
    });
  }

  /** Auswirkung je Dimension und Zeithorizont setzen — das Raster der BIA. */
  async setImpact(ctx: AuthContext, processId: string, dto: BiaImpactDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const bia = await this.requireWritable(tx, ctx, processId);
      await tx
        .insert(schema.biaImpact)
        .values({ biaId: bia.id, dimension: dto.dimension, horizon: dto.horizon, score: dto.score })
        .onConflictDoUpdate({
          target: [schema.biaImpact.biaId, schema.biaImpact.dimension, schema.biaImpact.horizon],
          set: { score: dto.score },
        });
      return this.loadDetail(tx, tenantId, processId);
    });
  }

  /** Benötigte Ressourcen zuordnen — daraus erbt das Asset seine Kritikalität. */
  async setResource(ctx: AuthContext, processId: string, dto: BiaResourceDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const bia = await this.requireWritable(tx, ctx, processId);
      const [asset] = await tx
        .select({ id: schema.asset.id })
        .from(schema.asset)
        .where(and(eq(schema.asset.id, dto.assetId), eq(schema.asset.tenantId, tenantId)));
      if (!asset) throw new BadRequestException({ title: 'Asset gehört nicht zu diesem Mandanten' });
      await tx
        .insert(schema.biaResource)
        .values({ biaId: bia.id, assetId: dto.assetId, criticality: dto.criticality ?? null })
        .onConflictDoUpdate({
          target: [schema.biaResource.biaId, schema.biaResource.assetId],
          set: { criticality: dto.criticality ?? null },
        });
      return this.loadDetail(tx, tenantId, processId);
    });
  }

  async removeResource(ctx: AuthContext, processId: string, assetId: string) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const bia = await this.require(tx, tenantId, processId);
      await tx
        .delete(schema.biaResource)
        .where(and(eq(schema.biaResource.biaId, bia.id), eq(schema.biaResource.assetId, assetId)));
      return this.loadDetail(tx, tenantId, processId);
    });
  }

  /**
   * Freigabe der BIA. Vier-Augen-Prinzip: nicht durch die verantwortliche Person des Prozesses —
   * wer die Ausfallzeiten zusagt, bestätigt sie nicht selbst. Widersprüche im Raster blockieren
   * die Freigabe, sonst wäre die Analyse ein Papiertiger.
   */
  async approve(ctx: AuthContext, processId: string) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      assertCan(ctx, P.CONTINUITY_WRITE);
      const bia = await this.require(tx, tenantId, processId);
      const detail = (await this.loadDetail(tx, tenantId, processId)) as Record<string, unknown>;

      const owner = detail.ownerPersonId as string | null;
      if (owner && owner === ctx.personId) {
        throw new ConflictException({
          type: 'https://isms.example/problems/sod-violation',
          title: 'Funktionstrennung verletzt',
          detail:
            'Die Business-Impact-Analyse darf nicht von der Person freigegeben werden, die den Prozess verantwortet.',
        });
      }
      const blocking = (detail.findings as { severity: string; message: string }[]).filter(
        (f) => f.severity === 'error',
      );
      if (blocking.length) {
        throw new BadRequestException({
          title: 'Die Analyse ist noch widersprüchlich',
          detail: blocking.map((f) => f.message).join(' '),
        });
      }
      await tx
        .update(schema.bia)
        .set({ status: 'approved', approvedByUserId: ctx.userId, approvedAt: new Date() })
        .where(eq(schema.bia.id, bia.id));
      return this.loadDetail(tx, tenantId, processId);
    });
  }

  /** Überblick über alle Prozesse mit BIA — Grundlage der Notfallplanung. */
  async overview(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT p.id AS "processId", p.name AS "processName", p.department, p.tier,
               o.name AS "ownerName",
               b.id AS "biaId", b.status::text AS "biaStatus",
               b.mtpd_hours AS "mtpdHours", b.rto_hours AS "rtoHours", b.rpo_hours AS "rpoHours",
               (SELECT max(i.score) FROM bia_impact i WHERE i.bia_id = b.id) AS "maxImpact",
               (SELECT count(*)::int FROM bia_resource r WHERE r.bia_id = b.id) AS "resourceCount",
               (SELECT count(*)::int FROM continuity_plan cp WHERE cp.bia_id = b.id) AS "planCount",
               (SELECT min(cp.next_test_at) FROM continuity_plan cp WHERE cp.bia_id = b.id) AS "nextTestAt",
               (SELECT bool_or(cp.next_test_at < current_date) FROM continuity_plan cp WHERE cp.bia_id = b.id) AS "testOverdue"
        FROM business_process p
        LEFT JOIN person o ON o.id = p.owner_person_id
        LEFT JOIN bia b ON b.process_id = p.id AND b.tenant_id = ${tenantId}
        WHERE p.tenant_id = ${tenantId}
        ORDER BY p.tier NULLS LAST, b.rto_hours NULLS LAST, p.name`);
      return res.rows;
    });
  }

  /**
   * Widersprüche zwischen Raster, Zusagen und Inventar. Genau diese Abgleiche macht sonst
   * niemand — und genau sie fallen im Audit auf.
   */
  private consistency(detail: Record<string, unknown>) {
    const findings: { severity: 'error' | 'warning'; message: string }[] = [];
    const impacts = (detail.impacts ?? []) as { dimension: string; horizon: string; score: number }[];
    const rto = detail.rtoHours as number | null;
    const mtpd = detail.mtpdHours as number | null;
    const resources = (detail.resources ?? []) as { name: string; availability: number }[];

    if (impacts.length === 0) {
      findings.push({
        severity: 'error',
        message: 'Das Auswirkungsraster ist leer — ohne Bewertung je Zeithorizont gibt es keine BIA.',
      });
    }
    if (mtpd == null || rto == null) {
      findings.push({ severity: 'error', message: 'MTPD und RTO müssen beziffert sein.' });
    }

    // Der früheste Horizont mit kritischer Auswirkung begrenzt die vertretbare Ausfallzeit.
    const criticalHours = impacts
      .filter((i) => i.score >= CRITICAL_SCORE)
      .map((i) => HORIZON_HOURS[i.horizon] ?? Number.POSITIVE_INFINITY)
      .sort((a, b) => a - b)[0];
    if (criticalHours != null && mtpd != null && mtpd > criticalHours) {
      findings.push({
        severity: 'error',
        message: `Die Auswirkung ist bereits nach ${criticalHours} Stunden kritisch, die MTPD ist aber mit ${mtpd} Stunden angesetzt.`,
      });
    }
    if (criticalHours != null && rto != null && rto > criticalHours) {
      findings.push({
        severity: 'error',
        message: `Die zugesagte Wiederanlaufzeit von ${rto} Stunden liegt hinter dem Zeitpunkt, ab dem der Ausfall kritisch wirkt (${criticalHours} Stunden).`,
      });
    }
    if (impacts.length > 0 && impacts.every((i) => i.score === 0)) {
      findings.push({
        severity: 'warning',
        message: 'Alle Auswirkungen sind mit 0 bewertet — dann braucht dieser Prozess keine Notfallplanung.',
      });
    }
    if (resources.length === 0) {
      findings.push({
        severity: 'warning',
        message: 'Dem Prozess ist kein Asset zugeordnet; die Abhängigkeiten bleiben unbelegt.',
      });
    }
    // Ein Prozess mit kurzer Wiederanlaufzeit kann nicht auf gering verfügbaren Assets ruhen.
    if (rto != null && rto <= 24) {
      for (const r of resources.filter((x) => x.availability < 3)) {
        findings.push({
          severity: 'warning',
          message: `„${r.name}“ ist im Inventar mit Verfügbarkeit ${r.availability} von 3 bewertet, trägt aber einen Prozess mit ${rto} Stunden Wiederanlaufzeit.`,
        });
      }
    }
    // Fehlende Zellen verschweigen die unbequemen Horizonte — eine ganz leere Dimension erst recht.
    for (const d of BIA_DIMENSIONS) {
      const covered = new Set(impacts.filter((i) => i.dimension === d).map((i) => i.horizon));
      if (covered.size === 0) {
        findings.push({
          severity: 'warning',
          message: `Die Dimension „${DIMENSION_LABEL[d]}“ ist überhaupt nicht bewertet.`,
        });
        continue;
      }
      const missing = BIA_HORIZONS.filter((h) => !covered.has(h));
      if (missing.length) {
        findings.push({
          severity: 'warning',
          message: `Für „${DIMENSION_LABEL[d]}“ fehlen die Horizonte ${missing.join(', ')}.`,
        });
      }
    }
    return findings;
  }

  /** BIA laden und zugleich prüfen, ob der Aufrufer den zugehörigen Prozess pflegen darf. */
  private async requireWritable(tx: TenantTx, ctx: AuthContext, processId: string) {
    const tenantId = ctx.tenantId!;
    const [process] = await tx
      .select()
      .from(schema.businessProcess)
      .where(and(eq(schema.businessProcess.id, processId), eq(schema.businessProcess.tenantId, tenantId)));
    if (!process) throw new NotFoundException({ title: 'Geschäftsprozess nicht gefunden' });
    assertCan(ctx, P.CONTINUITY_WRITE, process);
    return this.require(tx, tenantId, processId);
  }

  private async require(tx: TenantTx, tenantId: string, processId: string) {
    const [b] = await tx
      .select()
      .from(schema.bia)
      .where(and(eq(schema.bia.processId, processId), eq(schema.bia.tenantId, tenantId)));
    if (!b) throw new NotFoundException({ title: 'Für diesen Prozess liegt keine BIA vor' });
    return b;
  }
}
