import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import {
  aiFriaRequired,
  aiRiskClass,
  type AiSystemDto,
  type AiSystemPatchDto,
  aiTriggers,
  type AuthContext,
  P,
  REF_PREFIX,
  type RequirementScope,
} from '@isms/shared';
import { and, eq, sql } from 'drizzle-orm';
import { assertCan } from '../../kernel/auth/policy';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

type AiSystemRow = typeof schema.aiSystem.$inferSelect;

export interface AiFinding {
  severity: 'error' | 'warning' | 'info';
  message: string;
}

/** Fünf Monate und dreißig Tage sind nicht „mindestens sechs Monate“ (Art. 26 Abs. 6). */
const MIN_LOG_RETENTION_MONTHS = 6;

const FIELDS = [
  'name',
  'purpose',
  'providerName',
  'supplierAssetId',
  'ownerPersonId',
  'oversightPersonId',
  'prohibitedPractices',
  'annexIiiArea',
  'annexIProduct',
  'art6Exception',
  'art6Justification',
  'emotionOrBiometric',
  'deepfakeOrPublicText',
  'publicService',
  'creditOrInsurance',
  'instructionsReceived',
  'logRetentionMonths',
  'workplaceUse',
  'workersInformedAt',
  'friaCompletedAt',
  'personalData',
  'processingActivityId',
  'notes',
] as const;

/**
 * KI-Register nach dem AI Act — **ausschließlich in der Rolle des Betreibers** (Art. 3 Nr. 4).
 *
 * Wie das Verarbeitungsverzeichnis ist das Register eine Prüfliste mit Rechtsfolgen: die
 * Risikoklasse wird aus den Antworten abgeleitet, nicht eingetragen, und was der AI Act für
 * diese Klasse vom Betreiber verlangt, blockiert die Inbetriebnahme, solange es fehlt. Und es
 * bestimmt, welche Pflichten des Katalogs überhaupt zählen (`requirement_in_scope`).
 */
