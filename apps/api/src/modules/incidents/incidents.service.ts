import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import {
  type AuthContext,
  type ConfirmBreachDto,
  type FulfilObligationDto,
  type IncidentDto,
  type IncidentPatchDto,
  type ListQuery,
  type MarkSignificantDto,
  type RcaDto,
  REF_PREFIX,
  type TimelineEntryDto,
} from '@isms/shared';
import { and, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { DbService, type TenantTx } from '../../kernel/db/db.service';
import { finalReportDueFrom, gdprDeadlines, nis2Deadlines, REGIME_LABEL } from './reporting-deadlines';

@Injectable()
export class IncidentsService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string, q: ListQuery & { status?: string; severity?: string; open?: boolean }) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const where = and(
        eq(schema.incident.tenantId, tenantId),
        q.status ? eq(schema.incident.status, q.status as never) : undefined,
        q.severity ? eq(schema.incident.severity, q.severity as never) : undefined,
        q.q ? or(ilike(schema.incident.title, `%${q.q}%`), ilike(schema.incident.refNo, `%${q.q}%`)) : undefined,
      );
      const [total] = await tx.select({ n: count() }).from(schema.incident).where(where);
      const items = await tx.execute(sql`
        SELECT i.id, i.ref_no AS "refNo", i.title, i.category::text AS category, i.severity::text AS severity,
               i.status::text AS status, i.detected_at AS "detectedAt", i.is_personal_data_breach AS "isPersonalDataBreach",
               i.nis2_relevant AS "nis2Relevant", p.name AS "handlerName",
               COALESCE(o.open_count, 0) AS "openObligations",
               o.next_due AS "nextObligationDueAt",
               COALESCE(o.overdue, 0) AS "overdueObligations"
        FROM incident i
        LEFT JOIN person p ON p.id = i.handler_person_id
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS open_count,
                 min(due_at) FILTER (WHERE due_at IS NOT NULL) AS next_due,
                 count(*) FILTER (WHERE due_at < now())::int AS overdue
          FROM reporting_obligation ro
          WHERE ro.incident_id = i.id AND ro.fulfilled_at IS NULL
        ) o ON true
        WHERE i.tenant_id = ${tenantId}
          ${q.status ? sql`AND i.status = ${q.status}::incident_status` : sql``}
          ${q.severity ? sql`AND i.severity = ${q.severity}::severity` : sql``}
          ${q.open ? sql`AND i.status NOT IN ('resolved','closed')` : sql``}
          ${q.q ? sql`AND (i.title ILIKE ${'%' + q.q + '%'} OR i.ref_no ILIKE ${'%' + q.q + '%'})` : sql``}
        ORDER BY i.detected_at DESC
        LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}`);
      return { items: items.rows, total: total?.n ?? 0, page: q.page, size: q.size };
    });
  }

  async get(tenantId: string, id: string) {
    return this.dbs.tenant(tenantId, (tx) => this.loadDetail(tx, tenantId, id));
  }

  /**
   * Detailansicht innerhalb einer bestehenden Transaktion. Schreibende Operationen geben ihr
   * Ergebnis darüber zurück — eine zweite Transaktion sähe die eigenen Änderungen noch nicht.
   */
  private async loadDetail(tx: TenantTx, tenantId: string, id: string) {
    {
      const inc = await this.require(tx, tenantId, id);
      const obligations = await tx
        .select()
        .from(schema.reportingObligation)
        .where(eq(schema.reportingObligation.incidentId, id))
        .orderBy(sql`due_at NULLS LAST`);
      const timeline = await tx
        .select()
        .from(schema.incidentTimeline)
        .where(eq(schema.incidentTimeline.incidentId, id))
        .orderBy(desc(schema.incidentTimeline.at));
      const assets = await tx.execute(sql`
        SELECT a.id, a.ref_no AS "refNo", a.name FROM incident_asset ia JOIN asset a ON a.id = ia.asset_id
        WHERE ia.incident_id = ${id} AND ia.tenant_id = ${tenantId} ORDER BY a.ref_no`);
      const [rca] = await tx.select().from(schema.rootCauseAnalysis).where(eq(schema.rootCauseAnalysis.incidentId, id));
      const steps = await tx.execute(sql`
        SELECT s.id, s.seq, s.title, s.instruction, ips.done_at AS "doneAt", ips.note
        FROM playbook_step s
        LEFT JOIN incident_playbook_step ips ON ips.step_id = s.id AND ips.incident_id = ${id}
        WHERE s.playbook_id = ${inc.playbookId ?? null}
        ORDER BY s.seq`);
      const actions = await tx.execute(sql`
        SELECT id, ref_no AS "refNo", title, status::text AS status, due_at AS "dueAt"
        FROM action WHERE incident_id = ${id} AND tenant_id = ${tenantId} ORDER BY ref_no`);
      return {
        ...inc,
        obligations: obligations.map((o) => ({ ...o, label: REGIME_LABEL[o.regime] })),
        timeline,
        assets: assets.rows,
        rca: rca ?? null,
        playbookSteps: inc.playbookId ? steps.rows : [],
        actions: actions.rows,
      };
    }
  }

  async create(ctx: AuthContext, dto: IncidentDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const refNo = await this.dbs.nextRefNo(tx, tenantId, 'incident', REF_PREFIX.incident);
      const [inc] = await tx
        .insert(schema.incident)
        .values({
          tenantId,
          refNo,
          title: dto.title,
          description: dto.description ?? null,
          category: dto.category,
          severity: dto.severity,
          detectedAt: dto.detectedAt ? new Date(dto.detectedAt) : new Date(),
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : null,
          reportedByUserId: ctx.userId,
          handlerPersonId: dto.handlerPersonId ?? null,
          source: dto.source,
          externalRef: dto.externalRef ?? null,
        })
        .returning();
      if (dto.assetIds.length) {
        await tx.insert(schema.incidentAsset).values(dto.assetIds.map((assetId) => ({ tenantId, incidentId: inc!.id, assetId })));
      }
      await this.addTimeline(tx, tenantId, inc!.id, ctx.userId, 'created', `Vorfall erfasst: ${dto.title}`);
      return inc;
    });
  }

  async update(ctx: AuthContext, id: string, dto: IncidentPatchDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      const set: Record<string, unknown> = {};
      for (const k of ['title', 'description', 'category', 'severity', 'handlerPersonId', 'externalRef'] as const) {
        if (dto[k] !== undefined) set[k] = dto[k];
      }
      if (dto.occurredAt !== undefined) set.occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : null;
      if (dto.status !== undefined) {
        set.status = dto.status;
        if (dto.status === 'resolved') set.resolvedAt = new Date();
        if (dto.status === 'closed') set.closedAt = new Date();
      }
      const [inc] = Object.keys(set).length
        ? await tx.update(schema.incident).set(set).where(eq(schema.incident.id, id)).returning()
        : [existing];
      if (dto.assetIds) {
        await tx.delete(schema.incidentAsset).where(eq(schema.incidentAsset.incidentId, id));
        if (dto.assetIds.length) {
          await tx.insert(schema.incidentAsset).values(dto.assetIds.map((assetId) => ({ tenantId, incidentId: id, assetId })));
        }
      }
      if (dto.status && dto.status !== existing.status) {
        await this.addTimeline(tx, tenantId, id, ctx.userId, 'status', `Status: ${existing.status} → ${dto.status}`);
      }
      return inc;
    });
  }

  // --- Meldepflichten ---------------------------------------------------------------------

  /**
   * Datenpanne bestätigen: startet die Frist nach Art. 33 DSGVO (72 Stunden ab Bekanntwerden)
   * und — bei hohem Risiko — die Benachrichtigungspflicht nach Art. 34.
   */
  async confirmBreach(ctx: AuthContext, id: string, dto: ConfirmBreachDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const inc = await this.require(tx, tenantId, id);
      const confirmedAt = dto.confirmedAt ? new Date(dto.confirmedAt) : new Date();
      if (inc.breachConfirmedAt) {
        throw new BadRequestException({
          title: 'Datenpanne ist bereits bestätigt',
          detail: 'Die Fristen laufen seit der ersten Bestätigung; ein erneutes Setzen würde sie unzulässig verlängern.',
        });
      }

      await tx
        .update(schema.incident)
        .set({ isPersonalDataBreach: true, breachConfirmedAt: confirmedAt, affectedPersons: dto.affectedPersons ?? null })
        .where(eq(schema.incident.id, id));

      for (const spec of gdprDeadlines(confirmedAt, dto.highRiskForIndividuals)) {
        await tx
          .insert(schema.reportingObligation)
          .values({ tenantId, incidentId: id, regime: spec.regime, dueAt: spec.dueAt, authority: spec.authority, note: spec.note })
          .onConflictDoNothing();
      }
      if (dto.processingActivityIds.length) {
        await tx
          .insert(schema.incidentProcessing)
          .values(dto.processingActivityIds.map((pid) => ({ incidentId: id, processingActivityId: pid })))
          .onConflictDoNothing();
      }
      await this.addTimeline(
        tx,
        tenantId,
        id,
        ctx.userId,
        'breach',
        `Als Verletzung des Schutzes personenbezogener Daten bestätigt. Frist nach Art. 33 DSGVO läuft ab ${confirmedAt.toISOString()}.`,
      );
      return this.loadDetail(tx, tenantId, id);
    });
  }

  /** Vorfall als erheblich im Sinne von NIS2 einstufen: startet 24-Stunden-, 72-Stunden- und Monatsfrist. */
  async markSignificant(ctx: AuthContext, id: string, dto: MarkSignificantDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const inc = await this.require(tx, tenantId, id);
      if (inc.nis2SignificantAt) {
        throw new BadRequestException({
          title: 'Vorfall ist bereits als erheblich eingestuft',
          detail: 'Die NIS2-Fristen laufen ab der ersten Einstufung.',
        });
      }
      const knownAt = dto.knownAt ? new Date(dto.knownAt) : new Date();
      await tx
        .update(schema.incident)
        .set({ nis2Relevant: true, nis2SignificantAt: knownAt, crossBorder: dto.crossBorder })
        .where(eq(schema.incident.id, id));

      for (const spec of nis2Deadlines(knownAt)) {
        await tx
          .insert(schema.reportingObligation)
          .values({ tenantId, incidentId: id, regime: spec.regime, dueAt: spec.dueAt, authority: spec.authority, note: spec.note })
          .onConflictDoNothing();
      }
      await this.addTimeline(
        tx,
        tenantId,
        id,
        ctx.userId,
        'nis2',
        `Als erheblicher Sicherheitsvorfall nach NIS2 eingestuft. Frühwarnung binnen 24 Stunden ab ${knownAt.toISOString()}.`,
      );
      return this.loadDetail(tx, tenantId, id);
    });
  }

  /**
   * Meldung als abgesetzt vermerken. Beim Absetzen der 72-Stunden-Meldung wird die Frist für den
   * Abschlussbericht auf den tatsächlichen Meldezeitpunkt + 1 Monat neu gerechnet (Art. 23 Abs. 4 d).
   */
  async fulfilObligation(ctx: AuthContext, incidentId: string, obligationId: string, dto: FulfilObligationDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.require(tx, tenantId, incidentId);
      const [ob] = await tx
        .select()
        .from(schema.reportingObligation)
        .where(and(eq(schema.reportingObligation.id, obligationId), eq(schema.reportingObligation.incidentId, incidentId)));
      if (!ob) throw new NotFoundException({ title: 'Meldepflicht nicht gefunden' });

      const fulfilledAt = dto.fulfilledAt ? new Date(dto.fulfilledAt) : new Date();
      await tx
        .update(schema.reportingObligation)
        .set({ fulfilledAt, reference: dto.reference ?? null, note: dto.note ?? ob.note })
        .where(eq(schema.reportingObligation.id, obligationId));

      if (ob.regime === 'nis2_notification_72h') {
        await tx
          .update(schema.reportingObligation)
          .set({ dueAt: finalReportDueFrom(fulfilledAt) })
          .where(
            and(
              eq(schema.reportingObligation.incidentId, incidentId),
              eq(schema.reportingObligation.regime, 'nis2_final_1m'),
              isNull(schema.reportingObligation.fulfilledAt),
            ),
          );
      }
      await this.addTimeline(
        tx,
        tenantId,
        incidentId,
        ctx.userId,
        'report',
        `${REGIME_LABEL[ob.regime]} abgesetzt${dto.reference ? ` (Az. ${dto.reference})` : ''}.`,
      );
      return this.loadDetail(tx, tenantId, incidentId);
    });
  }

  /** Alle offenen Meldefristen des Mandanten — Grundlage für Dashboard und Erinnerungen. */
  async openObligations(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT ro.id, ro.regime::text AS regime, ro.due_at AS "dueAt", ro.authority,
               i.id AS "incidentId", i.ref_no AS "incidentRefNo", i.title AS "incidentTitle", i.severity::text AS severity,
               (ro.due_at < now()) AS overdue,
               EXTRACT(EPOCH FROM (ro.due_at - now())) / 3600 AS "hoursLeft"
        FROM reporting_obligation ro
        JOIN incident i ON i.id = ro.incident_id
        WHERE ro.tenant_id = ${tenantId} AND ro.fulfilled_at IS NULL AND ro.due_at IS NOT NULL
        ORDER BY ro.due_at`);
      return (res.rows as Record<string, unknown>[]).map((r) => ({ ...r, label: REGIME_LABEL[r.regime as never] }));
    });
  }

  // --- Zeitleiste, Ursachenanalyse, Playbook ----------------------------------------------

  async addTimelineEntry(ctx: AuthContext, id: string, dto: TimelineEntryDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.require(tx, tenantId, id);
      const [row] = await tx
        .insert(schema.incidentTimeline)
        .values({
          tenantId,
          incidentId: id,
          at: dto.at ? new Date(dto.at) : new Date(),
          actorUserId: ctx.userId,
          kind: dto.kind,
          text: dto.text,
        })
        .returning();
      return row;
    });
  }

  /** Ursachenanalyse nach ISO 27001 Kap. 10.1 — Voraussetzung für wirksame Korrekturmaßnahmen. */
  async upsertRca(ctx: AuthContext, id: string, dto: RcaDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.require(tx, tenantId, id);
      const values = {
        tenantId,
        incidentId: id,
        method: dto.method,
        problemStatement: dto.problemStatement ?? null,
        analysis: { whys: dto.whys },
        rootCause: dto.rootCause ?? null,
        conclusions: dto.conclusions ?? null,
        performedByUserId: ctx.userId,
        performedAt: new Date(),
      };
      const [row] = await tx
        .insert(schema.rootCauseAnalysis)
        .values(values)
        .onConflictDoUpdate({ target: schema.rootCauseAnalysis.incidentId, set: { ...values, updatedAt: new Date() } })
        .returning();
      return row;
    });
  }

  /** Playbook aktivieren: erzeugt die abhakbare Checkliste für diesen Vorfall. */
  async activatePlaybook(ctx: AuthContext, id: string, playbookId: string) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.require(tx, tenantId, id);
      const [pb] = await tx
        .select({ id: schema.playbook.id, title: schema.playbook.title })
        .from(schema.playbook)
        .where(and(eq(schema.playbook.id, playbookId), eq(schema.playbook.tenantId, tenantId)));
      if (!pb) throw new NotFoundException({ title: 'Playbook nicht gefunden' });
      await tx.update(schema.incident).set({ playbookId }).where(eq(schema.incident.id, id));
      await this.addTimeline(tx, tenantId, id, ctx.userId, 'playbook', `Playbook aktiviert: ${pb.title}`);
      return this.loadDetail(tx, tenantId, id);
    });
  }

  async toggleStep(ctx: AuthContext, id: string, stepId: string, done: boolean, note?: string) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.require(tx, tenantId, id);
      const [step] = await tx.select({ title: schema.playbookStep.title }).from(schema.playbookStep).where(eq(schema.playbookStep.id, stepId));
      if (!step) throw new NotFoundException({ title: 'Playbook-Schritt nicht gefunden' });
      await tx
        .insert(schema.incidentPlaybookStep)
        .values({
          tenantId,
          incidentId: id,
          stepId,
          doneAt: done ? new Date() : null,
          doneByUserId: done ? ctx.userId : null,
          note: note ?? null,
        })
        .onConflictDoUpdate({
          target: [schema.incidentPlaybookStep.incidentId, schema.incidentPlaybookStep.stepId],
          set: { doneAt: done ? new Date() : null, doneByUserId: done ? ctx.userId : null, note: note ?? null },
        });
      if (done) await this.addTimeline(tx, tenantId, id, ctx.userId, 'step', `Schritt erledigt: ${step.title}`);
      return { stepId, done };
    });
  }

  private async addTimeline(tx: TenantTx, tenantId: string, incidentId: string, userId: string, kind: string, text: string) {
    await tx.insert(schema.incidentTimeline).values({ tenantId, incidentId, actorUserId: userId, kind, text });
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [i] = await tx.select().from(schema.incident).where(and(eq(schema.incident.id, id), eq(schema.incident.tenantId, tenantId)));
    if (!i) throw new NotFoundException({ title: 'Vorfall nicht gefunden' });
    return i;
  }
}
