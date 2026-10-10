import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import {
  type AuthContext,
  type BcExerciseDto,
  type ContinuityPlanDto,
  type ContinuityPlanPatchDto,
  type ContinuityStepDto,
  P,
} from '@isms/shared';
import { and, eq, sql } from 'drizzle-orm';
import { addMonths } from '../incidents/reporting-deadlines';
import { assertCan } from '../../kernel/auth/policy';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/**
 * Notfallpläne und Übungen (ISO 27001 A.5.29/A.5.30, ISO 22301 Kap. 8.4/8.5).
 *
 * Ein Plan, der nie geübt wurde, ist eine Behauptung. Deshalb führt jede Übung die nächste
 * Fälligkeit mit, und ein ungeübter Plan lässt sich nicht aktiv setzen.
 */
@Injectable()
export class PlansService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT cp.id, cp.title, cp.status::text AS status, cp.activation_criteria AS "activationCriteria",
               cp.test_interval_months AS "testIntervalMonths",
               cp.last_test_at AS "lastTestAt", cp.next_test_at AS "nextTestAt",
               (cp.next_test_at < current_date) AS "testOverdue",
               p.id AS "processId", p.name AS "processName", b.rto_hours AS "rtoHours",
               (SELECT count(*)::int FROM continuity_plan_step s WHERE s.plan_id = cp.id) AS "stepCount",
               (SELECT count(*)::int FROM bc_exercise e WHERE e.plan_id = cp.id) AS "exerciseCount"
        FROM continuity_plan cp
        JOIN bia b ON b.id = cp.bia_id
        JOIN business_process p ON p.id = b.process_id
        WHERE cp.tenant_id = ${tenantId}
        ORDER BY (cp.next_test_at < current_date) DESC NULLS LAST, cp.next_test_at NULLS FIRST, cp.title`);
      return res.rows;
    });
  }

  async get(tenantId: string, id: string) {
    return this.dbs.tenant(tenantId, (tx) => this.loadDetail(tx, tenantId, id));
  }

  private async loadDetail(tx: TenantTx, tenantId: string, id: string) {
    const plan = await this.require(tx, tenantId, id);
    const [context] = (
      await tx.execute(sql`
        SELECT p.id AS "processId", p.name AS "processName", b.rto_hours AS "rtoHours", b.rpo_hours AS "rpoHours", b.mbco
        FROM continuity_plan cp JOIN bia b ON b.id = cp.bia_id JOIN business_process p ON p.id = b.process_id
        WHERE cp.id = ${id}`)
    ).rows as Record<string, unknown>[];
    const steps = await tx.execute(sql`
      SELECT s.id, s.seq, s.phase, s.title, s.instruction, s.responsible_person_id AS "responsiblePersonId",
             pe.name AS "responsibleName"
      FROM continuity_plan_step s LEFT JOIN person pe ON pe.id = s.responsible_person_id
      WHERE s.plan_id = ${id} ORDER BY s.seq`);
    const exercises = await tx.execute(sql`
      SELECT id, held_at AS "heldAt", kind, result, lessons_learned AS "lessonsLearned"
      FROM bc_exercise WHERE plan_id = ${id} AND tenant_id = ${tenantId}
      ORDER BY held_at DESC`);
    return { ...plan, ...(context ?? {}), steps: steps.rows, exercises: exercises.rows };
  }

  async create(ctx: AuthContext, processId: string, dto: ContinuityPlanDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const [process] = await tx
        .select()
        .from(schema.businessProcess)
        .where(and(eq(schema.businessProcess.id, processId), eq(schema.businessProcess.tenantId, tenantId)));
      if (!process) throw new NotFoundException({ title: 'Geschäftsprozess nicht gefunden' });
      assertCan(ctx, P.CONTINUITY_WRITE, process);

      const [bia] = await tx
        .select({ id: schema.bia.id })
        .from(schema.bia)
        .where(and(eq(schema.bia.processId, processId), eq(schema.bia.tenantId, tenantId)));
      if (!bia) {
        throw new BadRequestException({
          title: 'Keine BIA vorhanden',
          detail:
            'Ein Notfallplan braucht zuerst die Business Impact Analyse (BIA) des Prozesses, sonst fehlt ihm das Ziel.',
        });
      }
      const [plan] = await tx
        .insert(schema.continuityPlan)
        .values({
          tenantId,
          biaId: bia.id,
          title: dto.title,
          activationCriteria: dto.activationCriteria ?? null,
          strategy: dto.strategy ?? null,
          testIntervalMonths: dto.testIntervalMonths,
        })
        .returning();
      return this.loadDetail(tx, tenantId, plan!.id);
    });
  }

  async update(ctx: AuthContext, id: string, dto: ContinuityPlanPatchDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.requireWritable(tx, ctx, id);
      if (dto.status === 'active' && !existing.lastTestAt) {
        throw new BadRequestException({
          title: 'Plan wurde nie geübt',
          detail:
            'Ein Notfallplan wird erst nach der ersten Übung aktiv. Vorher ist nicht belegt, dass er funktioniert.',
        });
      }
      const set: Record<string, unknown> = {};
      for (const k of ['title', 'activationCriteria', 'strategy', 'status', 'testIntervalMonths'] as const) {
        if (dto[k] !== undefined) set[k] = dto[k];
      }
      if (Object.keys(set).length)
        await tx.update(schema.continuityPlan).set(set).where(eq(schema.continuityPlan.id, id));
      return this.loadDetail(tx, tenantId, id);
    });
  }

  /** Schritt anlegen oder an derselben Position ersetzen — die Reihenfolge trägt den Plan. */
  async setStep(ctx: AuthContext, planId: string, dto: ContinuityStepDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.requireWritable(tx, ctx, planId);
      await tx
        .insert(schema.continuityPlanStep)
        .values({
          planId,
          seq: dto.seq,
          phase: dto.phase ?? null,
          title: dto.title,
          instruction: dto.instruction ?? null,
          responsiblePersonId: dto.responsiblePersonId ?? null,
        })
        .onConflictDoUpdate({
          target: [schema.continuityPlanStep.planId, schema.continuityPlanStep.seq],
          set: {
            phase: dto.phase ?? null,
            title: dto.title,
            instruction: dto.instruction ?? null,
            responsiblePersonId: dto.responsiblePersonId ?? null,
          },
        });
      return this.loadDetail(tx, tenantId, planId);
    });
  }

  async removeStep(ctx: AuthContext, planId: string, stepId: string) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.requireWritable(tx, ctx, planId);
      await tx
        .delete(schema.continuityPlanStep)
        .where(and(eq(schema.continuityPlanStep.id, stepId), eq(schema.continuityPlanStep.planId, planId)));
      return this.loadDetail(tx, tenantId, planId);
    });
  }

  /**
   * Übung festhalten. Sie setzt zugleich die nächste Fälligkeit — so verfällt kein Plan
   * unbemerkt, und „wann zuletzt geübt?“ ist eine Abfrage statt einer Suche im Postfach.
   */
  async recordExercise(ctx: AuthContext, planId: string, dto: BcExerciseDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const plan = await this.requireWritable(tx, ctx, planId);
      await tx.insert(schema.bcExercise).values({
        tenantId,
        planId,
        heldAt: dto.heldAt,
        kind: dto.kind,
        result: dto.result ?? null,
        lessonsLearned: dto.lessonsLearned ?? null,
      });

      // Nur die jüngste Übung bestimmt die nächste Fälligkeit — Nachträge alter Übungen
      // dürfen den Termin nicht nach hinten verschieben.
      const [latest] = (
        await tx.execute(
          sql`SELECT max(held_at) AS "heldAt" FROM bc_exercise WHERE plan_id = ${planId} AND tenant_id = ${tenantId}`,
        )
      ).rows as { heldAt: string | null }[];
      const lastTestAt = latest?.heldAt ?? dto.heldAt;
      const months = dto.nextInMonths ?? plan.testIntervalMonths;
      const nextTestAt = addMonths(new Date(`${lastTestAt}T00:00:00.000Z`), months)
        .toISOString()
        .slice(0, 10);
      await tx
        .update(schema.continuityPlan)
        .set({ lastTestAt, nextTestAt })
        .where(eq(schema.continuityPlan.id, planId));
      return this.loadDetail(tx, tenantId, planId);
    });
  }

  /** Fällige und überfällige Übungen — der Aufhänger für das Jahresprogramm. */
  async dueExercises(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT cp.id AS "planId", cp.title, cp.next_test_at AS "nextTestAt", cp.last_test_at AS "lastTestAt",
               (cp.next_test_at < current_date) AS overdue,
               p.name AS "processName", b.rto_hours AS "rtoHours"
        FROM continuity_plan cp
        JOIN bia b ON b.id = cp.bia_id JOIN business_process p ON p.id = b.process_id
        WHERE cp.tenant_id = ${tenantId} AND cp.status <> 'archived'
          AND (cp.next_test_at IS NULL OR cp.next_test_at <= (current_date + 90))
        ORDER BY cp.next_test_at NULLS FIRST`);
      return res.rows;
    });
  }

  /**
   * Plan laden und prüfen, ob der Aufrufer ihn pflegen darf. Die Verantwortung hängt am
   * Prozess hinter der BIA — nicht am Plan selbst.
   */
  private async requireWritable(tx: TenantTx, ctx: AuthContext, id: string) {
    const tenantId = ctx.tenantId!;
    const plan = await this.require(tx, tenantId, id);
    const [owner] = (
      await tx.execute(sql`
        SELECT p.owner_person_id AS "ownerPersonId"
        FROM continuity_plan cp JOIN bia b ON b.id = cp.bia_id JOIN business_process p ON p.id = b.process_id
        WHERE cp.id = ${id}`)
    ).rows as { ownerPersonId: string | null }[];
    assertCan(ctx, P.CONTINUITY_WRITE, owner ?? null);
    return plan;
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [p] = await tx
      .select()
      .from(schema.continuityPlan)
      .where(and(eq(schema.continuityPlan.id, id), eq(schema.continuityPlan.tenantId, tenantId)));
    if (!p) throw new NotFoundException({ title: 'Notfallplan nicht gefunden' });
    return p;
  }
}
