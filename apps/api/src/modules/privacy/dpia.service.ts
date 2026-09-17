import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import { type AuthContext, type DpiaDto, type DpoOpinionDto, P, RISK_MATRIX_SIZE } from '@isms/shared';
import { and, eq, sql } from 'drizzle-orm';
import { assertCan } from '../../kernel/auth/policy';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/** Ab diesem Produkt aus Eintrittswahrscheinlichkeit und Schwere gilt ein Risiko als hoch. */
const HIGH_RISK_SCORE = 15;

/**
 * Datenschutz-Folgenabschätzung (Art. 35 DSGVO).
 *
 * Zwei Regeln tragen das Modul:
 *  - Ohne den Rat der oder des Datenschutzbeauftragten wird keine DSFA abgeschlossen (Art. 35 Abs. 2).
 *  - Diesen Rat gibt nicht, wer die Verarbeitung verantwortet — sonst berät sich der Verantwortliche selbst.
 */
@Injectable()
export class DpiaService {
  constructor(private readonly dbs: DbService) {}

  async get(tenantId: string, processingActivityId: string) {
    return this.dbs.tenant(tenantId, (tx) => this.loadDetail(tx, tenantId, processingActivityId));
  }

  private async loadDetail(tx: TenantTx, tenantId: string, processingActivityId: string) {
    const [row] = (
      await tx.execute(sql`
        SELECT d.id, d.processing_activity_id AS "processingActivityId", pa.name AS "processingName",
               pa.special_categories AS "specialCategories", pa.third_country_transfer AS "thirdCountryTransfer",
               o.name AS "ownerName", pa.owner_person_id AS "ownerPersonId",
               d.status::text AS status, d.result::text AS result,
               d.description_of_processing AS "descriptionOfProcessing",
               d.necessity_assessment AS "necessityAssessment", d.risks,
               d.dpo_opinion AS "dpoOpinion", d.dpo_consulted_at AS "dpoConsultedAt",
               u.display_name AS "dpoName"
        FROM dpia d
        JOIN processing_activity pa ON pa.id = d.processing_activity_id
        LEFT JOIN person o ON o.id = pa.owner_person_id
        LEFT JOIN "user" u ON u.id = d.dpo_user_id
        WHERE d.processing_activity_id = ${processingActivityId} AND d.tenant_id = ${tenantId}`)
    ).rows as Record<string, unknown>[];
    if (!row)
      throw new NotFoundException({ title: 'Für diese Verarbeitung liegt keine Folgenabschätzung vor' });

    const risks = (row.risks ?? []) as {
      title: string;
      likelihood: number;
      impact: number;
      mitigation?: string | null;
    }[];
    const scored = risks.map((r) => ({
      ...r,
      score: r.likelihood * r.impact,
      high: r.likelihood * r.impact >= HIGH_RISK_SCORE,
    }));
    return { ...row, risks: scored, findings: this.assess(row, scored) };
  }

  /** DSFA anlegen oder fortschreiben. Eine Änderung nimmt eine erteilte Stellungnahme zurück. */
  async upsert(ctx: AuthContext, processingActivityId: string, dto: DpiaDto) {
    const tenantId = ctx.tenantId!;
    assertCan(ctx, P.PRIVACY_WRITE);
    return this.dbs.tenant(tenantId, async (tx) => {
      const [pa] = await tx
        .select()
        .from(schema.processingActivity)
        .where(
          and(
            eq(schema.processingActivity.id, processingActivityId),
            eq(schema.processingActivity.tenantId, tenantId),
          ),
        );
      if (!pa) throw new NotFoundException({ title: 'Verarbeitungstätigkeit nicht gefunden' });

      for (const r of dto.risks) {
        if (r.likelihood > RISK_MATRIX_SIZE || r.impact > RISK_MATRIX_SIZE) {
          throw new BadRequestException({
            title: `Bewertungen liegen auf einer Skala von 1 bis ${RISK_MATRIX_SIZE}`,
          });
        }
      }

      const [existing] = await tx
        .select()
        .from(schema.dpia)
        .where(
          and(eq(schema.dpia.processingActivityId, processingActivityId), eq(schema.dpia.tenantId, tenantId)),
        );

      const values = {
        descriptionOfProcessing: dto.descriptionOfProcessing ?? null,
        necessityAssessment: dto.necessityAssessment ?? null,
        risks: dto.risks,
      };
      if (existing) {
        // Eine inhaltliche Änderung entwertet die bisherige Stellungnahme — sie bezog sich
        // auf einen anderen Stand.
        await tx
          .update(schema.dpia)
          .set({
            ...values,
            status: 'draft',
            result: null,
            dpoOpinion: null,
            dpoUserId: null,
            dpoConsultedAt: null,
          })
          .where(eq(schema.dpia.id, existing.id));
      } else {
        await tx.insert(schema.dpia).values({ tenantId, processingActivityId, ...values });
      }
      return this.loadDetail(tx, tenantId, processingActivityId);
    });
  }

