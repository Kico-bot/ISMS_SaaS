import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import {
  type AuthContext,
  type FindingDto,
  type FindingPatchDto,
  type ListQuery,
  REF_PREFIX,
} from '@isms/shared';
import { and, count, eq, ilike, or, sql } from 'drizzle-orm';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/**
 * Feststellungen und Nichtkonformitäten (ISO 27001 Kap. 9.2 / 10.2).
 *
 * Zwei Regeln tragen das Modul:
 *  - Eine Nichtkonformität wird nicht geschlossen, ohne dass eine Korrekturmaßnahme existiert
 *    (Kap. 10.2 a/b verlangt Korrektur *und* Ursachenbehandlung).
 *  - Die Schließung bestätigt nicht, wer sie behoben hat — Vier-Augen-Prinzip, zusätzlich
 *    durch den Trigger `trg_finding_verify_sod` abgesichert.
 */
@Injectable()
export class FindingsService {
  constructor(private readonly dbs: DbService) {}

  async list(
    tenantId: string,
    q: ListQuery & { status?: string; severity?: string; auditId?: string; open?: boolean },
  ) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const where = and(
        eq(schema.finding.tenantId, tenantId),
        q.status ? eq(schema.finding.status, q.status as never) : undefined,
        q.severity ? eq(schema.finding.severity, q.severity as never) : undefined,
        q.auditId ? eq(schema.finding.auditId, q.auditId) : undefined,
        q.q
          ? or(ilike(schema.finding.title, `%${q.q}%`), ilike(schema.finding.refNo, `%${q.q}%`))
          : undefined,
      );
      const [total] = await tx.select({ n: count() }).from(schema.finding).where(where);
      const items = await tx.execute(sql`
        SELECT fi.id, fi.ref_no AS "refNo", fi.title, fi.severity::text AS severity, fi.status::text AS status,
               fi.source::text AS source, fi.due_at AS "dueAt", fi.closed_at AS "closedAt", fi.verified_at AS "verifiedAt",
               (fi.due_at < current_date AND fi.status IN ('open','in_progress')) AS overdue,
               au.id AS "auditId", au.ref_no AS "auditRefNo", au.title AS "auditTitle",
               r.ref_code AS "refCode", fw.key AS framework,
               m.ref_no AS "measureRefNo", m.title AS "measureTitle",
               u.display_name AS "raisedByName",
               (SELECT count(*)::int FROM "action" ac WHERE ac.finding_id = fi.id) AS "actionCount",
               (SELECT count(*)::int FROM "action" ac WHERE ac.finding_id = fi.id AND ac.status IN ('done','verified')) AS "actionsDone"
        FROM finding fi
        LEFT JOIN "audit" au ON au.id = fi.audit_id
        LEFT JOIN requirement r ON r.id = fi.requirement_id
        LEFT JOIN framework fw ON fw.id = r.framework_id
        LEFT JOIN measure m ON m.id = fi.measure_id
        LEFT JOIN "user" u ON u.id = fi.raised_by_user_id
        WHERE fi.tenant_id = ${tenantId}
          ${q.status ? sql`AND fi.status = ${q.status}::finding_status` : sql``}
          ${q.severity ? sql`AND fi.severity = ${q.severity}::finding_severity` : sql``}
          ${q.auditId ? sql`AND fi.audit_id = ${q.auditId}::uuid` : sql``}
          ${q.open ? sql`AND fi.status IN ('open','in_progress')` : sql``}
          ${q.q ? sql`AND (fi.title ILIKE ${'%' + q.q + '%'} OR fi.ref_no ILIKE ${'%' + q.q + '%'})` : sql``}
        ORDER BY (fi.status IN ('closed','verified')), fi.severity DESC, fi.due_at NULLS LAST, fi.ref_no
        LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}`);
      return { items: items.rows, total: total?.n ?? 0, page: q.page, size: q.size };
    });
  }

  async get(tenantId: string, id: string) {
    return this.dbs.tenant(tenantId, (tx) => this.loadDetail(tx, tenantId, id));
  }

  private async loadDetail(tx: TenantTx, tenantId: string, id: string) {
    const f = await this.require(tx, tenantId, id);
    const actions = await tx.execute(sql`
      SELECT ac.id, ac.ref_no AS "refNo", ac.title, ac.kind::text AS kind, ac.status::text AS status,
             ac.due_at AS "dueAt", p.name AS "ownerName"
      FROM "action" ac
      LEFT JOIN person p ON p.id = ac.owner_person_id
      WHERE ac.finding_id = ${id} AND ac.tenant_id = ${tenantId}
      ORDER BY ac.ref_no`);
    const context = await tx.execute(sql`
      SELECT au.ref_no AS "auditRefNo", au.title AS "auditTitle",
             r.ref_code AS "refCode", r.title AS "requirementTitle", fw.key AS framework,
             m.ref_no AS "measureRefNo", m.title AS "measureTitle",
             raiser.display_name AS "raisedByName", verifier.display_name AS "verifiedByName"
      FROM finding fi
      LEFT JOIN "audit" au ON au.id = fi.audit_id
      LEFT JOIN requirement r ON r.id = fi.requirement_id
      LEFT JOIN framework fw ON fw.id = r.framework_id
      LEFT JOIN measure m ON m.id = fi.measure_id
      LEFT JOIN "user" raiser ON raiser.id = fi.raised_by_user_id
      LEFT JOIN "user" verifier ON verifier.id = fi.verified_by_user_id
      WHERE fi.id = ${id}`);
    return { ...f, ...(context.rows[0] ?? {}), actions: actions.rows };
  }

  async create(ctx: AuthContext, dto: FindingDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const refNo = await this.dbs.nextRefNo(tx, tenantId, 'finding', REF_PREFIX.finding);
      const [f] = await tx
        .insert(schema.finding)
        .values({
          tenantId,
          refNo,
          title: dto.title,
          description: dto.description ?? null,
          source: dto.source,
          severity: dto.severity,
          auditId: dto.auditId ?? null,
          requirementId: dto.requirementId ?? null,
          measureId: dto.measureId ?? null,
          dueAt: dto.dueAt ?? null,
          raisedByUserId: ctx.userId,
        })
        .returning();
      return this.loadDetail(tx, tenantId, f!.id);
    });
  }

  async update(ctx: AuthContext, id: string, dto: FindingPatchDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      if (existing.status === 'verified') {
        throw new ConflictException({
          title: 'Feststellung ist bestätigt geschlossen',
          detail:
            'Eine bestätigte Feststellung bleibt unverändert. Neue Erkenntnisse gehören in eine neue Feststellung.',
        });
      }
      const set: Record<string, unknown> = {};
      for (const k of [
        'title',
        'description',
        'source',
        'severity',
        'auditId',
        'requirementId',
        'measureId',
        'dueAt',
      ] as const) {
        if (dto[k] !== undefined) set[k] = dto[k];
      }
      if (dto.status !== undefined) {
        if (dto.status === 'verified') {
          throw new BadRequestException({
            title: 'Bestätigung erfolgt separat',
            detail: 'Den Status „bestätigt“ setzt nur die Bestätigung durch eine andere Person mit Nachweis.',
          });
        }
        if (dto.status === 'closed')
          await this.assertClosable(tx, tenantId, id, (dto.severity ?? existing.severity) as string);
        set.status = dto.status;
        set.closedAt = dto.status === 'closed' ? (existing.closedAt ?? new Date()) : null;
      }
      if (Object.keys(set).length) await tx.update(schema.finding).set(set).where(eq(schema.finding.id, id));
      return this.loadDetail(tx, tenantId, id);
    });
  }

  /**
   * Schließung bestätigen. Setzt eine geschlossene Feststellung voraus und darf nicht durch
   * die Person erfolgen, die die Korrekturmaßnahmen verantwortet.
   */
  async verify(ctx: AuthContext, id: string, result: string) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      if (existing.status !== 'closed') {
        throw new BadRequestException({
          title: 'Feststellung ist noch nicht geschlossen',
          detail:
            'Bestätigt wird erst, nachdem die Korrektur umgesetzt und die Feststellung geschlossen wurde.',
        });
      }
      const owners = await tx.execute(sql`
        SELECT DISTINCT p.user_id AS "userId", p.name
        FROM "action" ac JOIN person p ON p.id = ac.owner_person_id
        WHERE ac.finding_id = ${id} AND ac.tenant_id = ${tenantId} AND p.user_id IS NOT NULL`);
      const conflict = (owners.rows as { userId: string; name: string }[]).find(
        (o) => o.userId === ctx.userId,
      );
      if (conflict) {
        throw new ConflictException({
          type: 'https://isms.example/problems/sod-violation',
          title: 'Funktionstrennung verletzt',
          detail: `${conflict.name} verantwortet die Korrekturmaßnahme und kann deren Wirksamkeit nicht selbst bestätigen.`,
        });
      }
      await tx
        .update(schema.finding)
        .set({
          status: 'verified',
          verifiedByUserId: ctx.userId,
          verifiedAt: new Date(),
          description: existing.description
            ? `${existing.description}\n\nNachweis der Schließung: ${result}`
            : `Nachweis der Schließung: ${result}`,
        })
        .where(eq(schema.finding.id, id));
      return this.loadDetail(tx, tenantId, id);
    });
  }

  /** Kap. 10.2: eine Nichtkonformität braucht eine Korrekturmaßnahme, bevor sie geschlossen wird. */
  private async assertClosable(tx: TenantTx, tenantId: string, id: string, severity: string) {
    if (severity === 'observation') return; // Beobachtungen sind keine Nichtkonformitäten
    const [row] = await tx
      .select({ n: count() })
      .from(schema.action)
      .where(and(eq(schema.action.findingId, id), eq(schema.action.tenantId, tenantId)));
    if ((row?.n ?? 0) === 0) {
      throw new BadRequestException({
        title: 'Keine Korrekturmaßnahme hinterlegt',
        detail:
          'Eine Abweichung lässt sich erst schließen, wenn mindestens eine Verbesserungsmaßnahme sie behandelt. ISO 27001 Kap. 10.2 verlangt, den Fehler zu beheben und seine Ursache abzustellen.',
      });
    }
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [f] = await tx
      .select()
      .from(schema.finding)
      .where(and(eq(schema.finding.id, id), eq(schema.finding.tenantId, tenantId)));
    if (!f) throw new NotFoundException({ title: 'Feststellung nicht gefunden' });
    return f;
  }
}