@Injectable()
export class AiSystemsService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT s.id, s.ref_no AS "refNo", s.name, s.purpose, s.provider_name AS "providerName",
               s.status::text AS status, s.risk_class AS "riskClass", s.fria_required AS "friaRequired",
               s.annex_iii_area::text AS "annexIiiArea", o.name AS "ownerName", v.name AS "oversightName"
        FROM ai_system s
        LEFT JOIN person o ON o.id = s.owner_person_id
        LEFT JOIN person v ON v.id = s.oversight_person_id
        WHERE s.tenant_id = ${tenantId}
        ORDER BY CASE s.risk_class WHEN 'prohibited' THEN 0 WHEN 'high' THEN 1 WHEN 'limited' THEN 2 ELSE 3 END,
                 s.status, s.ref_no`);
      const full = await tx.select().from(schema.aiSystem).where(eq(schema.aiSystem.tenantId, tenantId));
      const byId = new Map(full.map((r) => [r.id, r]));
      return (rows.rows as { id: string }[]).map((r) => {
        const f = this.assess(byId.get(r.id)!).filter((x) => x.severity === 'error');
        return { ...r, errorCount: f.length };
      });
    });
  }

  async get(tenantId: string, id: string) {
    return this.dbs.tenant(tenantId, (tx) => this.loadDetail(tx, tenantId, id));
  }

  async create(ctx: AuthContext, dto: AiSystemDto) {
    const tenantId = ctx.tenantId!;
    assertCan(ctx, P.AI_WRITE);
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.assertRefs(tx, tenantId, dto);
      const refNo = await this.dbs.nextRefNo(tx, tenantId, 'ai_system', REF_PREFIX.ai_system);
      const values: Record<string, unknown> = { tenantId, refNo };
      for (const k of FIELDS) if (dto[k] !== undefined) values[k] = dto[k];
      const [row] = await tx
        .insert(schema.aiSystem)
        .values(values as typeof schema.aiSystem.$inferInsert)
        .returning();
      return this.loadDetail(tx, tenantId, row!.id);
    });
  }

  async update(ctx: AuthContext, id: string, dto: AiSystemPatchDto) {
    const tenantId = ctx.tenantId!;
    assertCan(ctx, P.AI_WRITE);
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      await this.assertRefs(tx, tenantId, dto);
      const set: Record<string, unknown> = {};
      for (const k of FIELDS) if (dto[k] !== undefined) set[k] = dto[k];

      // Aktiv heißt „so setzen wir es ein, und zwar zulässig“ — das muss vorher stimmen. Gilt
      // auch, wenn ein aktives System geändert wird: eine neue Antwort kann es unzulässig machen.
      const target = dto.status ?? existing.status;
      if (target === 'active') {
        const preview = { ...existing, ...set } as AiSystemRow;
        const blocking = this.assess(preview).filter((f) => f.severity === 'error');
        if (blocking.length) {
          throw new BadRequestException({
            title:
              aiRiskClass(preview) === 'prohibited'
                ? 'Verbotene KI-Praktik — der Einsatz ist unzulässig'
                : 'Das KI-System kann so nicht in Betrieb gehen',
            detail: blocking.map((f) => f.message).join(' '),
          });
        }
      }
      if (dto.status !== undefined) set.status = dto.status;
      if (Object.keys(set).length) {
        set.updatedAt = new Date();
        await tx.update(schema.aiSystem).set(set).where(eq(schema.aiSystem.id, id));
      }
      return this.loadDetail(tx, tenantId, id);
    });
  }

  private async loadDetail(tx: TenantTx, tenantId: string, id: string) {
    const s = await this.require(tx, tenantId, id);
    const names = (
      await tx.execute(sql`
        SELECT (SELECT name FROM person WHERE id = ${s.ownerPersonId ?? null}) AS "ownerName",
               (SELECT name FROM person WHERE id = ${s.oversightPersonId ?? null}) AS "oversightName",
               (SELECT name FROM processing_activity WHERE id = ${s.processingActivityId ?? null}) AS "processingName",
               (SELECT ref_no || ' ' || name FROM asset WHERE id = ${s.supplierAssetId ?? null}) AS "supplierName"`)
    ).rows[0] as Record<string, string | null>;

    // Welche Betreiberpflichten löst genau dieses System aus? Dieselbe Regel wie requirement_in_scope().
    const catalog = (
      await tx.execute(sql`
        SELECT r.id, r.ref_code AS "refCode", r.title, r.applies_to::text AS "appliesTo",
               r.applies_from AS "appliesFrom"
        FROM requirement r JOIN framework f ON f.id = r.framework_id
        WHERE f.key = 'EU_AI_ACT' AND r.applies_to IS NOT NULL
        ORDER BY r.sort_order`)
    ).rows as {
      id: string;
      refCode: string;
      title: string;
      appliesTo: RequirementScope;
      appliesFrom: string | null;
    }[];
    const obligations = catalog.filter((r) => aiTriggers(r.appliesTo, s));

    const incidents = await tx.execute(sql`
      SELECT id, ref_no AS "refNo", title, ai_serious_at AS "aiSeriousAt"
      FROM incident WHERE ai_system_id = ${id} AND tenant_id = ${tenantId}
      ORDER BY detected_at DESC`);

    return {
      ...s,
      ...names,
      obligations,
      incidents: incidents.rows,
      findings: this.assess(s),
    };
  }

  /**
   * Was der AI Act vom Betreiber für dieses System verlangt. `error` blockiert die Inbetriebnahme.
   * Bewusst nur Betreiberpflichten: Konformität, CE-Kennzeichnung und technische Dokumentation
   * liegen beim Anbieter und sind kein Prüfpunkt hier.
   */
  assess(s: AiSystemRow): AiFinding[] {
    const out: AiFinding[] = [];
    const cls = aiRiskClass(s);

    if (cls === 'prohibited') {
      out.push({
        severity: 'error',
        message:
          'Eine verbotene Praxis nach Art. 5 ist angekreuzt. Ein solches System darf nicht eingesetzt werden — auch nicht testweise im Betrieb.',
      });
      return out;
    }
    if (s.art6Exception && !s.art6Justification?.trim()) {
      out.push({
        severity: 'error',
        message:
          'Die Ausnahme nach Art. 6 Abs. 3 braucht eine dokumentierte Begründung, warum kein erhebliches Risiko besteht.',
      });
    }
    if (s.personalData && !s.processingActivityId) {
      out.push({
        severity: 'error',
        message:
          'Das System verarbeitet personenbezogene Daten, aber keine Verarbeitungstätigkeit ist verknüpft (Art. 30 DSGVO; Art. 26 Abs. 9 AI Act).',
      });
    }

    if (cls === 'high') {
      if (!s.oversightPersonId)
        out.push({
          severity: 'error',
          message: 'Niemand ist für die menschliche Aufsicht benannt (Art. 26 Abs. 2).',
        });
      if (!s.instructionsReceived)
        out.push({
          severity: 'error',
          message:
            'Die Betriebsanleitung des Anbieters liegt nicht vor — ohne sie ist ein Einsatz nach Art. 26 Abs. 1 nicht möglich.',
        });
      if (s.logRetentionMonths == null || s.logRetentionMonths < MIN_LOG_RETENTION_MONTHS)
        out.push({
          severity: 'error',
          message:
            'Die automatisch erzeugten Protokolle sind mindestens sechs Monate aufzubewahren (Art. 26 Abs. 6).',
        });
      if (s.workplaceUse && !s.workersInformedAt)
        out.push({
          severity: 'error',
          message:
            'Einsatz am Arbeitsplatz: Arbeitnehmervertretung und Beschäftigte sind vorher zu informieren (Art. 26 Abs. 7).',
        });
      if (aiFriaRequired(s) && !s.friaCompletedAt)
        out.push({
          severity: 'error',
          message:
            'Vor der ersten Verwendung ist eine Grundrechte-Folgenabschätzung durchzuführen (Art. 27).',
        });
      out.push({
        severity: 'info',
        message: s.annexIProduct
          ? 'Hochrisiko als Sicherheitsbauteil eines Produkts (Anhang I): Betreiberpflichten gelten ab 2. August 2028.'
          : 'Hochrisiko nach Anhang III: Betreiberpflichten gelten ab 2. Dezember 2027 (AI Omnibus, VO 2026/1744).',
      });
    }

    if (s.emotionOrBiometric)
      out.push({
        severity: 'warning',
        message:
          'Betroffene Personen sind über Emotionserkennung oder biometrische Kategorisierung zu informieren (Art. 50 Abs. 3).',
      });
    if (s.deepfakeOrPublicText)
      out.push({
        severity: 'warning',
        message:
          'Deepfakes und KI-erzeugte Texte zu öffentlichen Themen sind als künstlich erzeugt offenzulegen (Art. 50 Abs. 4).',
      });
    if (!s.ownerPersonId)
      out.push({ severity: 'warning', message: 'Es ist keine verantwortliche Person benannt.' });
    return out;
  }

  /** Fremdschlüssel nur aus dem eigenen Mandanten — RLS schützt auch, aber die Meldung soll verständlich sein. */
  private async assertRefs(tx: TenantTx, tenantId: string, dto: Partial<AiSystemDto>) {
    const checks: [string | null | undefined, string, string][] = [
      [dto.ownerPersonId, 'person', 'Verantwortliche Person'],
      [dto.oversightPersonId, 'person', 'Person für die menschliche Aufsicht'],
      [dto.processingActivityId, 'processing_activity', 'Verarbeitungstätigkeit'],
      [dto.supplierAssetId, 'asset', 'Lieferant'],
    ];
    for (const [id, table, label] of checks) {
      if (!id) continue;
      const r = await tx.execute(
        sql`SELECT 1 FROM ${sql.identifier(table)} WHERE id = ${id} AND tenant_id = ${tenantId}`,
      );
      if (!r.rows.length) throw new BadRequestException({ title: `${label} nicht gefunden` });
    }
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [s] = await tx
      .select()
      .from(schema.aiSystem)
      .where(and(eq(schema.aiSystem.id, id), eq(schema.aiSystem.tenantId, tenantId)));
    if (!s) throw new NotFoundException({ title: 'KI-System nicht gefunden' });
    return s;
  }
}
