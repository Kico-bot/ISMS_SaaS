import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import {
  type AuditDto,
  type AuditPatchDto,
  type AuthContext,
  type ListQuery,
  REF_PREFIX,
} from '@isms/shared';
import { and, count, eq, ilike, or, sql } from 'drizzle-orm';
import { DbService, type TenantTx } from '../../kernel/db/db.service';
import { requireTenantFile } from '../files/file-ref';

/**
 * Auditprogramm nach ISO 27001 Kap. 9.2. Ein Audit hält fest, welche Anforderungen es
 * abgedeckt hat — nur dadurch lässt sich die Programmabdeckung über einen Zyklus belegen.
 */
@Injectable()
export class AuditsService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string, q: ListQuery & { status?: string; kind?: string }) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const where = and(
        eq(schema.audit.tenantId, tenantId),
        q.status ? eq(schema.audit.status, q.status as never) : undefined,
        q.kind ? eq(schema.audit.kind, q.kind as never) : undefined,
        q.q ? or(ilike(schema.audit.title, `%${q.q}%`), ilike(schema.audit.refNo, `%${q.q}%`)) : undefined,
      );
      const [total] = await tx.select({ n: count() }).from(schema.audit).where(where);
      const items = await tx.execute(sql`
        SELECT a.id, a.ref_no AS "refNo", a.title, a.kind::text AS kind, a.status::text AS status,
               a.planned_from AS "plannedFrom", a.planned_to AS "plannedTo", a.scope,
               f.key AS "frameworkKey", u.display_name AS "leadAuditorName",
               (SELECT count(*)::int FROM audit_requirement ar WHERE ar.audit_id = a.id) AS "scopeSize",
               (SELECT count(*)::int FROM finding fi WHERE fi.audit_id = a.id) AS "findings",
               (SELECT count(*)::int FROM finding fi WHERE fi.audit_id = a.id AND fi.severity = 'major') AS "majorFindings",
               (SELECT count(*)::int FROM finding fi WHERE fi.audit_id = a.id AND fi.status IN ('open','in_progress')) AS "openFindings"
        FROM "audit" a
        LEFT JOIN framework f ON f.id = a.framework_id
        LEFT JOIN "user" u ON u.id = a.lead_auditor_user_id
        WHERE a.tenant_id = ${tenantId}
          ${q.status ? sql`AND a.status = ${q.status}::audit_status` : sql``}
          ${q.kind ? sql`AND a.kind = ${q.kind}::audit_kind` : sql``}
          ${q.q ? sql`AND (a.title ILIKE ${'%' + q.q + '%'} OR a.ref_no ILIKE ${'%' + q.q + '%'})` : sql``}
        ORDER BY a.planned_from DESC NULLS LAST, a.ref_no DESC
        LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}`);
      return { items: items.rows, total: total?.n ?? 0, page: q.page, size: q.size };
    });
  }

  async get(tenantId: string, id: string) {
    return this.dbs.tenant(tenantId, (tx) => this.loadDetail(tx, tenantId, id));
  }

  private async loadDetail(tx: TenantTx, tenantId: string, id: string) {
    const a = await this.require(tx, tenantId, id);
    const scope = await tx.execute(sql`
      SELECT r.id, r.ref_code AS "refCode", r.title, f.key AS framework
      FROM audit_requirement ar
      JOIN requirement r ON r.id = ar.requirement_id
      JOIN framework f ON f.id = r.framework_id
      WHERE ar.audit_id = ${id}
      ORDER BY f.key, r.sort_order`);
    const findings = await tx.execute(sql`
      SELECT fi.id, fi.ref_no AS "refNo", fi.title, fi.severity::text AS severity, fi.status::text AS status,
             fi.due_at AS "dueAt", r.ref_code AS "refCode",
             (SELECT count(*)::int FROM "action" ac WHERE ac.finding_id = fi.id) AS "actionCount"
      FROM finding fi
      LEFT JOIN requirement r ON r.id = fi.requirement_id
      WHERE fi.audit_id = ${id} AND fi.tenant_id = ${tenantId}
      ORDER BY fi.severity DESC, fi.ref_no`);
    const report = a.reportFileId
      ? (
          await tx.execute(sql`
            SELECT id, filename, mime, size_bytes AS "sizeBytes" FROM file WHERE id = ${a.reportFileId}`)
        ).rows[0]
      : null;
    return { ...a, reportFile: report ?? null, scope: scope.rows, findings: findings.rows };
  }

  async create(ctx: AuthContext, dto: AuditDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const frameworkId = dto.frameworkKey ? await this.frameworkId(tx, dto.frameworkKey) : null;
      if (dto.reportFileId) await requireTenantFile(tx, tenantId, dto.reportFileId);
      const refNo = await this.dbs.nextRefNo(tx, tenantId, 'audit', REF_PREFIX.audit);
      const [a] = await tx
        .insert(schema.audit)
        .values({
          tenantId,
          refNo,
          title: dto.title,
          kind: dto.kind,
          frameworkId,
          scope: dto.scope ?? null,
          plannedFrom: dto.plannedFrom ?? null,
          plannedTo: dto.plannedTo ?? null,
          leadAuditorUserId: dto.leadAuditorUserId ?? null,
          reportFileId: dto.reportFileId ?? null,
        })
        .returning();
      if (dto.requirementIds.length) await this.setScope(tx, a!.id, dto.requirementIds);
      return this.loadDetail(tx, tenantId, a!.id);
    });
  }

  async update(ctx: AuthContext, id: string, dto: AuditPatchDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      const set: Record<string, unknown> = {};
      for (const k of [
        'title',
        'kind',
        'scope',
        'plannedFrom',
        'plannedTo',
        'leadAuditorUserId',
        'reportFileId',
        'status',
      ] as const) {
        if (dto[k] !== undefined) set[k] = dto[k];
      }
      if (dto.reportFileId) await requireTenantFile(tx, tenantId, dto.reportFileId);
      if (dto.frameworkKey !== undefined)
        set.frameworkId = dto.frameworkKey ? await this.frameworkId(tx, dto.frameworkKey) : null;
      // Ein berichtetes Audit lässt sich nicht nachträglich wieder öffnen — der Bericht ist raus.
      if (dto.status && existing.status === 'closed' && dto.status !== 'closed') {
        throw new BadRequestException({
          title: 'Audit ist abgeschlossen',
          detail:
            'Ein abgeschlossenes Audit lässt sich nicht wieder öffnen. Offene Punkte gehören in Feststellungen und KVP-Maßnahmen.',
        });
      }
      /*
       * Kap. 9.2.2 f) verlangt den Auditbericht als dokumentierte Information, und erst ein
       * berichtetes Audit zählt auf die Programmabdeckung ein (View `v_audit_coverage`).
       * Ohne hinterlegten Bericht wäre diese Abdeckung eine Behauptung.
       */
      const reportFileId = dto.reportFileId !== undefined ? dto.reportFileId : existing.reportFileId;
      if (dto.status === 'reported' && !reportFileId) {
        throw new BadRequestException({
          title: 'Der Auditbericht fehlt',
          detail:
            'Ein Audit gilt erst als berichtet, wenn der Bericht hinterlegt ist (ISO 27001 Kap. 9.2.2 f). Erst dann zählt es auf die Abdeckung des Auditprogramms ein.',
        });
      }
      if (Object.keys(set).length) await tx.update(schema.audit).set(set).where(eq(schema.audit.id, id));
      if (dto.requirementIds !== undefined) await this.setScope(tx, id, dto.requirementIds);
      return this.loadDetail(tx, tenantId, id);
    });
  }

  /**
   * Abdeckung des Auditprogramms je Kapitel: wann wurde zuletzt auditiert, was steht noch aus.
   * `cycleMonths` bildet den Zertifizierungszyklus ab (Standard 36 Monate).
   */
  async programme(tenantId: string, frameworkKey: string, cycleMonths = 36) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT c.group_ref_code AS "groupRefCode", c.group_title AS "groupTitle",
               count(*)::int AS total,
               count(*) FILTER (WHERE c.last_audited_on >= (current_date - make_interval(months => ${cycleMonths})))::int AS "auditedInCycle",
               max(c.last_audited_on) AS "lastAuditedOn",
               sum(c.open_findings)::int AS "openFindings"
        FROM v_audit_coverage c
        JOIN framework f ON f.id = c.framework_id
        WHERE c.tenant_id = ${tenantId} AND f.key = ${frameworkKey}
        GROUP BY c.group_ref_code, c.group_title
        ORDER BY c.group_ref_code`);
      return res.rows;
    });
  }

  private async setScope(tx: TenantTx, auditId: string, requirementIds: string[]) {
    await tx.delete(schema.auditRequirement).where(eq(schema.auditRequirement.auditId, auditId));
    if (requirementIds.length) {
      await tx
        .insert(schema.auditRequirement)
        .values(requirementIds.map((requirementId) => ({ auditId, requirementId })));
    }
  }

  private async frameworkId(tx: TenantTx, key: string) {
    const [f] = await tx
      .select({ id: schema.framework.id })
      .from(schema.framework)
      .where(eq(schema.framework.key, key));
    if (!f) throw new BadRequestException({ title: `Framework ${key} ist nicht bekannt` });
    return f.id;
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [a] = await tx
      .select()
      .from(schema.audit)
      .where(and(eq(schema.audit.id, id), eq(schema.audit.tenantId, tenantId)));
    if (!a) throw new NotFoundException({ title: 'Audit nicht gefunden' });
    return a;
  }
}
