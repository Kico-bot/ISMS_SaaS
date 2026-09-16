import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import {
  type AuthContext,
  type ListQuery,
  P,
  type ProcessingActivityDto,
  type ProcessingActivityPatchDto,
} from '@isms/shared';
import { and, count, eq, ilike, sql } from 'drizzle-orm';
import { assertCan } from '../../kernel/auth/policy';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/**
 * Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO).
 *
 * Das Verzeichnis ist kein Formular, sondern eine Prüfliste mit Rechtsfolgen: fehlt die
 * Rechtsgrundlage nach Art. 9 bei besonderen Kategorien oder die Garantie nach Kap. V bei
 * einer Drittlandübermittlung, ist der Eintrag nicht bloß unvollständig, sondern falsch.
 * Deshalb blockieren diese Punkte die Aktivierung.
 */
@Injectable()
export class ProcessingService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string, q: ListQuery & { status?: string; role?: string }) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const where = and(
        eq(schema.processingActivity.tenantId, tenantId),
        q.status ? eq(schema.processingActivity.status, q.status as never) : undefined,
        q.role ? eq(schema.processingActivity.role, q.role as never) : undefined,
        q.q ? ilike(schema.processingActivity.name, `%${q.q}%`) : undefined,
      );
      const [total] = await tx.select({ n: count() }).from(schema.processingActivity).where(where);
      const items = await tx.execute(sql`
        SELECT pa.id, pa.name, pa.purpose, pa.role::text AS role, pa.legal_basis::text AS "legalBasis",
               pa.special_categories AS "specialCategories", pa.third_country_transfer AS "thirdCountryTransfer",
               pa.dpia_required AS "dpiaRequired", pa.status::text AS status, pa.retention,
               o.name AS "ownerName",
               (SELECT count(*)::int FROM processing_tom t WHERE t.processing_activity_id = pa.id) AS "tomCount",
               (SELECT count(*)::int FROM processing_asset a WHERE a.processing_activity_id = pa.id) AS "assetCount",
               d.id IS NOT NULL AS "hasDpia", d.status::text AS "dpiaStatus",
               (SELECT count(*)::int FROM incident_processing ip WHERE ip.processing_activity_id = pa.id) AS "breachCount"
        FROM processing_activity pa
        LEFT JOIN person o ON o.id = pa.owner_person_id
        LEFT JOIN dpia d ON d.processing_activity_id = pa.id
        WHERE pa.tenant_id = ${tenantId}
          ${q.status ? sql`AND pa.status = ${q.status}::processing_status` : sql``}
          ${q.role ? sql`AND pa.role = ${q.role}::processing_role` : sql``}
          ${q.q ? sql`AND pa.name ILIKE ${'%' + q.q + '%'}` : sql``}
        ORDER BY pa.status, pa.name
        LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}`);
      return { items: items.rows, total: total?.n ?? 0, page: q.page, size: q.size };
    });
  }

  async get(tenantId: string, id: string) {
    return this.dbs.tenant(tenantId, (tx) => this.loadDetail(tx, tenantId, id));
  }

  private async loadDetail(tx: TenantTx, tenantId: string, id: string) {
    const activity = await this.require(tx, tenantId, id);
    const [owner] = (
      await tx.execute(sql`SELECT name FROM person WHERE id = ${activity.ownerPersonId ?? null}`)
    ).rows as { name: string }[];
    const toms = await tx.execute(sql`
      SELECT m.id, m.ref_no AS "refNo", m.title, m.status::text AS status, m.domain::text AS domain
      FROM processing_tom t JOIN measure m ON m.id = t.measure_id
      WHERE t.processing_activity_id = ${id} AND m.tenant_id = ${tenantId}
      ORDER BY m.ref_no`);
    const assets = await tx.execute(sql`
      SELECT a.id, a.ref_no AS "refNo", a.name, a.category::text AS category, a.has_pii AS "hasPii"
      FROM processing_asset pa JOIN asset a ON a.id = pa.asset_id
      WHERE pa.processing_activity_id = ${id} AND a.tenant_id = ${tenantId}
      ORDER BY a.ref_no`);
    const breaches = await tx.execute(sql`
      SELECT i.id, i.ref_no AS "refNo", i.title, i.severity::text AS severity, i.detected_at AS "detectedAt"
      FROM incident_processing ip JOIN incident i ON i.id = ip.incident_id
      WHERE ip.processing_activity_id = ${id} AND i.tenant_id = ${tenantId}
      ORDER BY i.detected_at DESC`);
    const [dpiaRow] = (
      await tx.execute(sql`
        SELECT id, status::text AS status, result::text AS result, dpo_consulted_at AS "dpoConsultedAt"
        FROM dpia WHERE processing_activity_id = ${id} AND tenant_id = ${tenantId}`)
    ).rows as Record<string, unknown>[];

    const detail: Record<string, unknown> = {
      ...activity,
      ownerName: owner?.name ?? null,
      toms: toms.rows,
      assets: assets.rows,
      breaches: breaches.rows,
      dpia: dpiaRow ?? null,
    };
    return { ...detail, ...this.assess(detail) };
  }

  async create(ctx: AuthContext, dto: ProcessingActivityDto) {
    const tenantId = ctx.tenantId!;
    assertCan(ctx, P.PRIVACY_WRITE);
    return this.dbs.tenant(tenantId, async (tx) => {
      const [pa] = await tx
        .insert(schema.processingActivity)
        .values({ tenantId, ...this.values(dto) })
        .returning();
      return this.loadDetail(tx, tenantId, pa!.id);
    });
  }

  async update(ctx: AuthContext, id: string, dto: ProcessingActivityPatchDto) {
    const tenantId = ctx.tenantId!;
    assertCan(ctx, P.PRIVACY_WRITE);
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.require(tx, tenantId, id);
      const set: Record<string, unknown> = {};
      for (const k of [
        'name',
        'purpose',
        'role',
        'legalBasis',
        'legalBasisNote',
        'dataSubjectCategories',
        'dataCategories',
        'specialCategories',
        'recipients',
        'thirdCountryTransfer',
        'safeguards',
        'retention',
        'dpiaRequired',
        'ownerPersonId',
      ] as const) {
        if (dto[k] !== undefined) set[k] = dto[k];
      }

      if (dto.status !== undefined) {
        if (dto.status === 'active') {
          // Vor der Aktivierung müssen die harten Punkte stimmen — ein aktiver Eintrag
          // ist die Aussage „so verarbeiten wir rechtmäßig“.
          const preview = { ...(await this.loadDetail(tx, tenantId, id)), ...set } as Record<string, unknown>;
          const blocking = this.assess(preview).findings.filter((f) => f.severity === 'error');
          if (blocking.length) {
            throw new BadRequestException({
              title: 'Der Eintrag ist noch nicht vollständig',
              detail: blocking.map((f) => f.message).join(' '),
            });
          }
        }
        set.status = dto.status;
      }
      if (Object.keys(set).length)
        await tx.update(schema.processingActivity).set(set).where(eq(schema.processingActivity.id, id));
      return this.loadDetail(tx, tenantId, id);
    });
  }

  /** TOM zuordnen — dieselbe Maßnahme wie im ISMS, nicht eine zweite Liste daneben. */
  async linkTom(ctx: AuthContext, id: string, measureId: string) {
    const tenantId = ctx.tenantId!;
    assertCan(ctx, P.PRIVACY_WRITE);
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.require(tx, tenantId, id);
      const [measure] = await tx
        .select({ id: schema.measure.id })
        .from(schema.measure)
        .where(and(eq(schema.measure.id, measureId), eq(schema.measure.tenantId, tenantId)));
      if (!measure) throw new BadRequestException({ title: 'Maßnahme gehört nicht zu diesem Mandanten' });
      await tx
        .insert(schema.processingTom)
        .values({ processingActivityId: id, measureId })
        .onConflictDoNothing();
      return this.loadDetail(tx, tenantId, id);
    });
  }

  async unlinkTom(ctx: AuthContext, id: string, measureId: string) {
    const tenantId = ctx.tenantId!;
    assertCan(ctx, P.PRIVACY_WRITE);
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.require(tx, tenantId, id);
      await tx
        .delete(schema.processingTom)
        .where(
          and(
            eq(schema.processingTom.processingActivityId, id),
            eq(schema.processingTom.measureId, measureId),
          ),
        );
      return this.loadDetail(tx, tenantId, id);
    });
  }

  async linkAsset(ctx: AuthContext, id: string, assetId: string) {
    const tenantId = ctx.tenantId!;
    assertCan(ctx, P.PRIVACY_WRITE);
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.require(tx, tenantId, id);
      const [asset] = await tx
        .select({ id: schema.asset.id })
        .from(schema.asset)
        .where(and(eq(schema.asset.id, assetId), eq(schema.asset.tenantId, tenantId)));
      if (!asset) throw new BadRequestException({ title: 'Asset gehört nicht zu diesem Mandanten' });
      await tx
        .insert(schema.processingAsset)
        .values({ processingActivityId: id, assetId })
        .onConflictDoNothing();
      return this.loadDetail(tx, tenantId, id);
    });
  }

  /** Kennzahlen des Verzeichnisses — für das Datenschutz-Dashboard und die Managementbewertung. */
  async summary(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const [row] = (
        await tx.execute(sql`
          SELECT count(*)::int AS total,
                 count(*) FILTER (WHERE status = 'active')::int AS active,
                 count(*) FILTER (WHERE status = 'draft')::int AS draft,
                 count(*) FILTER (WHERE special_categories)::int AS "specialCategories",
                 count(*) FILTER (WHERE third_country_transfer)::int AS "thirdCountry",
                 count(*) FILTER (WHERE third_country_transfer AND COALESCE(safeguards, '') = '')::int AS "transferWithoutSafeguards",
                 count(*) FILTER (WHERE dpia_required)::int AS "dpiaRequired",
                 count(*) FILTER (WHERE dpia_required AND NOT EXISTS (SELECT 1 FROM dpia d WHERE d.processing_activity_id = processing_activity.id))::int AS "dpiaMissing",
                 count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM processing_tom t WHERE t.processing_activity_id = processing_activity.id))::int AS "withoutToms"
          FROM processing_activity WHERE tenant_id = ${tenantId}`)
      ).rows as Record<string, number>[];
      return row ?? {};
    });
  }

  /**
   * Prüfung eines Eintrags gegen Art. 30, 9, 32, 35 und Kap. V. `error` heißt: so darf der
   * Eintrag nicht aktiv gestellt werden; `warning` heißt: unvollständig, aber vertretbar.
   */
  private assess(detail: Record<string, unknown>) {
    const findings: { severity: 'error' | 'warning'; message: string }[] = [];
    const role = detail.role as string;
    const legalBasis = detail.legalBasis as string | null;
    const special = detail.specialCategories === true;
    const thirdCountry = detail.thirdCountryTransfer === true;
    const safeguards = (detail.safeguards as string | null)?.trim();
    const subjects = (detail.dataSubjectCategories ?? []) as string[];
    const categories = (detail.dataCategories ?? []) as string[];
    const toms = (detail.toms ?? []) as { status: string }[];
    const dpia = detail.dpia as { status?: string } | null;

    if (!(detail.purpose as string | null)?.trim()) {
      findings.push({
        severity: 'error',
        message: 'Der Zweck der Verarbeitung fehlt (Art. 30 Abs. 1 lit. b).',
      });
    }
    if (subjects.length === 0 || categories.length === 0) {
      findings.push({
        severity: 'error',
        message:
          'Kategorien betroffener Personen und personenbezogener Daten müssen benannt sein (Art. 30 Abs. 1 lit. c).',
      });
    }
    // Der Auftragsverarbeiter führt sein Verzeichnis nach Art. 30 Abs. 2 — ohne eigene Rechtsgrundlage.
    if (role !== 'processor' && !legalBasis) {
      findings.push({ severity: 'error', message: 'Es ist keine Rechtsgrundlage angegeben (Art. 6).' });
    }
    if (special && legalBasis && legalBasis.startsWith('art6_')) {
      findings.push({
        severity: 'error',
        message:
          'Bei besonderen Kategorien personenbezogener Daten genügt Art. 6 nicht — erforderlich ist ein Ausnahmetatbestand nach Art. 9 Abs. 2.',
      });
    }
    if (thirdCountry && !safeguards) {
      findings.push({
        severity: 'error',
        message:
          'Für die Übermittlung in ein Drittland fehlen die Garantien nach Kapitel V (Art. 30 Abs. 1 lit. e).',
      });
    }
    if (!(detail.retention as string | null)?.trim()) {
      findings.push({
        severity: 'warning',
        message: 'Es ist keine Löschfrist hinterlegt (Art. 30 Abs. 1 lit. f).',
      });
    }
    if (toms.length === 0) {
      findings.push({
        severity: 'warning',
        message: 'Es sind keine technischen und organisatorischen Maßnahmen zugeordnet (Art. 32).',
      });
    } else if (!toms.some((t) => t.status === 'implemented' || t.status === 'verified')) {
      findings.push({
        severity: 'warning',
        message: 'Keine der zugeordneten Maßnahmen ist umgesetzt — Art. 32 verlangt wirksame Maßnahmen.',
      });
    }

    // Art. 35 Abs. 3: die Folgenabschätzung ist bei bestimmten Verarbeitungen Pflicht.
    const dpiaReasons: string[] = [];
    if (special) dpiaReasons.push('besondere Kategorien nach Art. 9');
    if (thirdCountry && special) dpiaReasons.push('Drittlandübermittlung besonderer Kategorien');
    const dpiaRequired = detail.dpiaRequired === true || dpiaReasons.length > 0;
    if (dpiaReasons.length > 0 && detail.dpiaRequired !== true) {
      findings.push({
        severity: 'warning',
        message: `Die Verarbeitung spricht für eine Folgenabschätzung (${dpiaReasons.join(', ')}), ist aber nicht als DSFA-pflichtig markiert (Art. 35 Abs. 3).`,
      });
    }
    if (dpiaRequired && !dpia) {
      findings.push({
        severity: 'error',
        message: 'Die Verarbeitung ist DSFA-pflichtig, es liegt aber keine Folgenabschätzung vor (Art. 35).',
      });
    } else if (dpiaRequired && dpia && dpia.status !== 'approved') {
      findings.push({ severity: 'warning', message: 'Die Folgenabschätzung ist noch nicht abgeschlossen.' });
    }

    return { findings, dpiaSuggested: dpiaReasons.length > 0, dpiaReasons };
  }

  private values(dto: ProcessingActivityDto) {
    return {
      name: dto.name,
      purpose: dto.purpose ?? null,
      role: dto.role,
      legalBasis: dto.legalBasis ?? null,
      legalBasisNote: dto.legalBasisNote ?? null,
      dataSubjectCategories: dto.dataSubjectCategories,
      dataCategories: dto.dataCategories,
      specialCategories: dto.specialCategories,
      recipients: dto.recipients,
      thirdCountryTransfer: dto.thirdCountryTransfer,
      safeguards: dto.safeguards ?? null,
      retention: dto.retention ?? null,
      dpiaRequired: dto.dpiaRequired,
      ownerPersonId: dto.ownerPersonId ?? null,
    };
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [pa] = await tx
      .select()
      .from(schema.processingActivity)
      .where(and(eq(schema.processingActivity.id, id), eq(schema.processingActivity.tenantId, tenantId)));
    if (!pa) throw new NotFoundException({ title: 'Verarbeitungstätigkeit nicht gefunden' });
    return pa;
  }
}