  /** Zur Stellungnahme vorlegen. */
  async submit(ctx: AuthContext, processingActivityId: string) {
    const tenantId = ctx.tenantId!;
    assertCan(ctx, P.PRIVACY_WRITE);
    return this.dbs.tenant(tenantId, async (tx) => {
      const dpia = await this.require(tx, tenantId, processingActivityId);
      const detail = (await this.loadDetail(tx, tenantId, processingActivityId)) as Record<string, unknown>;
      const blocking = (detail.findings as { severity: string; message: string }[]).filter(
        (f) => f.severity === 'error',
      );
      if (blocking.length) {
        throw new BadRequestException({
          title: 'Die Folgenabschätzung ist noch unvollständig',
          detail: blocking.map((f) => f.message).join(' '),
        });
      }
      await tx.update(schema.dpia).set({ status: 'in_review' }).where(eq(schema.dpia.id, dpia.id));
      return this.loadDetail(tx, tenantId, processingActivityId);
    });
  }

  /**
   * Stellungnahme der oder des Datenschutzbeauftragten (Art. 35 Abs. 2) und Abschluss.
   * Nicht durch die Person, die die Verarbeitung verantwortet.
   */
  async recordOpinion(ctx: AuthContext, processingActivityId: string, dto: DpoOpinionDto) {
    const tenantId = ctx.tenantId!;
    assertCan(ctx, P.PRIVACY_WRITE);
    return this.dbs.tenant(tenantId, async (tx) => {
      const dpia = await this.require(tx, tenantId, processingActivityId);
      if (dpia.status === 'draft') {
        throw new BadRequestException({
          title: 'Die Folgenabschätzung liegt noch nicht vor',
          detail: 'Legen Sie die Abschätzung zunächst zur Stellungnahme vor.',
        });
      }
      const detail = (await this.loadDetail(tx, tenantId, processingActivityId)) as Record<string, unknown>;
      if (detail.ownerPersonId && detail.ownerPersonId === ctx.personId) {
        throw new ConflictException({
          type: 'https://isms.example/problems/sod-violation',
          title: 'Funktionstrennung verletzt',
          detail:
            'Die Stellungnahme nach Art. 35 Abs. 2 kommt von der oder dem Datenschutzbeauftragten, nicht von der Person, die die Verarbeitung verantwortet.',
        });
      }
      await tx
        .update(schema.dpia)
        .set({
          status: 'approved',
          result: dto.result,
          dpoOpinion: dto.opinion,
          dpoUserId: ctx.userId,
          dpoConsultedAt: new Date(),
        })
        .where(eq(schema.dpia.id, dpia.id));
      return this.loadDetail(tx, tenantId, processingActivityId);
    });
  }

  /** Prüfung gegen Art. 35 Abs. 7. */
  private assess(row: Record<string, unknown>, risks: { high: boolean; mitigation?: string | null }[]) {
    const findings: { severity: 'error' | 'warning'; message: string }[] = [];
    if (!(row.descriptionOfProcessing as string | null)?.trim()) {
      findings.push({
        severity: 'error',
        message: 'Die systematische Beschreibung der Verarbeitung fehlt (Art. 35 Abs. 7 lit. a).',
      });
    }
    if (!(row.necessityAssessment as string | null)?.trim()) {
      findings.push({
        severity: 'error',
        message: 'Die Bewertung von Notwendigkeit und Verhältnismäßigkeit fehlt (Art. 35 Abs. 7 lit. b).',
      });
    }
    if (risks.length === 0) {
      findings.push({
        severity: 'error',
        message:
          'Es ist kein Risiko für die Rechte und Freiheiten betroffener Personen bewertet (Art. 35 Abs. 7 lit. c).',
      });
    }
    const unmitigated = risks.filter((r) => r.high && !r.mitigation?.trim());
    if (unmitigated.length) {
      findings.push({
        severity: 'error',
        message: `${unmitigated.length} hohes Risiko ohne Abhilfemaßnahme — Art. 35 Abs. 7 lit. d verlangt die geplanten Abhilfemaßnahmen; bleibt das Risiko hoch, ist die Aufsichtsbehörde nach Art. 36 vorab zu konsultieren.`,
      });
    }
    if (row.status === 'approved' && !(row.dpoOpinion as string | null)?.trim()) {
      findings.push({
        severity: 'error',
        message: 'Die Stellungnahme der oder des Datenschutzbeauftragten fehlt (Art. 35 Abs. 2).',
      });
    }
    if (row.result === 'rejected') {
      findings.push({
        severity: 'warning',
        message: 'Die Verarbeitung wurde abgelehnt — sie darf in dieser Form nicht aufgenommen werden.',
      });
    }
    return findings;
  }

  private async require(tx: TenantTx, tenantId: string, processingActivityId: string) {
    const [d] = await tx
      .select()
      .from(schema.dpia)
      .where(
        and(eq(schema.dpia.processingActivityId, processingActivityId), eq(schema.dpia.tenantId, tenantId)),
      );
    if (!d)
      throw new NotFoundException({ title: 'Für diese Verarbeitung liegt keine Folgenabschätzung vor' });
    return d;
  }
}
