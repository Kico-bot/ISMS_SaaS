import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import { type ActionDto, type ActionPatchDto, type AuthContext, type ListQuery, P, REF_PREFIX } from '@isms/shared';
import { and, count, eq, ilike, or, sql } from 'drizzle-orm';
import { assertCan } from '../../kernel/auth/policy';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/**
 * KVP-Register (Korrektur- und Verbesserungsmaßnahmen, ISO 27001 Kap. 10).
 * Jede Maßnahme kennt höchstens einen Auslöser: Feststellung, Risiko, Vorfall oder Management-Review.
 */
@Injectable()
export class ActionsService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string, q: ListQuery & { status?: string; kind?: string; overdue?: boolean }) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const where = and(
        eq(schema.action.tenantId, tenantId),
        q.status ? eq(schema.action.status, q.status as never) : undefined,
        q.kind ? eq(schema.action.kind, q.kind as never) : undefined,
        q.q ? or(ilike(schema.action.title, `%${q.q}%`), ilike(schema.action.refNo, `%${q.q}%`)) : undefined,
      );
      const [total] = await tx.select({ n: count() }).from(schema.action).where(where);
      const items = await tx.execute(sql`
        SELECT a.id, a.ref_no AS "refNo", a.title, a.kind::text AS kind, a.status::text AS status,
               a.due_at AS "dueAt", a.completed_at AS "completedAt", a.verified_at AS "verifiedAt",
               p.name AS "ownerName", a.owner_person_id AS "ownerPersonId",
               (a.due_at < current_date AND a.status NOT IN ('done','verified','rejected')) AS overdue,
               CASE
                 WHEN a.finding_id IS NOT NULL THEN json_build_object('kind','finding','id',a.finding_id,'label',f.ref_no)
                 WHEN a.risk_id IS NOT NULL THEN json_build_object('kind','risk','id',a.risk_id,'label',r.ref_no)
                 WHEN a.incident_id IS NOT NULL THEN json_build_object('kind','incident','id',a.incident_id,'label',i.ref_no)
                 WHEN a.review_id IS NOT NULL THEN json_build_object('kind','review','id',a.review_id,'label','Management-Review')
               END AS origin
        FROM action a
        LEFT JOIN person p ON p.id = a.owner_person_id
        LEFT JOIN finding f ON f.id = a.finding_id
        LEFT JOIN risk r ON r.id = a.risk_id
        LEFT JOIN incident i ON i.id = a.incident_id
        WHERE a.tenant_id = ${tenantId}
          ${q.status ? sql`AND a.status = ${q.status}::action_status` : sql``}
          ${q.kind ? sql`AND a.kind = ${q.kind}::action_kind` : sql``}
          ${q.overdue ? sql`AND a.due_at < current_date AND a.status NOT IN ('done','verified','rejected')` : sql``}
          ${q.q ? sql`AND (a.title ILIKE ${'%' + q.q + '%'} OR a.ref_no ILIKE ${'%' + q.q + '%'})` : sql``}
        ORDER BY (a.status IN ('done','verified','rejected')), a.due_at NULLS LAST, a.ref_no
        LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}`);
      return { items: items.rows, total: total?.n ?? 0, page: q.page, size: q.size };
    });
  }

  async create(ctx: AuthContext, dto: ActionDto) {
    const tenantId = ctx.tenantId!;
    assertCan(ctx, P.ACTION_WRITE, { ownerPersonId: dto.ownerPersonId ?? ctx.personId });
    const origins = [dto.findingId, dto.riskId, dto.incidentId, dto.reviewId].filter(Boolean);
    if (origins.length > 1) {
      throw new BadRequestException({
        title: 'Nur ein Auslöser zulässig',
        detail: 'Eine KVP-Maßnahme hat genau eine Herkunft — sonst ist die Wirksamkeitsprüfung nicht zuordenbar.',
      });
    }
    return this.dbs.tenant(tenantId, async (tx) => {
      const refNo = await this.dbs.nextRefNo(tx, tenantId, 'action', REF_PREFIX.action);
      const [a] = await tx
        .insert(schema.action)
        .values({
          tenantId,
          refNo,
          title: dto.title,
          description: dto.description ?? null,
          kind: dto.kind,
          ownerPersonId: dto.ownerPersonId ?? null,
          dueAt: dto.dueAt ?? null,
          findingId: dto.findingId ?? null,
          riskId: dto.riskId ?? null,
          incidentId: dto.incidentId ?? null,
          reviewId: dto.reviewId ?? null,
        })
        .returning();
      return a;
    });
  }

  async update(ctx: AuthContext, id: string, dto: ActionPatchDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      assertCan(ctx, P.ACTION_WRITE, { ownerPersonId: existing.ownerPersonId });
      const set: Record<string, unknown> = {};
      for (const k of ['title', 'description', 'kind', 'ownerPersonId', 'dueAt', 'effectivenessCheckAt', 'effectivenessResult'] as const) {
        if (dto[k] !== undefined) set[k] = dto[k];
      }
      if (dto.status !== undefined) {
        set.status = dto.status;
        set.completedAt = dto.status === 'done' || dto.status === 'verified' ? (existing.completedAt ?? new Date()) : null;
      }
      const [a] = Object.keys(set).length ? await tx.update(schema.action).set(set).where(eq(schema.action.id, id)).returning() : [existing];
      return a;
    });
  }

  /**
   * Wirksamkeit bestätigen — Vier-Augen-Prinzip: nicht durch die verantwortliche Person selbst.
   * Der DB-Trigger sichert das zusätzlich ab.
   */
  async verify(ctx: AuthContext, id: string, result: string) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      if (existing.status !== 'done' && existing.status !== 'verified') {
        throw new BadRequestException({
          title: 'Maßnahme ist noch nicht umgesetzt',
          detail: 'Wirksamkeit lässt sich erst nach Abschluss der Umsetzung beurteilen.',
        });
      }
      const [a] = await tx
        .update(schema.action)
        .set({ status: 'verified', verifiedByUserId: ctx.userId, verifiedAt: new Date(), effectivenessResult: result })
        .where(eq(schema.action.id, id))
        .returning();
      return a;
    });
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [a] = await tx.select().from(schema.action).where(and(eq(schema.action.id, id), eq(schema.action.tenantId, tenantId)));
    if (!a) throw new NotFoundException({ title: 'KVP-Maßnahme nicht gefunden' });
    return a;
  }
}
